/**
 * 北极熊授权后端地址与验签（vwork_electron 唯一配置入口）
 * 修改此处即可；getAuthInfo、卡密绑定/解绑等均引用本文件。
 * sign = HMAC-SHA256(secret, "{timestamp}&{nonce}&{salt}") 的 hex 小写
 */
const crypto = require('crypto')

/** 不含末尾斜杠，形如 http://host:port */
const POLAR_BEAR_BACKEND_ORIGIN = 'http://8.137.76.99:5516'
// const POLAR_BEAR_BACKEND_ORIGIN = 'http://192.168.1.18:5516'

const POLAR_BEAR_SIGN_SECRET = 'sadasgfd34355768ghjcv'
const POLAR_BEAR_SIGN_SALT = 'xxse41235_a1d457a1s000dw22318967e'

function getPolarBearBaseUrl() {
  return POLAR_BEAR_BACKEND_ORIGIN.replace(/\/+$/, '')
}

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
  POLAR_BEAR_BACKEND_ORIGIN,
  POLAR_BEAR_SIGN_SECRET,
  POLAR_BEAR_SIGN_SALT,
  getPolarBearBaseUrl,
  buildPolarBearAuthHeaders
}
