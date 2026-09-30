const fs = require('fs')
const path = require('path')
const { writeTextAtomic } = require('../commons/atomicFile')
const { validatePkcs1Rsa1024PublicKey } = require('../commons/pkcs1PublicKey.cjs')

const SETTINGS_FILE = 'settings.json'

// 只移除字符串以外的注释，保留 URL、路径和转义引号。
function parseJsonDocument(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '')
  let cleaned = '', quoted = false, escaped = false
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i], next = raw[i + 1]
    if (quoted) {
      cleaned += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') { quoted = true; cleaned += char }
    else if (char === '/' && next === '/') {
      while (i < raw.length && raw[i] !== '\n') i++
      cleaned += '\n'
    } else if (char === '/' && next === '*') {
      const end = raw.indexOf('*/', i + 2)
      if (end < 0) throw new Error('settings.json 注释未闭合')
      cleaned += ' '
      i = end + 1
    } else cleaned += char
  }
  return JSON.parse(cleaned)
}

function readDocument(dir, name) {
  const filePath = path.join(dir, name)
  const text = fs.readFileSync(filePath, 'utf8')
  const value = parseJsonDocument(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} 必须是 JSON 对象`)
  return { text, value, filePath }
}

function parseFlag(value) {
  return value === true || value === 'true' || value === '1' || value === 1
}

function pickFirst(source, keys, fallback = '') {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key]
  }
  return fallback
}

function readInjectSettings(dir) {
  const settings = readDocument(dir, SETTINGS_FILE).value
  return {
    host: settings.host,
    url: settings.url,
    enabled: parseFlag(settings.enabled),
    timeout_ms: settings.timeout_ms,
    retries: settings.retries,
    encrypt: parseFlag(pickFirst(settings, ['Message_Encryption', 'encrypt'], false)),
    public_key: String(pickFirst(settings, ['RSA_PublicKey', 'public_key'], '')),
    is_debug: parseFlag(pickFirst(settings, ['IsDebug'], false))
  }
}

function saveInjectSettings(dir, input) {
  const integer = (value, min, max, label) => {
    const n = Number(value)
    if (String(value).trim() === '' || !Number.isInteger(n) || n < min || n > max) throw new Error(`${label}范围为 ${min}–${max} 的整数`)
    return n
  }
  const host = String(input.host || '').trim()
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
  const encrypt = parseFlag(input.encrypt)
  let public_key = String(input.public_key || '').trim()
  if (encrypt || public_key) {
    const keyCheck = validatePkcs1Rsa1024PublicKey(public_key)
    if (!keyCheck.ok) throw new Error(keyCheck.message)
    public_key = keyCheck.body
  }
  const settings = readDocument(dir, SETTINGS_FILE)
  const is_debug = Object.prototype.hasOwnProperty.call(input, 'is_debug')
    ? parseFlag(input.is_debug)
    : parseFlag(pickFirst(settings.value, ['IsDebug'], false))
  const next = {
    ...settings.value,
    enabled: input.enabled,
    url,
    timeout_ms: timeout,
    retries,
    host,
    Message_Encryption: encrypt,
    RSA_PublicKey: public_key,
    IsDebug: is_debug
  }
  delete next.encrypt
  delete next.public_key

  if (JSON.stringify(settings.value) === JSON.stringify(next)) return () => {}
  writeTextAtomic(settings.filePath, JSON.stringify(next, null, 2) + '\n')
  let rolledBack = false
  return () => {
    if (rolledBack) return
    writeTextAtomic(settings.filePath, settings.text)
    rolledBack = true
  }
}

module.exports = { readInjectSettings, saveInjectSettings, parseJsonDocument }
