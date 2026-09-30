/**
 * IPC 与外部 URL 安全校验
 */

function isMainWindowSender(event, mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  if (!event?.sender) return false
  return event.sender === mainWindow.webContents
}

/** call-api 仅允许访问本机 HTTP 框架/企微接口 */
function isAllowedCallApiUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false
  try {
    const u = new URL(rawUrl.trim())
    const host = u.hostname.toLowerCase()
    if (host !== '127.0.0.1' && host !== 'localhost') return false
    if (u.protocol !== 'http:') return false
    if (u.username || u.password) return false
    if (/^\/updatesettings\/?$/i.test(u.pathname)) return false
    return true
  } catch {
    return false
  }
}

const EXTERNAL_URL_ALLOW = [
  /^https:\/\/23t2z5j37i\.apifox\.cn/i,
  /^https:\/\/([a-z0-9-]+\.)*apifox\.cn/i,
  /^https:\/\/([a-z0-9-]+\.)*gitee\.com/i,
  /^https:\/\/([a-z0-9-]+\.)*github\.com/i,
  /^https:\/\/([a-z0-9-]+\.)*githubusercontent\.com/i
]

function isAllowedExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false
  try {
    const u = new URL(rawUrl.trim())
    if (u.protocol !== 'https:') return false
    if (u.username || u.password) return false
    return EXTERNAL_URL_ALLOW.some((re) => re.test(rawUrl.trim()))
  } catch {
    return false
  }
}

function assertMainWindow(event, mainWindow) {
  if (!isMainWindowSender(event, mainWindow)) {
    const err = new Error('IPC 调用来源无效')
    err.code = 'IPC_FORBIDDEN'
    throw err
  }
}

module.exports = {
  isMainWindowSender,
  isAllowedCallApiUrl,
  isAllowedExternalUrl,
  assertMainWindow
}
