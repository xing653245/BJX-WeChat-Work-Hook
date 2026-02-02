/**
 * 登录相关路由
 * 
 * 授权说明：
 * - 1000, 1003: 不需要授权验证
 * - 其他接口需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')

/**
 * 获取登录状态 (type: 1000)
 * POST /api/login/status
 * 请求体: { "port": 8080 }
 */
router.post('/status', createAPIHandler(1000, '获取登录状态'))

/**
 * 刷新并获取登录二维码 (type: 1001)
 * 需要授权验证
 * POST /api/login/qrcode
 * 请求体: { "port": 8080, "path": "" }
 */
router.post('/qrcode', createAPIHandler(1001, '获取登录二维码', (params) => {
  if (!params.path) {
    return { valid: false, message: '缺少参数: path (路径)' }
  }
  return { valid: true, params: { path: params.path } }
}))

/**
 * 获取个人信息
 * POST /api/user/info
 * 请求体: { "port": 8080 }
 */
router.post('/info', createAPIHandler(1002, '获取个人信息'))

/**
 * 退出登录 (type: 1003)
 * 不需要授权验证
 * POST /api/login/logout
 * 请求体: { "port": 8080 }
 */
router.post('/logout', createAPIHandler(1003, '退出登录'))

/**
 * 获取个人二维码 (type: 1004)
 * 需要授权验证
 * POST /api/login/personal-qrcode
 * 请求体: { "port": 8080 }
 */
router.post('/personal-qrcode', createAPIHandler(1004, '获取个人二维码'))

/**
 * 输入登录验证码 (type: 1005)
 * 需要授权验证
 * POST /api/login/captcha
 * 请求体: { "port": 8080, "code": "验证码" }
 */
router.post('/captcha', createAPIHandler(1005, '输入登录验证码', (params) => {
  if (!params.code) {
    return { valid: false, message: '缺少参数: code (验证码)' }
  }
  return { valid: true, params: { code: params.code } }
}))

module.exports = router

