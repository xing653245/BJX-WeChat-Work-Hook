/**
 * 群组相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')

/**
 * 创建群聊【外部】
 * POST /api/group/create
 * 请求体: { 
 *   "port": 8080, 
 *   "name": "群名称",
 *   "user_id_list": ["用户ID1", "用户ID2"] 或 "用户ID"
 * }
 */
router.post('/create', createAPIHandler(5000, '创建群聊【外部】', (params) => {
  if (!params.name) {
    return { valid: false, message: '缺少参数: name (群名称)' }
  }
  if (!params.user_id_list) {
    return { valid: false, message: '缺少参数: user_id_list (用户ID列表)' }
  }
  const userIdArray = Array.isArray(params.user_id_list) ? params.user_id_list : [params.user_id_list]
  return {
    valid: true,
    params: {
      name: params.name,
      user_id_list: userIdArray
    }
  }
}))

/**
 * 创建群聊【内部】
 * POST /api/group/create-internal
 * 请求体: { 
 *   "port": 8080, 
 *   "name": "群名称",
 *   "user_id_list": ["用户ID1", "用户ID2"] 或 "用户ID"
 * }
 */
router.post('/create-internal', createAPIHandler(5001, '创建群聊【内部】', (params) => {
  if (!params.name) {
    return { valid: false, message: '缺少参数: name (群名称)' }
  }
  if (!params.user_id_list) {
    return { valid: false, message: '缺少参数: user_id_list (用户ID列表)' }
  }
  const userIdArray = Array.isArray(params.user_id_list) ? params.user_id_list : [params.user_id_list]
  return {
    valid: true,
    params: {
      name: params.name,
      user_id_list: userIdArray
    }
  }
}))

/**
 * 修改群名称
 * POST /api/group/name
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "name": "新群名称"
 * }
 */
router.post('/name', createAPIHandler(5002, '修改群名称', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.name) {
    return { valid: false, message: '缺少参数: name (新群名称)' }
  }
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      name: params.name
    }
  }
}))

/**
 * 发送群公告
 * POST /api/group/notice
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "content": "公告内容"
 * }
 */
router.post('/notice', createAPIHandler(5003, '发送群公告', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.content) {
    return { valid: false, message: '缺少参数: content (公告内容)' }
  }
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      content: params.content
    }
  }
}))

/**
 * 邀请好友进群（40人以下）
 * POST /api/group/invite
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "user_id_list": ["用户ID1", "用户ID2"] 或 "用户ID"
 * }
 */
router.post('/invite', createAPIHandler(5004, '邀请好友进群（40人以下）', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.user_id_list) {
    return { valid: false, message: '缺少参数: user_id_list (用户ID列表)' }
  }
  const userIdArray = Array.isArray(params.user_id_list) ? params.user_id_list : [params.user_id_list]
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      user_id_list: userIdArray
    }
  }
}))

/**
 * 邀请好友进群（40人以上）
 * POST /api/group/invite-large
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "user_id_list": ["用户ID1", "用户ID2"] 或 "用户ID"
 * }
 */
router.post('/invite-large', createAPIHandler(5005, '邀请好友进群（40人以上）', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.user_id_list) {
    return { valid: false, message: '缺少参数: user_id_list (用户ID列表)' }
  }
  const userIdArray = Array.isArray(params.user_id_list) ? params.user_id_list : [params.user_id_list]
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      user_id_list: userIdArray
    }
  }
}))

/**
 * 移除群成员
 * POST /api/group/remove
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "user_id_list": ["用户ID1", "用户ID2"] 或 "用户ID"
 * }
 */
router.post('/remove', createAPIHandler(5006, '移除群成员', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.user_id_list) {
    return { valid: false, message: '缺少参数: user_id_list (用户ID列表)' }
  }
  const userIdArray = Array.isArray(params.user_id_list) ? params.user_id_list : [params.user_id_list]
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      user_id_list: userIdArray
    }
  }
}))

/**
 * 获取群二维码
 * POST /api/group/qrcode
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "path": "保存路径"
 * }
 */
router.post('/qrcode', createAPIHandler(5007, '获取群二维码', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.path) {
    return { valid: false, message: '缺少参数: path (保存路径)' }
  }
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      path: params.path
    }
  }
}))

/**
 * 获取群信息
 * POST /api/group/info
 * 请求体: { "port": 8080, "chat_room_id": "群ID" }
 */
router.post('/info', createAPIHandler(5008, '获取群信息', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  return { valid: true, params: { chat_room_id: params.chat_room_id } }
}))

/**
 * 获取欢迎语列表
 * POST /api/group/welcome-list
 * 请求体: { "port": 8080 }
 */
router.post('/welcome-list', createAPIHandler(5009, '获取欢迎语列表'))

/**
 * 获取欢迎语
 * POST /api/group/welcome
 * 请求体: { 
 *   "port": 8080, 
 *   "content": "欢迎语内容",
 *   "card_link": {
 *     "title": "标题",
 *     "desc": "描述",
 *     "target_url": "目标URL",
 *     "cover_url": "封面URL"
 *   }
 * }
 */
router.post('/welcome', createAPIHandler(5010, '获取欢迎语', (params) => {
  if (!params.content) {
    return { valid: false, message: '缺少参数: content (欢迎语内容)' }
  }
  return {
    valid: true,
    params: {
      content: params.content,
      card_link: {
        title: params.card_link.title,
        desc: params.card_link.desc,
        target_url: params.card_link.target_url,
        cover_url: params.card_link.cover_url
      }
    }
  }
}))

/**
 * 设置欢迎语
 * POST /api/group/welcome-set
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "welcome_id": "欢迎语ID"
 * }
 */
router.post('/welcome-set', createAPIHandler(5011, '设置欢迎语', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.welcome_id) {
    return { valid: false, message: '缺少参数: welcome_id (欢迎语ID)' }
  }
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      welcome_id: params.welcome_id
    }
  }
}))

/**
 * 删除欢迎语
 * POST /api/group/welcome-delete
 * 请求体: { "port": 8080, "chat_room_id": "群ID" }
 */
router.post('/welcome-delete', createAPIHandler(5012, '删除欢迎语', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  return { valid: true, params: { chat_room_id: params.chat_room_id } }
}))

/**
 * 添加管理员
 * POST /api/group/admin-add
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "user_id_list": ["用户ID1", "用户ID2"] 或 "用户ID"
 * }
 */
router.post('/admin-add', createAPIHandler(5013, '添加管理员', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.user_id_list) {
    return { valid: false, message: '缺少参数: user_id_list (用户ID列表)' }
  }
  const userIdArray = Array.isArray(params.user_id_list) ? params.user_id_list : [params.user_id_list]
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      user_id_list: userIdArray
    }
  }
}))

/**
 * 删除管理员
 * POST /api/group/admin-delete
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "user_id_list": ["用户ID1", "用户ID2"] 或 "用户ID"
 * }
 */
router.post('/admin-delete', createAPIHandler(5014, '删除管理员', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.user_id_list) {
    return { valid: false, message: '缺少参数: user_id_list (用户ID列表)' }
  }
  const userIdArray = Array.isArray(params.user_id_list) ? params.user_id_list : [params.user_id_list]
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      user_id_list: userIdArray
    }
  }
}))

/**
 * 转让群主
 * POST /api/group/transfer
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "user_id": "新群主用户ID"
 * }
 */
router.post('/transfer', createAPIHandler(5015, '转让群主', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (新群主用户ID)' }
  }
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      user_id: params.user_id
    }
  }
}))

/**
 * 退出群聊
 * POST /api/group/quit
 * 请求体: { "port": 8080, "chat_room_id": "群ID" }
 */
router.post('/quit', createAPIHandler(5016, '退出群聊', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  return { valid: true, params: { chat_room_id: params.chat_room_id } }
}))

/**
 * 解散群聊
 * POST /api/group/dismiss
 * 请求体: { "port": 8080, "chat_room_id": "群ID" }
 */
router.post('/dismiss', createAPIHandler(5017, '解散群聊', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  return { valid: true, params: { chat_room_id: params.chat_room_id } }
}))

/**
 * 允许/禁止修改群名
 * POST /api/group/modify-name-setting
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "allow": true/false
 * }
 */
router.post('/modify-name-setting', createAPIHandler(5018, '允许/禁止修改群名', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (params.allow === undefined || params.allow === null) {
    return { valid: false, message: '缺少参数: allow (是否允许)' }
  }
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      state: params.allow
    }
  }
}))

/**
 * 开启/关闭邀请确认
 * POST /api/group/invite-confirm
 * 请求体: { 
 *   "port": 8080, 
 *   "chat_room_id": "群ID",
 *   "state": true/false
 * }
 */
router.post('/invite-confirm', createAPIHandler(5019, '开启/关闭邀请确认', (params) => {
  if (!params.chat_room_id) {
    return { valid: false, message: '缺少参数: chat_room_id (群ID)' }
  }
  if (params.state === undefined || params.state === null) {
    return { valid: false, message: '缺少参数: state (状态)' }
  }
  return {
    valid: true,
    params: {
      chat_room_id: params.chat_room_id,
      state: params.state
    }
  }
}))

module.exports = router

