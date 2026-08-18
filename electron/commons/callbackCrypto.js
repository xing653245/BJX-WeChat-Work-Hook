/**
 * 回调推送 AES-256-GCM 加解密
 *
 * 加密开启后，POST 到用户回调地址的 JSON 形态为：
 * {
 *   encrypted: true,
 *   alg: "AES-256-GCM",
 *   iv: "<Base64 12字节>",
 *   tag: "<Base64 16字节>",
 *   ciphertext: "<Base64>"
 * }
 *
 * 密钥为 32 字节，设置页与 conf.ini 中以 64 位十六进制保存。
 */
const crypto = require('crypto')

const ALG = 'aes-256-gcm'
const ALG_NAME = 'AES-256-GCM'
const IV_LEN = 12
const KEY_LEN = 32
const KEY_HEX_LEN = KEY_LEN * 2

function generateCallbackEncryptKey() {
  return crypto.randomBytes(KEY_LEN).toString('hex')
}

function decodeCallbackEncryptKey(raw) {
  const hex = String(raw || '').trim()
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('加密密钥必须是 64 位十六进制（32 字节）')
  }
  return Buffer.from(hex, 'hex')
}

function isValidCallbackEncryptKey(raw) {
  try {
    decodeCallbackEncryptKey(raw)
    return true
  } catch {
    return false
  }
}

function isEncryptedCallbackBody(body) {
  return Boolean(
    body &&
    body.encrypted === true &&
    body.alg &&
    body.iv &&
    body.tag &&
    body.ciphertext
  )
}

function encryptCallbackPayload(data, keyHex) {
  const key = decodeCallbackEncryptKey(keyHex)
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALG, key, iv)
  const plaintext = Buffer.from(JSON.stringify(data ?? {}), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    encrypted: true,
    alg: ALG_NAME,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }
}

function decryptCallbackPayload(body, keyHex) {
  if (!isEncryptedCallbackBody(body)) {
    return body
  }
  const key = decodeCallbackEncryptKey(keyHex)
  const iv = Buffer.from(body.iv, 'base64')
  const tag = Buffer.from(body.tag, 'base64')
  const ciphertext = Buffer.from(body.ciphertext, 'base64')
  if (iv.length !== IV_LEN) {
    throw new Error('加密数据 IV 长度无效')
  }
  const decipher = crypto.createDecipheriv(ALG, key, iv)
  decipher.setAuthTag(tag)
  const json = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  return JSON.parse(json)
}

module.exports = {
  ALG_NAME,
  KEY_HEX_LEN,
  generateCallbackEncryptKey,
  isValidCallbackEncryptKey,
  isEncryptedCallbackBody,
  encryptCallbackPayload,
  decryptCallbackPayload
}
