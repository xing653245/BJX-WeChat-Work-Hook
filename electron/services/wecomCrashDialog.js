/**
 * Windows：检测并关闭企业微信崩溃后的「错误报告」窗口，便于后续由注入工具重启实例。
 */
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')

/**
 * 使用 -EncodedCommand：打包进 app.asar 后，PowerShell 无法用 -File 直接读 asar 内路径；由 Node 读入再传入。
 * @returns {Promise<number>} 本轮关闭的窗口数量
 */
function tryCloseWecomCrashDialogs() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(0)
      return
    }
    let encoded
    try {
      const ps1 = path.join(__dirname, '..', 'scripts', 'closeWecomErrorReportDialog.ps1')
      const script = fs.readFileSync(ps1, 'utf8')
      encoded = Buffer.from(script, 'utf16le').toString('base64')
    } catch (e) {
      console.warn('[wecom-crash-dialog] 读取脚本失败:', e.message)
      return resolve(0)
    }
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: 20000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          console.warn('[wecom-crash-dialog]', err.message)
          return resolve(0)
        }
        const m = String(stdout || '').match(/CLOSED:(\d+)/)
        resolve(m ? parseInt(m[1], 10) : 0)
      }
    )
  })
}

module.exports = { tryCloseWecomCrashDialogs }
