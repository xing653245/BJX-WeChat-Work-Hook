const { createDiagnostics } = require('../electron/commons/diagnostics.cjs')
const diagnostics = createDiagnostics('reset-pack-conf-login.js')
/** 打包副本：不会改写开发目录的账号和注入配置。 */
const fs = require('fs')
const path = require('path')
const ini = require('ini')
const { parseJsonDocument } = require('../electron/services/injectSettings')
const { writeTextAtomic } = require('../electron/commons/atomicFile')
const { DEFAULT_SERVER_PORT_STRING } = require('../electron/configs/defaults')

function preparePackageConfig(root) {
  const confPath = path.join(root, 'conf', 'conf.ini')
  const settingsPath = path.join(root, 'bin', 'settings.json')
  // 必需配置缺失或损坏时直接失败，防止打包上次遗留的副本。
  const settings = parseJsonDocument(fs.readFileSync(settingsPath, 'utf8'))
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
module.exports = { preparePackageConfig }
