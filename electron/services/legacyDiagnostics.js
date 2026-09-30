const fs = require('fs/promises')
const path = require('path')
const { sealReport } = require('../commons/reportEncryption.cjs')
const { redactText } = require('../commons/diagnostics.cjs')

// 只迁移本应用旧版的三个诊断文件；密文写入成功且源文件未变化才移除旧明文。
async function migrateLegacyDiagnostics(userData, publicKey) {
  const directory = path.join(userData, 'diagnostics')
  for (const [relative, name] of [
    ['diagnostics/application.log.1', 'legacy-previous.vdiag'],
    ['diagnostics/application.log', 'legacy-application.vdiag'],
    ['crash-diagnostics.log', 'legacy-crash.vdiag']
  ]) {
    const source = path.join(userData, relative)
    const stat = await fs.stat(source).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (!stat) continue
    if (stat.size > 2 * 1024 * 1024) throw new Error('旧诊断日志超过迁移大小限制，请开发人员手动处理')
    const original = await fs.readFile(source)
    const encrypted = sealReport({ kind: 'legacy', source: relative, content: redactText(original.toString('utf8'), Infinity) }, publicKey)
    await fs.mkdir(directory, { recursive: true })
    // 独占创建，避免覆盖之前迁移的诊断资料。
    await fs.writeFile(path.join(directory, name), JSON.stringify(encrypted) + '\n', { flag: 'wx' })
    const current = await fs.readFile(source)
    if (current.equals(original)) await fs.unlink(source)
    else throw new Error('旧日志仍在写入，明文原件已保留，请关闭旧版程序后处理')
  }
}
module.exports = { migrateLegacyDiagnostics }
