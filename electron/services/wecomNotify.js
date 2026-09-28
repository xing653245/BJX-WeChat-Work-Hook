/**
 * 主进程 / Express 注入企微成功后通知渲染进程（企微管理表格 + 登录轮询）
 */
const { BrowserWindow } = require('electron')

function notifyWecomInjectStarted(port, reason = '') {
  const n = Number(port)
  if (Number.isNaN(n) || n <= 0) return
  const suffix = reason ? `（${reason}）` : ''
  console.log(`[企微注入] 通知渲染进程端口 ${n}${suffix}`)
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send('wecom-inject-started', { port: n, reason })
      }
    } catch (e) {
      console.error('notifyWecomInjectStarted:', e.message)
    }
  }
}

function notifyWecomSessionEnded(port, reason = '') {
  const n = Number(port)
  if (Number.isNaN(n) || n <= 0) return
  console.log(`[企微退出] 通知渲染进程移除端口 ${n}${reason ? `（${reason}）` : ''}`)
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send('wecom-session-ended', { port: n, reason })
      }
    } catch (e) {
      console.error('notifyWecomSessionEnded:', e.message)
    }
  }
}

module.exports = {
  notifyWecomInjectStarted,
  notifyWecomSessionEnded
}
