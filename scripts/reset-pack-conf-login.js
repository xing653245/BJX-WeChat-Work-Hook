/**
 * 在 electron-builder 打包前执行：将 conf/conf.ini 中的 login_info 重置为 []，
 * 避免把开发机上的账号列表打进安装包默认配置。
 */
const fs = require('fs')
const path = require('path')
const ini = require('ini')

const confPath = path.join(__dirname, '..', 'conf', 'conf.ini')

if (!fs.existsSync(confPath)) {
  console.warn('[reset-pack-conf-login] 跳过：未找到', confPath)
  process.exit(0)
}

const raw = fs.readFileSync(confPath, 'utf-8')
const config = ini.parse(raw)
if (!config.custom) {
  config.custom = {}
}
config.custom.login_info = '[]'
fs.writeFileSync(confPath, ini.stringify(config), 'utf-8')
console.log('[reset-pack-conf-login] 已设置 custom.login_info = [] →', confPath)
