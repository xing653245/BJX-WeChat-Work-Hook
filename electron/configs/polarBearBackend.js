/**
 * 北极熊授权后端地址（vwork_electron 唯一配置入口）
 * 修改此处即可；getAuthInfo、卡密绑定/解绑等均引用本文件。
 */

/** 不含末尾斜杠，形如 http://host:port */
// const POLAR_BEAR_BACKEND_ORIGIN = 'http://8.137.76.99:5516'
const POLAR_BEAR_BACKEND_ORIGIN = 'http://192.168.1.18:5516'

function getPolarBearBaseUrl() {
  return POLAR_BEAR_BACKEND_ORIGIN.replace(/\/+$/, '')
}

module.exports = {
  POLAR_BEAR_BACKEND_ORIGIN,
  getPolarBearBaseUrl
}
