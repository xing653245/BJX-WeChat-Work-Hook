/** 开发端工具，不随生产包分发。node scripts/decrypt-diagnostic.js 报告 私钥 输出.json */
const fs = require('fs')
const crypto = require('crypto')
const { metadata, keyId } = require('../electron/commons/reportEncryption.cjs')
const { ReportError, MAX_REPORT_BYTES, decodeBase64, validateEnvelope, parseReportBytes } = require('../electron/commons/reportValidation.cjs')
function openEnvelope(envelope, privateKey) {
  validateEnvelope(envelope)
  if (privateKey?.type !== 'private' || privateKey.asymmetricKeyType !== 'rsa') throw new ReportError('KEY_INVALID', '提供的密钥不是 RSA 私钥，请选择 diagnostic-private.pem')
  if (envelope.keyId !== keyId(privateKey)) throw new ReportError('KEY_MISMATCH', '私钥与报告的密钥标识不匹配，请使用生成该报告所用公钥对应的私钥')
  let key
  try {
    key = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, decodeBase64(envelope.wrappedKey, 'wrappedKey', privateKey.asymmetricKeyDetails.modulusLength / 8))
  } catch (error) {
    if (error instanceof ReportError) throw error
    throw new ReportError('KEY_UNWRAP_FAILED', '报告的数据密钥无法解开')
  }
  try {
    if (key.length !== 32) throw new ReportError('KEY_LENGTH_INVALID', '解出的数据密钥长度无效，报告内容异常')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, decodeBase64(envelope.nonce, 'nonce', 12), { authTagLength: 16 })
    decipher.setAAD(Buffer.from(JSON.stringify(metadata(envelope.keyId))))
    decipher.setAuthTag(decodeBase64(envelope.tag, 'tag', 16))
    let plaintext
    try { plaintext = Buffer.concat([decipher.update(decodeBase64(envelope.ciphertext, 'ciphertext')), decipher.final()]) }
    catch (error) {
      if (error instanceof ReportError) throw error
      throw new ReportError('REPORT_AUTH_FAILED', '报告完整性认证失败，密文与认证标签不一致')
    }
    try { return JSON.parse(plaintext.toString('utf8')) }
    catch { throw new ReportError('REPORT_PAYLOAD_INVALID', '解密后的内容不是有效 JSON，报告生成内容异常') }
  } finally { key.fill(0) }
}
function decryptReport(envelope, privateKey) {
  const value = openEnvelope(envelope, privateKey)
  if (value?.kind === 'report') {
    if (!Array.isArray(value.logs)) throw new ReportError('REPORT_LOGS_INVALID', '解密后的报告缺少有效日志列表')
    return { ...value, logs: value.logs.map((item, index) => {
      if (!item || typeof item.name !== 'string' || !Array.isArray(item.records)) throw new ReportError('REPORT_LOGS_INVALID', `第 ${index + 1} 个日志文件的结构无效`)
      return { name: item.name, records: item.records.map((record, recordIndex) => {
        try { return openEnvelope(record, privateKey) }
        catch (error) {
          if (error instanceof ReportError) throw new ReportError(error.code, `第 ${index + 1} 个日志文件、第 ${recordIndex + 1} 条记录：${error.message}`)
          throw error
        }
      }) }
    }) }
  }
  return value
}

function describeFailure(error, stage) {
  if (error instanceof ReportError) return `[${error.code}] ${error.message}`
  const reasons = {
    ENOENT: '路径不存在',
    EACCES: '没有读取或写入权限',
    EPERM: '系统拒绝了该操作',
    EISDIR: '指定的是文件夹，请填写完整文件路径',
    ENOTDIR: '路径中的某一级不是文件夹，请检查路径',
    EEXIST: '输出文件已存在，为避免覆盖已停止；请换一个输出文件名',
    ENOSPC: '输出磁盘空间不足',
    EBUSY: '文件被占用，请关闭占用程序后重试',
    EIO: '读写时发生磁盘错误'
  }
  return `[${error?.code || 'UNEXPECTED_ERROR'}] ${stage}失败：${reasons[error?.code] || error?.message || '没有更具体的系统错误码'}`
}

function decryptFile(input, keyFile, output) {
  let stage = '检查参数'
  try {
    if (!input || !keyFile || !output) throw new ReportError('USAGE', '用法：node scripts/decrypt-diagnostic.js 报告.vdiag 私钥.pem 输出.json')
    stage = '读取报告'
    if (fs.statSync(input).size > MAX_REPORT_BYTES) throw new ReportError('REPORT_TOO_LARGE', '报告超过 32 MiB 大小限制')
    const envelope = parseReportBytes(fs.readFileSync(input))
    stage = '读取私钥'
    const keyBytes = fs.readFileSync(keyFile)
    let key
    try { key = crypto.createPrivateKey(keyBytes) }
    catch { throw new ReportError('KEY_INVALID', '私钥文件无法解析，请确认是有效 PEM 私钥；带口令私钥需先在受信环境中解锁') }
    stage = '解密报告'
    const report = decryptReport(envelope, key)
    stage = '写入解密结果'
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
    return report
  } catch (error) {
    throw new Error(describeFailure(error, stage))
  }
}
if (require.main === module) {
  try {
    const [input, keyFile, output] = process.argv.slice(2)
    decryptFile(input, keyFile, output)
    console.log('解密成功，结果已保存：' + output)
  } catch (error) {
    console.error('解密失败：' + error.message)
    process.exitCode = 1
  }
}
module.exports = { decryptReport, openEnvelope, decryptFile }
