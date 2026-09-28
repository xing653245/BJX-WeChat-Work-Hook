const fs = require('fs')
const path = require('path')

function readDocument(dir, name) {
  const text = fs.readFileSync(path.join(dir, name), 'utf8')
  const value = JSON.parse(text.replace(/^\uFEFF/, ''))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} 必须是 JSON 对象`)
  return { text, value }
}

function readInjectSettings(dir) {
  const settings = readDocument(dir, 'settings.json').value
  const push = readDocument(dir, 'push.json').value
  return { host: settings.host, port: settings.port, url: push.url,
    enabled: push.enabled, timeout_ms: push.timeout_ms, retries: push.retries }
}

function saveInjectSettings(dir, input) {
  const integer = (value, min, max, label) => {
    const n = Number(value)
    if (String(value).trim() === '' || !Number.isInteger(n) || n < min || n > max) throw new Error(`${label}范围为 ${min}–${max} 的整数`)
    return n
  }
  const host = String(input.host || '').trim()
  const port = integer(input.port, 1025, 10000, '企微监听端口')
  const timeout = integer(input.timeout_ms, 1, 2147483647, '回调超时（毫秒）')
  const retries = integer(input.retries, 0, 2147483647, '失败重试次数')
  if (!host || !fs.existsSync(host) || !fs.statSync(host).isFile()) throw new Error(`v5 客户端路径不存在: ${host}`)
  if (typeof input.enabled !== 'boolean') throw new Error('回调开关必须为布尔值')
  const url = String(input.url || '').trim()
  if (url || input.enabled) {
    let parsed
    try { parsed = new URL(url) } catch { throw new Error('回调地址必须为有效的 HTTP/HTTPS 地址') }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('回调地址必须使用 HTTP/HTTPS')
  }
  const settings = readDocument(dir, 'settings.json')
  const push = readDocument(dir, 'push.json')
  const documents = [
    ['settings.json', settings, { ...settings.value, host, port: typeof settings.value.port === 'number' ? port : String(port) }],
    ['push.json', push, { ...push.value, url, enabled: input.enabled, timeout_ms: timeout, retries }]
  ]
  const written = []
  const rollback = () => {
    for (const [name, original] of written.reverse()) fs.writeFileSync(path.join(dir, name), original.text, 'utf8')
  }
  try {
    for (const [name, original, next] of documents) {
      if (JSON.stringify(original.value) === JSON.stringify(next)) continue
      written.push([name, original])
      fs.writeFileSync(path.join(dir, name), JSON.stringify(next, null, 2) + '\n', 'utf8')
    }
  } catch (error) {
    rollback()
    throw error
  }
  return rollback
}

module.exports = { readInjectSettings, saveInjectSettings }
