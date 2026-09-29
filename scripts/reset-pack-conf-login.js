/**
 * 打包前：清空账号列表，并关闭 IsDebug。
 */
const fs = require('fs')
const path = require('path')
const ini = require('ini')

const confPath = path.join(__dirname, '..', 'conf', 'conf.ini')
const settingsPath = path.join(__dirname, '..', 'bin', 'settings.json')

if (fs.existsSync(confPath)) {
  const config = ini.parse(fs.readFileSync(confPath, 'utf-8'))
  if (!config.custom) config.custom = {}
  config.custom.login_info = '[]'
  fs.writeFileSync(confPath, ini.stringify(config), 'utf-8')
  console.log('[reset-pack-conf-login] 已设置 custom.login_info = [] →', confPath)
} else {
  console.warn('[reset-pack-conf-login] 跳过 ini：未找到', confPath)
}

if (fs.existsSync(settingsPath)) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, ''))
  delete settings.login_info
  settings.IsDebug = false
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8')
  console.log('[reset-pack-conf-login] 已关闭 IsDebug →', settingsPath)
} else {
  console.warn('[reset-pack-conf-login] 跳过 settings：未找到', settingsPath)
}
