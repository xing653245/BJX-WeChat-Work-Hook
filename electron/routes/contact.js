/**
 * 联系人/列表相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')

/**
 * 获取联系人列表【外部】
 * POST /api/contact/list
 * 请求体: { 
 *   "port": 8080, 
 *   "page_num": 1,
 *   "page_size": 20
 * }
 */
router.post('/list', createAPIHandler(2000, '获取联系人列表', (params) => {
  if (params.page_num === undefined || params.page_num === null) {
    return { valid: false, message: '缺少参数: page_num (页码)' }
  }
  if (params.page_size === undefined || params.page_size === null) {
    return { valid: false, message: '缺少参数: page_size (每页数量)' }
  }
  return {
    valid: true,
    params: {
      page_num: params.page_num,
      page_size: params.page_size
    }
  }
}))

/**
 * 获取好友列表【内部】
 * POST /api/contact/friends
 * 请求体: { 
 *   "port": 8080, 
 *   "page_num": 1,
 *   "page_size": 20
 * }
 */
router.post('/friends', createAPIHandler(2001, '获取好友列表', (params) => {
  if (params.page_num === undefined || params.page_num === null) {
    return { valid: false, message: '缺少参数: page_num (页码)' }
  }
  if (params.page_size === undefined || params.page_size === null) {
    return { valid: false, message: '缺少参数: page_size (每页数量)' }
  }
  return {
    valid: true,
    params: {
      page_num: params.page_num,
      page_size: params.page_size
    }
  }
}))

/**
 * 获取群列表
 * POST /api/contact/groups
 * 请求体: { 
 *   "port": 8080, 
 *   "page_num": 1,
 *   "page_size": 20
 * }
 */
router.post('/groups', createAPIHandler(2002, '获取群列表', (params) => {
  if (params.page_num === undefined || params.page_num === null) {
    return { valid: false, message: '缺少参数: page_num (页码)' }
  }
  if (params.page_size === undefined || params.page_size === null) {
    return { valid: false, message: '缺少参数: page_size (每页数量)' }
  }
  return {
    valid: true,
    params: {
      page_num: params.page_num,
      page_size: params.page_size
    }
  }
}))

/**
 * 获取群成员列表
 * POST /api/contact/members
 * 请求体: { "port": 8080, "chat_room_id": "群ID" }
 */
router.post('/members', createAPIHandler(2003, '获取群成员列表', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  return { valid: true, params: { chat_room_id: params.chat_room_id } }
}))

/**
 * 获取公司列表
 * POST /api/contact/companies
 * 请求体: { "port": 8080 }
 */
router.post('/companies', createAPIHandler(2004, '获取公司列表'))

/**
 * 获取部门列表
 * POST /api/contact/departments
 * 请求体: { "port": 8080 }
 */
router.post('/departments', createAPIHandler(2005, '获取部门列表'))

module.exports = router

