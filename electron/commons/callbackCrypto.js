/**
 * 回调推送纯 RSA-OAEP 加解密（无 AES）
 *
 * 加密开启后，POST 到用户回调地址的 JSON 形态为：
 * {
 *   encrypted: true,
 *   alg: "RSA-OAEP-SHA256",
 *   chunks: ["<Base64>", "..."]  // 明文按块 RSA 加密后的密文列表
 * }
 *
 * 说明：RSA-OAEP(SHA-256) 单次可加密约 190 字节（2048 位密钥），
 * 因此将 UTF-8 JSON 明文分块后逐块 publicEncrypt，解密时按序 privateDecrypt 再拼接。
 *
 * 配置中：
 * - callback_encrypt_key：RSA 公钥 PEM（框架加密用）
 * - callback_encrypt_private_key：RSA 私钥 PEM（回调服务解密用）
 * ini 中换行存为字面量 \n。
 */
const crypto = require('crypto')

const ALG_NAME = 'RSA-OAEP-SHA256'
const RSA_MODULUS_BITS = 2048
/** OAEP SHA-256：max = floor(nBits/8) - 2*hashLen - 2 = 256 - 64 - 2 */
const RSA_OAEP_MAX_PLAIN_BYTES = Math.floor(RSA_MODULUS_BITS / 8) - 2 * 32 - 2

const RSA_OAEP_OPTIONS = {
  padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: 'sha256'
}

function normalizePem(raw) {
  return String(raw || '')
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
}

/** 写入 conf.ini 时把 PEM 压成单行 */
function encodePemForIni(pem) {
  return normalizePem(pem).replace(/\n/g, '\\n')
}

/** 从 conf.ini / 表单读出 PEM */
function decodePemFromIni(raw) {
  return normalizePem(raw)
}

function generateCallbackEncryptKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: RSA_MODULUS_BITS,
    publicExponent: 0x10001,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  return {
    publicKey: normalizePem(publicKey),
    privateKey: normalizePem(privateKey)
  }
}

/** @deprecated 兼容旧调用名；请用 generateCallbackEncryptKeyPair */
function generateCallbackEncryptKey() {
  return generateCallbackEncryptKeyPair().publicKey
}

function isValidCallbackEncryptPublicKey(raw) {
  try {
    const pem = decodePemFromIni(raw)
    if (!pem.includes('BEGIN PUBLIC KEY')) return false
    const key = crypto.createPublicKey(pem)
    return key.asymmetricKeyType === 'rsa'
  } catch {
    return false
  }
}

function isValidCallbackEncryptPrivateKey(raw) {
  try {
    const pem = decodePemFromIni(raw)
    if (!/BEGIN (?:RSA )?PRIVATE KEY/.test(pem)) return false
    const key = crypto.createPrivateKey(pem)
    return key.asymmetricKeyType === 'rsa'
  } catch {
    return false
  }
}

/** 框架侧校验「加密公钥」；旧名保留给 common.js */
function isValidCallbackEncryptKey(raw) {
  return isValidCallbackEncryptPublicKey(raw)
}

function isEncryptedCallbackBody(body) {
  return Boolean(
    body &&
    body.encrypted === true &&
    body.alg &&
    Array.isArray(body.chunks) &&
    body.chunks.length > 0
  )
}

function encryptCallbackPayload(data, publicKeyPem) {
  const publicKey = crypto.createPublicKey(decodePemFromIni(publicKeyPem))
  const plaintext = Buffer.from(JSON.stringify(data ?? {}), 'utf8')
  const chunks = []
  for (let offset = 0; offset < plaintext.length; offset += RSA_OAEP_MAX_PLAIN_BYTES) {
    const slice = plaintext.subarray(offset, offset + RSA_OAEP_MAX_PLAIN_BYTES)
    const enc = crypto.publicEncrypt({ key: publicKey, ...RSA_OAEP_OPTIONS }, slice)
    chunks.push(enc.toString('base64'))
  }
  // 空 JSON 对象 "{}" 也会至少一块；若明文为空仍给一块空加密
  if (chunks.length === 0) {
    const enc = crypto.publicEncrypt(
      { key: publicKey, ...RSA_OAEP_OPTIONS },
      Buffer.alloc(0)
    )
    chunks.push(enc.toString('base64'))
  }
  return {
    encrypted: true,
    alg: ALG_NAME,
    chunks
  }
}

function decryptCallbackPayload(body, privateKeyPem) {
  if (!isEncryptedCallbackBody(body)) {
    return body
  }
  const privateKey = crypto.createPrivateKey(decodePemFromIni(privateKeyPem))
  const parts = body.chunks.map((chunk) =>
    crypto.privateDecrypt(
      { key: privateKey, ...RSA_OAEP_OPTIONS },
      Buffer.from(chunk, 'base64')
    )
  )
  const json = Buffer.concat(parts).toString('utf8')
  return JSON.parse(json || '{}')
}

module.exports = {
  ALG_NAME,
  RSA_MODULUS_BITS,
  RSA_OAEP_MAX_PLAIN_BYTES,
  generateCallbackEncryptKeyPair,
  generateCallbackEncryptKey,
  encodePemForIni,
  decodePemFromIni,
  isValidCallbackEncryptKey,
  isValidCallbackEncryptPublicKey,
  isValidCallbackEncryptPrivateKey,
  isEncryptedCallbackBody,
  encryptCallbackPayload,
  decryptCallbackPayload
}
