/**
 * 好友管理相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')
const { validateAddNetworkParams } = require('../services/friendNetworkGuard')

/**
 * 添加好友【群成员】
 * POST /api/friend/add
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "chat_room_id": "群ID",
 *   "msg": "验证消息"
 * }
 */
router.post('/add', createAPIHandler(4000, '添加好友', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.msg) {
    return { valid: false, message: '缺少参数: msg (验证消息)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      chat_room_id: params.chat_room_id,
      msg: params.msg
    }
  }
}))

/**
 * 删除好友
 * POST /api/friend/delete
 * 请求体: { "port": 8080, "user_id": "用户ID" }
 */
router.post('/delete', createAPIHandler(4001, '删除好友', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  return { valid: true, params: { user_id: params.user_id } }
}))

/**
 * 同意好友请求
 * POST /api/friend/agree
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "corp_id": "企业ID"
 * }
 */
router.post('/agree', createAPIHandler(4002, '同意好友请求', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.corp_id) {
    return { valid: false, message: '缺少参数: corp_id (企业ID)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      corp_id: params.corp_id
    }
  }
}))

/**
 * 设置好友备注
 * POST /api/friend/remark
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "remark": "备注"
 * }
 */
router.post('/remark', createAPIHandler(4003, '设置好友备注', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.remark) {
    return { valid: false, message: '缺少参数: remark (备注)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      remark: params.remark
    }
  }
}))

/**
 * 设置好友描述
 * POST /api/friend/description
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "desc": "描述"
 * }
 */
router.post('/description', createAPIHandler(4004, '设置好友描述', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.desc) {
    return { valid: false, message: '缺少参数: desc (描述)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      desc: params.desc
    }
  }
}))

/**
 * 设置好友公司
 * POST /api/friend/company
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "corp_name": "公司名称"
 * }
 */
router.post('/company', createAPIHandler(4005, '设置好友公司', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.corp_name) {
    return { valid: false, message: '缺少参数: corp_name (公司名称)' }
  }
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      corp_name: params.corp_name
    }
  }
}))

/**
 * 设置好友手机号
 * POST /api/friend/phone
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "mobile_list": ["手机号1", "手机号2"] 或 "手机号"
 * }
 */
router.post('/phone', createAPIHandler(4006, '设置好友手机号', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.mobile_list) {
    return { valid: false, message: '缺少参数: mobile_list (手机号列表)' }
  }
  const mobileArray = Array.isArray(params.mobile_list) ? params.mobile_list : [params.mobile_list]
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      mobile_list: mobileArray
    }
  }
}))

/**
 * 本地查询好友信息
 * POST /api/friend/query-local
 * 请求体: { "port": 8080, "user_id": "用户ID" }
 */
router.post('/query-local', createAPIHandler(4007, '本地查询好友信息', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  return { valid: true, params: { user_id: params.user_id } }
}))

/**
 * 网络查询陌生人信息
 * POST /api/friend/query-network
 * 请求体: { "port": 8080, "key": "查询关键字" }
 */
router.post('/query-network', createAPIHandler(4008, '网络查询陌生人信息', (params) => {
  if (!params.key) {
    return { valid: false, message: '缺少参数: key (查询关键字)' }
  }
  return { valid: true, params: { key: params.key } }
}))

/**
 * 添加好友【网络查询】
 * POST /api/friend/add-network
 *
 * 须先调用 query-network，再原样使用其返回字段。
 * add_type=1: { port, add_type: 1, corp_id, user_id, openid_or_ticket, msg }
 * add_type=2: { port, add_type: 2, user_id, openid_or_ticket, msg }
 */
router.post('/add-network', createAPIHandler(4009, '添加好友【网络查询】', (params, port) => {
  if (params.add_type === undefined || params.add_type === null || params.add_type === '') {
    return { valid: false, message: '缺少参数: add_type (添加类型，1=企微 2=个微)' }
  }
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.openid_or_ticket) {
    return { valid: false, message: '缺少参数: openid_or_ticket（原样使用 query-network 返回值）' }
  }
  if (!params.msg) {
    return { valid: false, message: '缺少参数: msg (验证消息)' }
  }
  const addType = Number(params.add_type)
  if (addType === 1 && !params.corp_id) {
    return { valid: false, message: '当 add_type=1 时，缺少参数: corp_id (企业ID)' }
  }

  return validateAddNetworkParams(port, {
    add_type: params.add_type,
    user_id: params.user_id,
    openid_or_ticket: params.openid_or_ticket,
    msg: params.msg,
    corp_id: params.corp_id
  })
}))

module.exports = router

