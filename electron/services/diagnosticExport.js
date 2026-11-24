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
  if (error?.code === 'ENOSPC') return '故障报告导出失败：磁盘空间不足，无法继续写入'
  if (error?.code === 'EACCES') return '故障报告导出失败：没有写入权限'
  if (error?.code === 'EPERM') return '故障报告导出失败：系统拒绝写入'
  if (error?.code === 'EBUSY') return '故障报告导出失败：目标文件正被占用'
  if (error?.code === 'ENOENT') return '故障报告导出失败：保存目录不存在'
  if (error?.code === 'EROFS') return '故障报告导出失败：保存位置只读'
  if (error instanceof SyntaxError) return '故障报告导出失败：本地诊断记录不是合法的数据格式'
  return '故障报告导出失败：' + require('../commons/diagnostics.cjs').userMessage(error, '没有得到具体原因')
}

module.exports = { exportDiagnosticReport, exportFailureMessage }
