const fs = require('fs')
const path = require('path')
const { app, crashReporter, dialog } = require('electron')

let crashLogPath = null
let getMainWindowRef = null

function appendCrashLog(label, detail) {
  if (!crashLogPath) return
  try {
    const line = `[${new Date().toISOString()}] ${label}: ${detail}\n`
    fs.appendFileSync(crashLogPath, line, 'utf-8')
  } catch (e) {
    console.error('[crashDiagnostics] 写入失败:', e.message)
  }
}

function getMainWindow() {
  return getMainWindowRef?.() || null
}

function initCrashDiagnostics({ getMainWindow, icon }) {
  getMainWindowRef = getMainWindow

  try {
    crashLogPath = path.join(app.getPath('userData'), 'crash-diagnostics.log')
  } catch {
    crashLogPath = null
  }

  try {
    crashReporter.start({
      productName: app.getName(),
      companyName: 'vwork',
      uploadToServer: false
    })
  } catch (e) {
    console.warn('[crashReporter] 启动失败:', e.message)
  }

  process.on('uncaughtException', (err) => {
    const msg = err?.stack || err?.message || String(err)
    console.error('[主进程未捕获异常]', msg)
    appendCrashLog('uncaughtException', msg)
    showCrashDialog('主进程发生未预期错误', msg)
  })

  process.on('unhandledRejection', (reason) => {
    const msg = reason?.stack || reason?.message || String(reason)
    console.error('[主进程未处理 Promise 拒绝]', msg)
    appendCrashLog('unhandledRejection', msg)
  })

  app.on('render-process-gone', (_event, webContents, details) => {
    const msg = `reason=${details.reason} exitCode=${details.exitCode}`
    console.error('[渲染进程异常]', msg)
    appendCrashLog('render-process-gone', msg)
    const win = getMainWindow()
    if (win && webContents === win.webContents) {
      showCrashDialog(
        '界面进程异常',
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
      detail: `${detail || ''}\n\n诊断日志：${crashLogPath || '不可用'}`,
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
