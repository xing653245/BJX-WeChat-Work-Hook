const { createDiagnostics } = require('../electron/commons/diagnostics.cjs')
const diagnostics = createDiagnostics('reset-pack-conf-login.js')
/** 打包前关闭源配置调试；账号清理仍只作用于打包副本。 */
const fs = require('fs')
const path = require('path')
const ini = require('ini')
const { parseJsonDocument } = require('../electron/services/injectSettings')
const { writeTextAtomic } = require('../electron/commons/atomicFile')
const { DEFAULT_SERVER_PORT_STRING } = require('../electron/configs/defaults')

function disableDebug(root = path.resolve(__dirname, '..')) {
  const settingsPath = path.join(root, 'bin', 'settings.json')
  const settings = parseJsonDocument(fs.readFileSync(settingsPath, 'utf8'))
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('settings.json 必须是 JSON 对象')
  }
  if (settings.IsDebug !== false) {
    settings.IsDebug = false
    writeTextAtomic(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  }
  return settings
}

function preparePackageConfig(root) {
  const confPath = path.join(root, 'conf', 'conf.ini')
  // 读取或写入失败直接停止，不能继续使用上次遗留的副本。
  const settings = disableDebug(root)
  const config = fs.existsSync(confPath) ? ini.parse(fs.readFileSync(confPath, 'utf8'))
    : { sys: { server_port: DEFAULT_SERVER_PORT_STRING, open_log: 'true', save_log: 'true' } }
  config.custom = { ...(config.custom || {}), login_info: '[]' }
  delete settings.login_info
  settings.IsDebug = false
  const output = path.join(root, '.cache', 'package-resources')
  for (const dir of ['conf', 'bin']) fs.mkdirSync(path.join(output, dir), { recursive: true })
  writeTextAtomic(path.join(output, 'conf', 'conf.ini'), ini.stringify(config))
  writeTextAtomic(path.join(output, 'bin', 'settings.json'), JSON.stringify(settings, null, 2) + '\n')
  return output
}

if (require.main === module) {
  require('../electron/commons/reportEncryption.cjs').loadReportPublicKey()
  diagnostics.info('L001', '已生成打包配置副本:', preparePackageConfig(path.resolve(__dirname, '..')))
}
module.exports = { preparePackageConfig, disableDebug }
