const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { assertMainWindow } = require('../commons/ipcSecurity')

test('原生主题只接受主窗口传入的三种外观模式', () => {
  const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8')
  const start = source.indexOf("ipcMain.handle('set-native-theme'")
  const end = source.indexOf("ipcMain.handle('respond-close-confirm'", start)
  const nativeTheme = { themeSource: 'system' }
  const mainWindow = { isDestroyed: () => false, webContents: {} }
  let handler
  vm.runInNewContext(source.slice(start, end), {
    ipcMain: { handle: (_channel, callback) => { handler = callback } },
    nativeTheme, mainWindow, assertMainWindow
  })
  const event = { sender: mainWindow.webContents }
  for (const mode of ['dark', 'light', 'system']) {
    assert.equal(handler(event, mode).success, true)
    assert.equal(nativeTheme.themeSource, mode)
  }
  assert.throws(() => handler(event, 'invalid'), /无效的外观模式/)
  assert.throws(() => handler({ sender: {} }, 'dark'), { code: 'IPC_FORBIDDEN' })
  assert.equal(nativeTheme.themeSource, 'system')
})

test('恢复外观和切换模式同步原生主题，跟随系统仍响应媒体变化', () => {
  const values = new Map([['vwork_theme_mode', 'dark']])
  const classes = new Set()
  const calls = []
  let systemDark = false
  let onMediaChange
  const source = fs.readFileSync(path.join(__dirname, '../../src/utils/theme.js'), 'utf8')
  const context = vm.createContext({
    console,
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    document: { documentElement: { dataset: {}, classList: {
      add: name => classes.add(name), remove: name => classes.delete(name)
    } } },
    window: {
      electronAPI: { setNativeTheme: mode => { calls.push(mode); return Promise.resolve() } },
      matchMedia: () => ({ matches: systemDark,
        addEventListener: (_event, callback) => { onMediaChange = callback },
        removeEventListener: () => {}
      })
    }
  })
  vm.runInContext(source.replace(/^export /gm, ''), context)
  context.initTheme()
  assert.equal(calls.at(-1), 'dark')
  assert.equal(classes.has('dark'), true)
  context.setThemeMode('light')
  assert.equal(calls.at(-1), 'light')
  assert.equal(classes.has('dark'), false)
  context.setThemeMode('system')
  systemDark = true
  onMediaChange()
  assert.equal(classes.has('dark'), true)
  assert.equal(calls.at(-1), 'system')
  systemDark = false
  onMediaChange()
  assert.equal(classes.has('dark'), false)
  assert.equal(calls.at(-1), 'system')
})
