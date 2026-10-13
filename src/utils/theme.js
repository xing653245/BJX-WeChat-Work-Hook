const STORAGE_KEY = 'vwork_theme_mode'

/** @typedef {'light' | 'dark' | 'system'} ThemeMode */

/** @returns {ThemeMode} */
export function getStoredThemeMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

/** @param {ThemeMode} mode */
export function setStoredThemeMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/** @param {ThemeMode} mode */
export function resolveIsDark(mode) {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return systemPrefersDark()
}

/** @param {ThemeMode} mode */
export function applyThemeMode(mode) {
  const isDark = resolveIsDark(mode)
  const root = document.documentElement
  if (isDark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  root.dataset.theme = mode
  // 传递用户选择的模式而非解析后的颜色，否则“跟随系统”会被锁定。
  window.electronAPI?.setNativeTheme?.(mode)?.catch((error) => {
    console.warn('同步窗口外观失败:', error)
  })
  return isDark
}

let mediaListener = null

/** @param {(isDark: boolean) => void} [onChange] */
export function initTheme(onChange) {
  const mode = getStoredThemeMode()
  applyThemeMode(mode)
  onChange?.(resolveIsDark(mode))

  if (mediaListener) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mediaListener)
  }

  mediaListener = () => {
    if (getStoredThemeMode() !== 'system') return
    const isDark = applyThemeMode('system')
    onChange?.(isDark)
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mediaListener)
}

/** @param {ThemeMode} mode @param {(isDark: boolean) => void} [onChange] */
export function setThemeMode(mode, onChange) {
  setStoredThemeMode(mode)
  const isDark = applyThemeMode(mode)
  onChange?.(isDark)
}
