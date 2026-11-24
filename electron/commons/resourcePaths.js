const path = require('path')

function getResourceRoot() {
  try {
    if (require('electron').app?.isPackaged) return process.resourcesPath
  } catch { /* 普通 Node 环境 */ }
  return path.resolve(__dirname, '../..')
}

function getInjectBinDir() { return path.join(getResourceRoot(), 'bin') }
function getInjectToolPath() { return path.join(getInjectBinDir(), 'it.exe') }

function getCallbackSettingsPath() {
  const { app } = require('electron')
  if (!app.isPackaged) return path.resolve(__dirname, '../../bin/callbackSetting.json')
  return path.join(app.getPath('userData'), 'callbackSetting.json')
}

module.exports = { getInjectBinDir, getInjectToolPath, getCallbackSettingsPath }
