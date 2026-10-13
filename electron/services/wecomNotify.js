const { createDiagnostics } = require('../commons/diagnostics.cjs')
const diagnostics = createDiagnostics('services/wecomNotify.js')
/**
 * 主进程 / Express 注入企微成功后通知渲染进程（企微管理表格 + 登录轮询）
 */
const { BrowserWindow } = require('electron')

function notifyWecomInjectStarted(port, reason = '') {
  const n = Number(port)
  if (Number.isNaN(n) || n <= 0) return
  const suffix = reason ? `（${reason}）` : ''
  diagnostics.info('L001', `[企微注入] 通知渲染进程端口 ${n}${suffix}`)
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send('wecom-inject-started', { port: n, reason })
      }
    } catch (e) {
      diagnostics.error('L002', '通知界面显示企微实例失败：', e.message)
    }
  }
}

function notifyWecomSessionEnded(port, reason = '') {
  const n = Number(port)
  if (Number.isNaN(n) || n <= 0) return
  diagnostics.info('L003', `[企微退出] 通知渲染进程移除端口 ${n}${reason ? `（${reason}）` : ''}`)
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send('wecom-session-ended', { port: n, reason })
      }
    } catch (e) {
      diagnostics.error('L004', '通知界面更新企微退出状态失败：', e.message)
    }
  }
}

module.exports = {
  notifyWecomInjectStarted,
  notifyWecomSessionEnded
}
