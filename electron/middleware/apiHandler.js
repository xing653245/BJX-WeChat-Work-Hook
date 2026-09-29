/**
 * API处理中间件
 * 提供统一的API调用处理逻辑
 */
const { validateVworkRequest } = require('../utils/vworkApiContract')
const { readIni, checkAuthByPort } = require('../commons/common')
const { postToVWorkApi } = require('../services/wecomApiClient')

/**
 * 调用企微API的通用处理函数
 * @param {number} port - 企微的HTTP端口
 * @param {number} type - API类型
 * @param {object} params - 其他参数
 * @returns {Promise<object>} 返回企微API的响应数据
 */
async function callVWorkAPI(port, type, params = {}) {
  const checked = validateVworkRequest({ ...params, type })
  if (!checked.valid) {
    const error = new Error(checked.message)
    error.code = 'INVALID_API_PARAMS'
    throw error
  }
  type = checked.params.type
  // 不需要授权验证的接口类型列表
  // 1000: 获取登录状态
  // 1001: 获取登录二维码
  // 1003: 退出登录
  // 1004: 获取个人二维码
  // 1005: 输入登录验证码
  const LOGIN_RELATED_TYPES = new Set([1000, 1001, 1003, 1004, 1005])

  // 除上述接口外，其他所有接口都需要验证授权
  if (!LOGIN_RELATED_TYPES.has(type)) {
    const ini_config = readIni()
    
    const authResult = checkAuthByPort(port, ini_config.login_info)
    if (!authResult.valid) {
      const err = new Error(authResult.message)
      err.code = 'NO_AUTH'
      err.reason = authResult.reason
      throw err
    }
  }

  // 构建请求数据
  const requestData = checked.params

  return postToVWorkApi(port, requestData)
}

module.exports = { callVWorkAPI }
