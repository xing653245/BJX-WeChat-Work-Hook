const STORAGE_KEY = 'vwork_close_confirm_prefs'

/**
 * 若用户勾选「不再提醒」并确认，则下次关窗直接执行该操作（minimize | quit）
 */
export function getCloseConfirmAutoAction() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p?.dontRemind && (p.action === 'minimize' || p.action === 'quit')) {
      return p.action
    }
    return null
  } catch {
    return null
  }
}

export function setCloseConfirmPrefs(dontRemind, action) {
  if (dontRemind && (action === 'minimize' || action === 'quit')) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dontRemind: true, action }))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

/** 清除「不再提醒」记忆，恢复每次关窗时弹出选择框 */
export function clearCloseConfirmPrefs() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (_) {
    /* ignore */
  }
}
