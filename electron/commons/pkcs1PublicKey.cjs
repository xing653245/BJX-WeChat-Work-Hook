const crypto = require('crypto')

const PKCS1_BEGIN = '-----BEGIN RSA PUBLIC KEY-----'
const PKCS1_END = '-----END RSA PUBLIC KEY-----'
const SPKI_BEGIN = '-----BEGIN PUBLIC KEY-----'
const SPKI_END = '-----END PUBLIC KEY-----'
const EXPECTED_BITS = 1024

function compactBase64(value) {
  return String(value || '').replace(/\s+/g, '')
}

function isStrictBase64(value) {
  const compact = compactBase64(value)
  if (!compact || compact.length % 4 !== 0) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return false
  const buf = Buffer.from(compact, 'base64')
  const pad = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0
  return buf.length === (compact.length / 4) * 3 - pad
}

function normalizeRsaPublicKeyBase64(raw) {
  const text = String(raw || '').trim().replace(/\r\n/g, '\n')
  if (!text) {
    return { ok: false, message: '请填写加密公钥' }
  }
  if (/-----BEGIN RSA PRIVATE KEY-----/.test(text) || /-----BEGIN PRIVATE KEY-----/.test(text)) {
    return { ok: false, message: '请填写 RSA 加密公钥，不要填写私钥' }
  }
  if (/-----BEGIN PUBLIC KEY-----/.test(text) || /-----END PUBLIC KEY-----/.test(text) ||
      /-----BEGIN RSA PUBLIC KEY-----/.test(text) || /-----END RSA PUBLIC KEY-----/.test(text)) {
    return { ok: false, message: '只填写 Base64 公钥，不要包含 BEGIN/END PUBLIC KEY' }
  }
  if (/-----BEGIN /.test(text)) {
    return { ok: false, message: '只填写 Base64 公钥，不要包含 BEGIN/END PUBLIC KEY' }
  }
  const body = compactBase64(text)
  if (!isStrictBase64(body)) {
    return { ok: false, message: '加密公钥内容须为 Base64' }
  }
  return { ok: true, body }
}

function loadRsaPublicKey(body) {
  const attempts = [
    { type: 'spki', begin: SPKI_BEGIN, end: SPKI_END },
    { type: 'pkcs1', begin: PKCS1_BEGIN, end: PKCS1_END }
  ]
  let lastError
  for (const attempt of attempts) {
    try {
      return crypto.createPublicKey({
        key: `${attempt.begin}\n${body}\n${attempt.end}`,
        format: 'pem',
        type: attempt.type
      })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('invalid public key')
}

function validatePkcs1Rsa1024PublicKey(raw) {
  const extracted = normalizeRsaPublicKeyBase64(raw)
  if (!extracted.ok) return extracted
  try {
    const key = loadRsaPublicKey(extracted.body)
    if (key.asymmetricKeyType !== 'rsa') {
      return { ok: false, message: '加密公钥须为 1024 bit、PKCS#1 格式的 RSA 加密公钥' }
    }
    const bits = key.asymmetricKeyDetails?.modulusLength
    if (bits !== EXPECTED_BITS) {
      return { ok: false, message: `加密公钥须为 1024 bit，当前为 ${bits || '未知'} bit` }
    }
    return { ok: true, body: extracted.body }
  } catch {
    return { ok: false, message: '加密公钥须为 1024 bit、PKCS#1 格式的 RSA 加密公钥' }
  }
}

module.exports = {
  validatePkcs1Rsa1024PublicKey
}
