/**
 * 设置相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')

/**
 * 开启/关闭自动更新
 * POST /api/settings/auto-update
 * 请求体: { 
 *   "port": 8080, 
 *   "state": true/false
 * }
 */
router.post('/auto-update', createAPIHandler(7000, '开启/关闭自动更新', (params) => {
  if (params.state === undefined || params.state === null) {
    return { valid: false, message: '缺少参数: state (状态)' }
  }
  return { valid: true, params: { state: params.state } }
}))

/**
 * 开启/关闭自动登录
 * POST /api/settings/auto-login
 * 请求体: { 
 *   "port": 8080, 
 *   "state": true/false
 * }
 */
router.post('/auto-login', createAPIHandler(7001, '开启/关闭自动登录', (params) => {
  if (params.state === undefined || params.state === null) {
    return { valid: false, message: '缺少参数: state (状态)' }
  }
  return { valid: true, params: { state: params.state } }
}))

/**
 * 开启/关闭消息免打扰
 * POST /api/settings/message-dnd
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "state": true/false
 * }
 */
router.post('/message-dnd', createAPIHandler(7002, '开启/关闭消息免打扰', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (params.state === undefined || params.state === null) {
    return { valid: false, message: '缺少参数: state (状态)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      state: params.state
    }
  }
}))

/**
 * 开启/关闭自动下载
 * POST /api/settings/auto-download
 * 请求体: { 
 *   "port": 8080, 
 *   "state": true/false
 * }
 */
router.post('/auto-download', createAPIHandler(7003, '开启/关闭自动下载', (params) => {
  if (params.state === undefined || params.state === null) {
    return { valid: false, message: '缺少参数: state (状态)' }
  }
  return { valid: true, params: { state: params.state } }
}))

module.exports = router

