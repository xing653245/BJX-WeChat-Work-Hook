const { createDiagnostics } = require('../commons/diagnostics.cjs')
const diagnostics = createDiagnostics('services/crashDiagnostics.js')
const { redactText } = require('../commons/diagnostics.cjs')
const fs = require('fs')
const path = require('path')
const { app, crashReporter, dialog } = require('electron')

let crashLogPath = null
let getMainWindowRef = null
let encryptedWriter = null

function appendCrashLog(label, detail) {
  if (encryptedWriter) {
    try { encryptedWriter.writeCritical({ source: 'crash', code: label, level: 'error', message: redactText(detail) }) } catch { /* 失败时不能回退到明文 */ }
    return
  }
  if (app.isPackaged) return
  if (!crashLogPath) return
  try {
    const line = `[${new Date().toISOString()}] ${label}: ${redactText(detail)}\n`
    fs.appendFileSync(crashLogPath, line, 'utf-8')
  } catch (e) {
    diagnostics.error('L001', '[crashDiagnostics] 写入失败:', e.message)
  }
}

function getMainWindow() {
  return getMainWindowRef?.() || null
}

function initCrashDiagnostics({ getMainWindow, icon, writer }) {
  getMainWindowRef = getMainWindow
  encryptedWriter = writer || null

  try {
    crashLogPath = writer ? path.join(path.dirname(writer.file), 'crash.vdiag') : path.join(app.getPath('userData'), 'crash-diagnostics.log')
  } catch {
    crashLogPath = null
  }

  try {
    if (!app.isPackaged) crashReporter.start({
      productName: app.getName(),
      companyName: 'vwork',
      uploadToServer: false
    })
  } catch (e) {
    diagnostics.warn('L002', '[crashReporter] 启动失败:', e.message)
  }

  process.on('uncaughtException', (err) => {
    const msg = err?.stack || err?.message || String(err)
    diagnostics.error('L003', '[主进程未捕获异常]', msg)
    appendCrashLog('uncaughtException', msg)
    showCrashDialog('应用运行异常', msg)
  })

  process.on('unhandledRejection', (reason) => {
    const msg = reason?.stack || reason?.message || String(reason)
    diagnostics.error('L004', '[主进程未处理 Promise 拒绝]', msg)
    appendCrashLog('unhandledRejection', msg)
  })

  app.on('render-process-gone', (_event, webContents, details) => {
    const msg = `reason=${details.reason} exitCode=${details.exitCode}`
    diagnostics.error('L005', '[渲染进程异常]', msg)
    appendCrashLog('render-process-gone', msg)
    const win = getMainWindow()
    if (win && webContents === win.webContents) {
      showCrashDialog(
        '应用界面异常',
        `渲染进程已退出（${details.reason || 'unknown'}）。您可以尝试重新加载窗口。`
      )
    }
  })

  app.on('child-process-gone', (_event, details) => {
    appendCrashLog('child-process-gone', JSON.stringify(details))
  })
}

function showCrashDialog(title, detail) {
  const win = getMainWindow()
  dialog
    .showMessageBox(win || undefined, {
      type: 'error',
      title: title || '应用异常',
      message: title || '应用异常',
      detail: '应用暂时无法正常运行。可以尝试重新加载界面；如问题持续出现，请重启应用或联系技术支持。',
      buttons: ['知道了', '重新加载界面'],
      defaultId: 1,
      cancelId: 0,
      noLink: true
    })
    .then(({ response }) => {
      if (response === 1 && win && !win.isDestroyed()) {
        win.webContents.reload()
      }
    })
    .catch(() => {})
}

function attachWebContentsDiagnostics(webContents) {
  if (!webContents) return

  webContents.on('unresponsive', () => {
    appendCrashLog('unresponsive', 'webContents unresponsive')
    showCrashDialog('界面无响应', '窗口长时间无响应，可等待或重新加载界面。')
  })

  webContents.on('responsive', () => {
    appendCrashLog('responsive', 'webContents responsive again')
  })
}

function getCrashLogPath() {
  return crashLogPath
}

module.exports = {
  initCrashDiagnostics,
  attachWebContentsDiagnostics,
  appendCrashLog,
  getCrashLogPath,
  getMainWindow
}
