const { execFile } = require('child_process')
const axios = require('axios')

function command(file, args) {
  return new Promise((resolve, reject) => execFile(file, args, { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 },
    (error, stdout) => error ? reject(error) : resolve(stdout)))
}

async function snapshot() {
  if (process.platform !== 'win32') throw new Error('企微进程检测仅支持 Windows')
  const [raw, netstat] = await Promise.all([
    command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "@(Get-CimInstance Win32_Process -Filter \"Name = 'WXWork.exe'\" -ErrorAction Stop | Select-Object ProcessId,ParentProcessId) | ConvertTo-Json -Compress"]),
    command('netstat.exe', ['-ano', '-p', 'tcp'])
  ])
  const parsed = raw.trim() ? JSON.parse(raw.replace(/^\uFEFF/, '')) : []
  return { processes: Array.isArray(parsed) ? parsed : [parsed], netstat }
}

// 只探测 WXWork.exe 拥有的本地监听端口，不能把其他应用的 HTTP 服务当成企微。
function candidates({ processes, netstat }) {
  const parents = new Map(processes.map(p => [Number(p.ProcessId), Number(p.ParentProcessId)]))
  function root(pid) {
    const seen = new Set()
    while (parents.has(parents.get(pid)) && !seen.has(pid)) { seen.add(pid); pid = parents.get(pid) }
    return pid
  }
  const ports = new Map()
  for (const line of String(netstat).split(/\r?\n/)) {
    const [protocol, local, , state, rawPid] = line.trim().split(/\s+/)
    const pid = Number(rawPid)
    if (protocol !== 'TCP' || state !== 'LISTENING' || !parents.has(pid)) continue
    const match = local.match(/^(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|\[::1\]):(\d+)$/)
    const port = Number(match?.[1])
    if (port > 1024 && port <= 10000) ports.set(port, { port, pid, rootPid: root(pid) })
  }
  return { ports: [...ports.values()], roots: [...new Set([...parents.keys()].map(root))] }
}

async function probe(port) {
  const { data } = await axios.post(`http://127.0.0.1:${port}/api`, { type: 1000 },
    { timeout: 1500, proxy: false, maxRedirects: 0 })
  const status = data?.data?.status
  if (![0, 1, false, true, '0', '1'].includes(status)) return null
  return { loggedIn: Number(status) === 1 }
}

function createWecomDiscovery({ readSnapshot = snapshot, probePort = probe } = {}) {
  let pending
  return function discover() {
    if (pending) return pending
    pending = (async () => {
      const { ports, roots } = candidates(await readSnapshot())
      const instances = []
      let index = 0
      await Promise.all(Array.from({ length: Math.min(4, ports.length) }, async () => {
        while (index < ports.length) {
          const item = ports[index++]
          try { const state = await probePort(item.port); if (state) instances.push({ ...item, ...state }) } catch { /* 未注入或接口尚未就绪 */ }
        }
      }))
      const managed = new Set(instances.map(item => item.rootPid))
      return { instances: instances.sort((a, b) => a.port - b.port), unmanagedPids: roots.filter(pid => !managed.has(pid)) }
    })().finally(() => { pending = null })
    return pending
  }
}

const discoverWecom = createWecomDiscovery()
module.exports = { discoverWecom, createWecomDiscovery, candidates }
