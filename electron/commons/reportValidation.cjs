const { FORMAT, ALGORITHM } = require('./reportEncryption.cjs')
const MAX_REPORT_BYTES = 32 * 1024 * 1024

class ReportError extends Error {
  constructor(code, message) { super(message); this.name = 'ReportError'; this.code = code }
}

function decodeBase64(value, field, size) {
  if (typeof value !== 'string' || !value.length) {
    throw new ReportError('REPORT_FIELD_INVALID', `报告字段 ${field} 缺失`)
  }
  if (value.length > 48 * 1024 * 1024) {
    throw new ReportError('REPORT_FIELD_INVALID', `报告字段 ${field} 超出长度限制`)
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) {
    throw new ReportError('REPORT_FIELD_INVALID', `报告字段 ${field} 不是有效的 Base64`)
  }
  if (size && bytes.length !== size) {
    throw new ReportError('REPORT_FIELD_INVALID', `报告字段 ${field} 解码后长度为 ${bytes.length}，应为 ${size}`)
  }
  return bytes
}

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || envelope.format !== FORMAT) {
    throw new ReportError('REPORT_FORMAT_INVALID', '文件不是受支持的 vwork 加密故障报告，请确认选择的是原始 .vdiag 文件')
  }
  if (envelope.version !== 1) throw new ReportError('REPORT_VERSION_UNSUPPORTED', '报告版本不受支持，请使用与框架版本匹配的解密工具')
  if (envelope.algorithm !== ALGORITHM) throw new ReportError('REPORT_ALGORITHM_UNSUPPORTED', '报告加密算法不受支持')
  if (typeof envelope.keyId !== 'string' || !envelope.keyId) {
    throw new ReportError('REPORT_FIELD_INVALID', '报告缺少密钥标识 keyId')
  }
  if (!/^[a-f0-9]{64}$/.test(envelope.keyId)) {
    throw new ReportError('REPORT_FIELD_INVALID', '报告的密钥标识 keyId 格式无效')
  }
  decodeBase64(envelope.wrappedKey, 'wrappedKey')
  decodeBase64(envelope.nonce, 'nonce', 12)
  decodeBase64(envelope.tag, 'tag', 16)
  decodeBase64(envelope.ciphertext, 'ciphertext')
  return envelope
}

function parseReportBytes(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes)
  if (!bytes.length) throw new ReportError('REPORT_EMPTY', '报告为空文件（0 字节），请重新导出或重新获取原始文件')
  if (bytes.length > MAX_REPORT_BYTES) throw new ReportError('REPORT_TOO_LARGE', '报告超过 32 MiB 大小限制')
  if (bytes.every(value => value === 0)) {
    throw new ReportError('REPORT_ZERO_FILLED', `报告全部为 0x00 空字节（${bytes.length} 字节），没有有效密文；请检查原文件及传输、保存环节后重新获取`)
  }
  let envelope
  try { envelope = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) }
  catch { throw new ReportError('REPORT_JSON_INVALID', '报告内容不是合法的 JSON') }
  return validateEnvelope(envelope)
}

module.exports = { MAX_REPORT_BYTES, ReportError, decodeBase64, validateEnvelope, parseReportBytes }
