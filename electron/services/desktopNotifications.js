const { Notification } = require('electron')

let iconPath = null
let focusMainWindowFn = null

function initDesktopNotifications({ icon, focusMainWindow }) {
  iconPath = icon || null
  focusMainWindowFn = focusMainWindow || null
}

function showDesktopNotification({ title, body, onClick }) {
  if (!Notification.isSupported()) return false
  try {
    const n = new Notification({
      title: title || '北极熊企微框架',
      body: body || '',
      icon: iconPath || undefined,
      silent: false
    })
    n.on('click', () => {
      if (typeof onClick === 'function') onClick()
      else focusMainWindowFn?.()
    })
    n.show()
    return true
  } catch (e) {
    console.warn('[notification] 显示失败:', e.message)
    return false
  }
}

module.exports = {
  initDesktopNotifications,
  showDesktopNotification
}
