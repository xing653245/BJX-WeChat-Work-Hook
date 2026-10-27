const fs = require('fs')
const crypto = require('crypto')
const { sealReport } = require('../commons/reportEncryption.cjs')
const { ReportError, parseReportBytes } = require('../commons/reportValidation.cjs')
const { writeTextAtomic } = require('../commons/atomicFile')

// 不需要私钥：回读必须与内存中的完整密文逐字节一致，且通过报告格式校验。
function exportDiagnosticReport(file, payload, publicKey) {
  const expected = Buffer.from(JSON.stringify(sealReport(payload, publicKey)), 'utf8')
  parseReportBytes(expected)
  const verify = target => {
    const actual = fs.readFileSync(target)
    parseReportBytes(actual)
    if (!actual.equals(expected)) throw new ReportError('REPORT_WRITE_MISMATCH', '报告写入后内容与生成内容不一致，完整性校验失败')
  }
  // 临时文件校验失败时，不替换已存在的报告。
  writeTextAtomic(file, expected, { verify })
  try { verify(file) }
  catch (error) {
    // 最终文件也必须回读；校验失败不能提示成功或留下新的无效报告。
    try { fs.unlinkSync(file) }
    catch { throw new ReportError('REPORT_CLEANUP_FAILED', '报告完整性校验失败，且无法移除无效文件；请删除本次报告并更换保存目录后重试') }
    throw error
  }
  return { bytes: expected.length, sha256: crypto.createHash('sha256').update(expected).digest('hex') }
}

function exportFailureMessage(error) {
  if (error instanceof ReportError) return `故障报告导出失败：${error.message}`
  if (error?.code === 'ENOSPC') return '故障报告导出失败：磁盘空间不足，请清理空间或更换保存目录'
  if (['EACCES', 'EPERM', 'EBUSY'].includes(error?.code)) return '故障报告导出失败：保存位置无权限或文件被占用，请更换目录后重试'
  if (error?.code === 'ENOENT') return '故障报告导出失败：保存目录或诊断源文件不存在，请确认目录后重试'
  if (error instanceof SyntaxError) return '故障报告导出失败：本地诊断记录格式损坏，请联系技术支持检查源日志'
  return '故障报告生成、写入或校验失败，请更换保存目录后重试；仍失败请联系技术支持'
}

module.exports = { exportDiagnosticReport, exportFailureMessage }
