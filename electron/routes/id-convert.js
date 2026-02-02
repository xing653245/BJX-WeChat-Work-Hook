/**
 * ID转换相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')

/**
 * 企业用户ID转开放平台ID
 * POST /api/id-convert/corp-user-to-open
 * 请求体: { "port": 8080, "user_id": "用户ID" }
 */
router.post('/corp-user-to-open', createAPIHandler(8000, '企业用户ID转开放平台ID', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  return { valid: true, params: { user_id: params.user_id } }
}))

/**
 * 企业群ID转开放平台ID
 * POST /api/id-convert/corp-group-to-open
 * 请求体: { "port": 8080, "chat_room_id": "群ID" }
 */
router.post('/corp-group-to-open', createAPIHandler(8001, '企业群ID转开放平台ID', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  return { valid: true, params: { chat_room_id: params.chat_room_id } }
}))

/**
 * 开放平台ID转企业用户ID
 * POST /api/id-convert/open-to-corp-user
 * 请求体: { "port": 8080, "open_id": "开放平台ID" }
 */
router.post('/open-to-corp-user', createAPIHandler(8002, '开放平台ID转企业用户ID', (params) => {
  if (!params.open_id) {
    return { valid: false, message: '缺少参数: open_id (开放平台ID)' }
  }
  return { valid: true, params: { open_id: params.open_id } }
}))

/**
 * 开放平台ID转企业群ID
 * POST /api/id-convert/open-to-corp-group
 * 请求体: { "port": 8080, "open_id": "开放平台ID" }
 */
router.post('/open-to-corp-group', createAPIHandler(8003, '开放平台ID转企业群ID', (params) => {
  if (!params.open_id) {
    return { valid: false, message: '缺少参数: open_id (开放平台ID)' }
  }
  return { valid: true, params: { open_id: params.open_id } }
}))

module.exports = router

