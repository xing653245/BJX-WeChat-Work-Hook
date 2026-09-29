/**
 * 北极熊授权后端地址与验签（vwork_electron 唯一配置入口）
 * IsDebug=true 走本地，否则走线上。打包时 IsDebug 默认关闭。
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const POLAR_BEAR_LOCAL_ORIGIN = 'http://192.168.1.18:5516'
const POLAR_BEAR_ONLINE_ORIGIN = 'http://8.137.76.99:5516'
const POLAR_BEAR_SIGN_SECRET = 'sadasgfd34355768ghjcv'
const POLAR_BEAR_SIGN_SALT = 'xxse41235_a1d457a1s000dw22318967e'

function getInjectBinDir() {
  try {
    const { app } = require('electron')
    if (app && app.isPackaged) {
      return path.join(process.resourcesPath || '', 'bin')
    }
  } catch {
    /* 非 Electron */
  }
  return path.join(__dirname, '..', '..', 'bin')
}

function parseDebugFlag(value) {
  return value === true || value === 'true' || value === '1' || value === 1
}

function readPolarBearDebug(dir) {
  try {
    const settingsPath = path.join(dir || getInjectBinDir(), 'settings.json')
    if (!fs.existsSync(settingsPath)) return false
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, ''))
    return parseDebugFlag(settings.IsDebug)
  } catch {
    return false
  }
}

function getPolarBearBaseUrl(dir) {
  const origin = readPolarBearDebug(dir) ? POLAR_BEAR_LOCAL_ORIGIN : POLAR_BEAR_ONLINE_ORIGIN
  return origin.replace(/\/+$/, '')
}

/** sign = HMAC-SHA256(secret, "{timestamp}&{nonce}&{salt}") 的 hex 小写 */
function buildPolarBearAuthHeaders() {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = crypto.randomBytes(16).toString('hex')
  const sign = crypto
    .createHmac('sha256', POLAR_BEAR_SIGN_SECRET)
    .update(`${timestamp}&${nonce}&${POLAR_BEAR_SIGN_SALT}`, 'utf8')
    .digest('hex')
  return {
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Sign': sign
  }
}

module.exports = {
  POLAR_BEAR_LOCAL_ORIGIN,
  POLAR_BEAR_ONLINE_ORIGIN,
  POLAR_BEAR_SIGN_SECRET,
  POLAR_BEAR_SIGN_SALT,
  getPolarBearBaseUrl,
  buildPolarBearAuthHeaders
}
