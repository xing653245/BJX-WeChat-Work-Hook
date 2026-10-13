const crypto = require('crypto')
const FORMAT = 'vwork-diagnostic'
const ALGORITHM = 'RSA-OAEP-SHA256+A256GCM'
function keyId(key) {
  const publicKey = key.type === 'public' ? key : crypto.createPublicKey(key)
  return crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex')
}
function loadReportPublicKey(config = require('../configs/diagnosticPublicKey.json')) {
  const key = crypto.createPublicKey({ key: Buffer.from(config.publicKey, 'base64'), format: 'der', type: 'spki' })
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 3072 || keyId(key) !== config.keyId) {
    throw new Error('故障报告公钥配置无效')
  }
  return key
}
function metadata(id) { return { format: FORMAT, version: 1, algorithm: ALGORITHM, keyId: id } }
function sealReport(value, publicKey) {
  if (!publicKey || publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails.modulusLength < 3072) throw new Error('需要故障报告专用 RSA 公钥')
  const key = crypto.randomBytes(32)
  const nonce = crypto.randomBytes(12)
  const header = metadata(keyId(publicKey))
  try {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 })
    cipher.setAAD(Buffer.from(JSON.stringify(header)))
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    return {
      ...header,
      wrappedKey: crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key).toString('base64'),
      nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64')
    }
  } finally { key.fill(0) }
}
module.exports = { sealReport, loadReportPublicKey, keyId, metadata, FORMAT, ALGORITHM }
