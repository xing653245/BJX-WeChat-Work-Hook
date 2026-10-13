/** 开发端工具，不随生产包分发。node scripts/decrypt-diagnostic.js 报告 私钥 输出.json */
const fs = require('fs')
const crypto = require('crypto')
const { metadata, keyId, FORMAT, ALGORITHM } = require('../electron/commons/reportEncryption.cjs')
function decodeBase64(value, size) {
  if (typeof value !== 'string' || value.length > 48 * 1024 * 1024) throw new Error('无效密文格式')
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value || (size && bytes.length !== size)) throw new Error('无效密文格式')
  return bytes
}
function openEnvelope(envelope, privateKey) {
  if (privateKey.type !== 'private' || envelope.format !== FORMAT || envelope.version !== 1 || envelope.algorithm !== ALGORITHM || envelope.keyId !== keyId(privateKey)) throw new Error('私钥不匹配或报告格式不受支持')
  const key = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, decodeBase64(envelope.wrappedKey, privateKey.asymmetricKeyDetails.modulusLength / 8))
  try {
    if (key.length !== 32) throw new Error('无效数据密钥')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, decodeBase64(envelope.nonce, 12), { authTagLength: 16 })
    decipher.setAAD(Buffer.from(JSON.stringify(metadata(envelope.keyId))))
    decipher.setAuthTag(decodeBase64(envelope.tag, 16))
    const plaintext = Buffer.concat([decipher.update(decodeBase64(envelope.ciphertext)), decipher.final()])
    return JSON.parse(plaintext.toString('utf8'))
  } finally { key.fill(0) }
}
function decryptReport(envelope, privateKey) {
  const value = openEnvelope(envelope, privateKey)
  if (value.kind === 'report') {
    return { ...value, logs: value.logs.map(item => ({ name: item.name, records: item.records.map(record => openEnvelope(record, privateKey)) })) }
  }
  return value
}
if (require.main === module) {
  try {
    const [input, keyFile, output] = process.argv.slice(2)
    if (!input || !keyFile || !output) throw new Error('用法：node scripts/decrypt-diagnostic.js 报告.vdiag 私钥.pem 输出.json')
    if (fs.statSync(input).size > 32 * 1024 * 1024) throw new Error('报告超过大小限制')
    const key = crypto.createPrivateKey(fs.readFileSync(keyFile))
    const report = decryptReport(JSON.parse(fs.readFileSync(input, 'utf8')), key)
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
    console.log('解密成功，结果已保存：' + output)
  } catch (error) {
    console.error('解密失败：私钥不匹配、文件被修改或路径不可用。' + (error.code === 'EEXIST' ? '输出文件已存在，请换一个文件名。' : ''))
    process.exitCode = 1
  }
}
module.exports = { decryptReport, openEnvelope }
