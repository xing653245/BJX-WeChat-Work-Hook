/**
 * 企微 Hook 的 --my_port 与框架「监听端口」可能不一致。
 * 改监听端口不会重注入已运行的企微，需在旧端口继续接收 POST /msg，
 * 否则 Hook 回包变慢，设置页会出现 timeout of 10000ms exceeded，但消息已发出。
 */

const HOOK_PORT_MIN = 1025
const HOOK_PORT_MAX = 10000

/** 历史上常用的框架默认监听端口（升级前配置里可能没有 my_port） */
const FALLBACK_HOOK_COMPAT_PORTS = [8868, 8888]

function isValidHookPort(port) {
  const n = parseInt(port, 10)
  return !Number.isNaN(n) && n >= HOOK_PORT_MIN && n <= HOOK_PORT_MAX
}

function parsePortList(raw) {
  const text = String(raw || '').trim()
  if (!text) return []
  const seen = new Set()
  const ports = []
  for (const part of text.split(/[,;\s]+/)) {
    if (!isValidHookPort(part)) continue
    const n = parseInt(part, 10)
    if (seen.has(n)) continue
    seen.add(n)
    ports.push(n)
  }
  return ports
}

function formatPortList(ports) {
  const seen = new Set()
  const out = []
  for (const p of ports || []) {
    if (!isValidHookPort(p)) continue
    const n = parseInt(p, 10)
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out.join(',')
}

function mergeCompatPorts(existingRaw, portToAdd) {
  const ports = parsePortList(existingRaw)
  if (isValidHookPort(portToAdd)) {
    const n = parseInt(portToAdd, 10)
    if (!ports.includes(n)) ports.push(n)
  }
  return formatPortList(ports)
}

function parseLoginInfoList(config) {
  const raw = config?.custom?.login_info
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    let text = raw.trim()
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      text = text.slice(1, -1)
    }
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

function stampLoginInfoMyPort(list, oldListenPort) {
  if (!isValidHookPort(oldListenPort) || !Array.isArray(list)) return list || []
  const stamped = String(parseInt(oldListenPort, 10))
  return list.map((item) => {
    if (!item || typeof item !== 'object') return item
    if (item.my_port != null && String(item.my_port).trim() !== '') return item
    return { ...item, my_port: stamped }
  })
}

/**
 * 需要额外 listen 的端口：已注入企微仍会向这些端口 POST /msg
 */
function collectHookCompatListenPorts(config, primaryPort) {
  const primary = parseInt(primaryPort, 10)
  const loginInfo = parseLoginInfoList(config)
  const wecomPorts = new Set()
  for (const item of loginInfo) {
    const p = parseInt(item?.port, 10)
    if (!Number.isNaN(p) && p > 0) wecomPorts.add(p)
  }

  const extras = new Set()
  let missingMyPort = false

  for (const item of loginInfo) {
    const mp = parseInt(item?.my_port, 10)
    if (!isValidHookPort(mp)) {
      missingMyPort = true
      continue
    }
    if (mp !== primary && !wecomPorts.has(mp)) extras.add(mp)
  }

  for (const p of parsePortList(config?.sys?.hook_compat_ports)) {
    if (p !== primary && !wecomPorts.has(p)) extras.add(p)
  }

  if (missingMyPort && loginInfo.length > 0) {
    for (const p of FALLBACK_HOOK_COMPAT_PORTS) {
      if (p !== primary && !wecomPorts.has(p)) extras.add(p)
    }
  }

  return [...extras]
}

function stringifyLoginInfoForIni(list) {
  return JSON.stringify(Array.isArray(list) ? list : [])
}

/**
 * 监听端口变更时：记下旧端口，并给尚未记录 my_port 的企微实例补上。
 */
function applyListenPortChangeToConfig(prevConfig, nextConfig) {
  const oldPort = parseInt(prevConfig?.sys?.server_port, 10)
  const newPort = parseInt(nextConfig?.sys?.server_port, 10)
  if (!isValidHookPort(oldPort) || !isValidHookPort(newPort) || oldPort === newPort) {
    return nextConfig
  }

  const incomingList = parseLoginInfoList(nextConfig)
  const stamped = stampLoginInfoMyPort(incomingList, oldPort)
  const incomingWasArray = Array.isArray(nextConfig?.custom?.login_info)

  return {
    ...nextConfig,
    sys: {
      ...(nextConfig.sys || {}),
      hook_compat_ports: mergeCompatPorts(nextConfig?.sys?.hook_compat_ports || prevConfig?.sys?.hook_compat_ports, oldPort)
    },
    custom: {
      ...(nextConfig.custom || {}),
      login_info: incomingWasArray ? stamped : stringifyLoginInfoForIni(stamped)
    }
  }
}

module.exports = {
  HOOK_PORT_MIN,
  HOOK_PORT_MAX,
  FALLBACK_HOOK_COMPAT_PORTS,
  isValidHookPort,
  parsePortList,
  formatPortList,
  mergeCompatPorts,
  parseLoginInfoList,
  stampLoginInfoMyPort,
  collectHookCompatListenPorts,
  applyListenPortChangeToConfig
}
