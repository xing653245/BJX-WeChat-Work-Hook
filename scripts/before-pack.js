const { preparePackageConfig } = require('./reset-pack-conf-login')

// electron-builder 直接执行时也准备配置，避免绕过 npm 打包脚本。
module.exports = (context) => {
  require('../electron/commons/reportEncryption.cjs').loadReportPublicKey()
  preparePackageConfig(context.packager.projectDir)
}
