/**
 * 解析 netstat 输出，避免 findstr :port 误匹配 85530 / 对端端口。
 */

function parseNetstatListeningPids(stdout, port) {
  const pids = new Set()
  const suffix = `:${Number(port)}`
  if (!suffix || suffix === ':NaN') return []
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 5) continue
    const state = parts[3] || ''
    if (!/^LISTENING$/i.test(state)) continue
    const local = parts[1] || ''
    if (local === suffix || local.endsWith(suffix)) {
      const pid = parseInt(parts[parts.length - 1], 10)
      if (pid > 0) pids.add(pid)
    }
  }
  return [...pids]
}

function parseNetstatLocalPids(stdout, port) {
  const pids = new Set()
  const suffix = `:${Number(port)}`
  if (!suffix || suffix === ':NaN') return []
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 4) continue
    const local = parts[1] || ''
    if (local === suffix || local.endsWith(suffix)) {
      const pid = parseInt(parts[parts.length - 1], 10)
      if (pid > 0) pids.add(pid)
    }
  }
  return [...pids]
}

module.exports = {
  parseNetstatListeningPids,
  parseNetstatLocalPids
}
