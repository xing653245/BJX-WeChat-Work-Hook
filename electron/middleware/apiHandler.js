/**
 * API处理中间件
 * 提供统一的API调用处理逻辑
 */
const { readIni, checkAuthByPort } = require('../commons/common')
const { postToVWorkApi } = require('../services/wecomApiClient')
const { normalizeHookResponse, shouldNormalizeHookResponse } = require('../utils/hookResponse')

/**
 * 调用企微API的通用处理函数
 * @param {number} port - 企微的HTTP端口
 * @param {number} type - API类型
 * @param {object} params - 其他参数
 * @returns {Promise<object>} 返回企微API的响应数据
 */
async function callVWorkAPI(port, type, params = {}) {
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
  const requestData = {
    type: type,
    ...params
  }

  return postToVWorkApi(port, requestData)
}

/**
 * 创建API接口的通用处理函数
 * @param {number} type - API类型
 * @param {string} apiName - API名称（用于错误提示）
 * @param {function} paramsValidator - 参数验证函数，返回验证后的参数对象
 * @returns {function} Express路由处理函数
 */
function createAPIHandler(type, apiName, paramsValidator = null) {
  return async (req, res) => {
    try {
      const { port, ...otherParams } = req.body

      // 参数验证
      if (!port) {
        return res.status(400).json({
          success: false,
          message: '缺少参数: port (企微的HTTP端口)'
        })
      }

      // 自定义参数验证
      let validatedParams = otherParams
      if (paramsValidator) {
        const validationResult = paramsValidator(otherParams, port)
        if (!validationResult.valid) {
          return res.status(400).json({
            success: false,
            message: validationResult.message
          })
        }
        validatedParams = validationResult.params
      }

      try {
        const raw = await callVWorkAPI(port, type, validatedParams)
        const data = shouldNormalizeHookResponse(type)
          ? normalizeHookResponse(raw)
          : raw
        res.json({
          success: true,
          data: data
        })
      } catch (error) {
        let errorMessage = `${apiName}失败`
        let statusCode = 500

        if (error.code === 'NO_AUTH' || error.message.includes('未授权') || error.message.includes('授权已到期') || error.message.includes('刷新授权')) {
          statusCode = 403
          errorMessage = error.message
        } else if (error.code === 'APPLET_QUEUE_FULL') {
          statusCode = 503
          errorMessage = error.message
        } else if (error.code === 'WECOM_NOT_READY' || error.code === 'WECOM_NOT_LOGGED_IN') {
          statusCode = 409
          errorMessage = error.message
        } else if (error.code === 'WECOM_HOOK_UNREACHABLE') {
          statusCode = 503
          errorMessage = error.message
        } else if (error.code === 'INVALID_FRIEND_NETWORK_PARAMS') {
          statusCode = 400
          errorMessage = error.message
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = `无法连接到企微服务 (端口 ${port})，请确认企微已启动`
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = '请求超时：企微 Hook 无响应，可能已崩溃。请重新打开企微、确认注入成功，并先调用 query-network 再调用 add-network'
        } else if (error.response) {
          errorMessage = `企微API返回错误: HTTP ${error.response.status}`
          if (error.response.data) {
            errorMessage += ` - ${JSON.stringify(error.response.data)}`
          }
        } else {
          errorMessage = error.message || errorMessage
        }

        res.status(statusCode).json({
          success: false,
          message: errorMessage
        })
      }
    } catch (error) {
      console.error(`${apiName}接口错误: ${error.message}`)
      res.status(500).json({
        success: false,
        message: `服务器内部错误: ${error.message}`
      })
    }
  }
}

module.exports = {
  callVWorkAPI,
  createAPIHandler
}

