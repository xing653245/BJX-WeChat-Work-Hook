const crypto = require('crypto')

const PKCS1_BEGIN = '-----BEGIN RSA PUBLIC KEY-----'
const PKCS1_END = '-----END RSA PUBLIC KEY-----'
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

function extractPkcs1Body(raw) {
  const text = String(raw || '').trim().replace(/\r\n/g, '\n')
  if (!text) {
    return { ok: false, message: '请填写加密公钥' }
  }
  if (/-----BEGIN RSA PRIVATE KEY-----/.test(text) || /-----BEGIN PRIVATE KEY-----/.test(text)) {
    return { ok: false, message: '加密公钥须为 PKCS#1 格式（-----BEGIN RSA PUBLIC KEY-----）' }
  }
  if (/-----BEGIN PUBLIC KEY-----/.test(text)) {
    return { ok: false, message: '加密公钥须为 PKCS#1 格式（-----BEGIN RSA PUBLIC KEY-----）' }
  }
  const pem = text.match(/-----BEGIN RSA PUBLIC KEY-----\s*([\s\S]*?)\s*-----END RSA PUBLIC KEY-----/)
  let body
  if (pem) {
    body = compactBase64(pem[1])
  } else if (/-----BEGIN /.test(text)) {
    return { ok: false, message: '加密公钥须为 PKCS#1 格式（-----BEGIN RSA PUBLIC KEY-----）' }
  } else {
    body = compactBase64(text)
  }
  if (!isStrictBase64(body)) {
    return { ok: false, message: '加密公钥内容须为 Base64' }
  }
  return { ok: true, body }
}

function validatePkcs1Rsa1024PublicKey(raw) {
  const extracted = extractPkcs1Body(raw)
  if (!extracted.ok) return extracted
  const pem = `${PKCS1_BEGIN}\n${extracted.body}\n${PKCS1_END}`
  try {
    const key = crypto.createPublicKey({ key: pem, format: 'pem', type: 'pkcs1' })
    if (key.asymmetricKeyType !== 'rsa') {
      return { ok: false, message: '加密公钥须为 PKCS#1 RSA 公钥' }
    }
    const bits = key.asymmetricKeyDetails?.modulusLength
    if (bits !== EXPECTED_BITS) {
      return { ok: false, message: `加密公钥须为 ${EXPECTED_BITS} bits，当前为 ${bits || '未知'} bits` }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: '加密公钥不是有效的 PKCS#1 RSA 公钥' }
  }
}

function assertPkcs1Rsa1024PublicKey(raw) {
  const result = validatePkcs1Rsa1024PublicKey(raw)
  if (!result.ok) throw new Error(result.message)
}

module.exports = {
  EXPECTED_BITS,
  validatePkcs1Rsa1024PublicKey,
  assertPkcs1Rsa1024PublicKey
}
