const fs = require('fs')
const path = require('path')
const { writeTextAtomic } = require('../commons/atomicFile')

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
  const host = String(input.host || '').trim()
  if (!host || !fs.existsSync(host) || !fs.statSync(host).isFile()) throw new Error('v5 客户端路径不存在')
  const settings = readDocument(dir, SETTINGS_FILE)
  if (settings.value.host === host) return () => {}
  writeTextAtomic(settings.filePath, JSON.stringify({ ...settings.value, host }, null, 2) + '\n')
  let rolledBack = false
  return () => {
    if (rolledBack) return
    writeTextAtomic(settings.filePath, settings.text)
    rolledBack = true
  }
}

module.exports = { readInjectSettings, saveInjectSettings, parseJsonDocument }
