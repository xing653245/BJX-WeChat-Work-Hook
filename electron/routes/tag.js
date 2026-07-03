/**
 * 标签管理相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')
const { getUserTags } = require('../services/tagMembership')

/**
 * 获取标签组列表
 * POST /api/tag/groups
 * 请求体: { "port": 8080 }
 */
router.post('/groups', createAPIHandler(6000, '获取标签组列表'))

/**
 * 添加标签
 * POST /api/tag/add
 * 请求体: { 
 *   "port": 8080, 
 *   "group_id": "标签组ID",
 *   "label_name": "标签名称"
 * }
 */
router.post('/add', createAPIHandler(6001, '添加标签', (params) => {
  if (!params.group_id) {
    return { valid: false, message: '缺少参数: group_id (标签组ID)' }
  }
  if (!params.label_name) {
    return { valid: false, message: '缺少参数: label_name (标签名称)' }
  }
  return {
    valid: true,
    params: {
      group_id: params.group_id,
      label_name: params.label_name
    }
  }
}))

/**
 * 修改标签
 * POST /api/tag/modify
 * 请求体: { 
 *   "port": 8080, 
 *   "group_id": "标签组ID",
 *   "label_id": "标签ID",
 *   "label_name": "新标签名称"
 * }
 */
router.post('/modify', createAPIHandler(6002, '修改标签', (params) => {
  if (!params.group_id) {
    return { valid: false, message: '缺少参数: group_id (标签组ID)' }
  }
  if (!params.label_id) {
    return { valid: false, message: '缺少参数: label_id (标签ID)' }
  }
  if (!params.label_name) {
    return { valid: false, message: '缺少参数: label_name (新标签名称)' }
  }
  return {
    valid: true,
    params: {
      group_id: params.group_id,
      label_id: params.label_id,
      label_name: params.label_name
    }
  }
}))

/**
 * 删除标签
 * POST /api/tag/delete
 * 请求体: { 
 *   "port": 8080, 
 *   "group_id": "标签组ID",
 *   "label_id": "标签ID"
 * }
 */
router.post('/delete', createAPIHandler(6003, '删除标签', (params) => {
  if (!params.group_id) {
    return { valid: false, message: '缺少参数: group_id (标签组ID)' }
  }
  if (!params.label_id) {
    return { valid: false, message: '缺少参数: label_id (标签ID)' }
  }
  return {
    valid: true,
    params: {
      group_id: params.group_id,
      label_id: params.label_id
    }
  }
}))

/**
 * 一个好友打多个标签
 * POST /api/tag/add-to-friend
 * 请求体: { 
 *   "port": 8080, 
 *   "user_id": "用户ID",
 *   "label_id_list": ["标签ID1", "标签ID2"] 或 "标签ID"
 * }
 */
router.post('/add-to-friend', createAPIHandler(6004, '一个好友打多个标签', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  if (!params.label_id_list) {
    return { valid: false, message: '缺少参数: label_id_list (标签ID列表)' }
  }
  const labelIdArray = Array.isArray(params.label_id_list) ? params.label_id_list : [params.label_id_list]
  return {
    valid: true,
    params: {
      user_id: params.user_id,
      label_id_list: labelIdArray
    }
  }
}))

/**
 * 一个标签打多个好友
 * POST /api/tag/add-friends
 * 请求体: { 
 *   "port": 8080, 
 *   "label_id": "标签ID",
 *   "user_id_list": ["用户ID1", "用户ID2"] 或 "用户ID"
 * }
 */
router.post('/add-friends', createAPIHandler(6005, '一个标签打多个好友', (params) => {
  if (!params.label_id) {
    return { valid: false, message: '缺少参数: label_id (标签ID)' }
  }
  if (!params.user_id_list) {
    return { valid: false, message: '缺少参数: user_id_list (用户ID列表)' }
  }
  const userIdArray = Array.isArray(params.user_id_list) ? params.user_id_list : [params.user_id_list]
  return {
    valid: true,
    params: {
      label_id: params.label_id,
      user_id_list: userIdArray
    }
  }
}))

/**
 * 获取标签下的联系人
 * POST /api/tag/friends
 * 请求体: { "port": 8080, "label_id": "标签ID" }
 */
router.post('/friends', createAPIHandler(6006, '获取标签下的联系人', (params) => {
  if (!params.label_id) {
    return { valid: false, message: '缺少参数: label_id (标签ID)' }
  }
  return { valid: true, params: { label_id: params.label_id } }
}))

/**
 * 获取用户标签（组合接口，不直连 Hook 新 type）
 * 先调 6000 获取全部标签，再对每个 label_id 调 6006 判断 user_id 是否属于该标签
 * POST /api/tag/user-tags
 * 请求体: { "port": 8080, "user_id": "用户ID" }
 */
router.post('/user-tags', async (req, res) => {
  const apiName = '获取用户标签'

  try {
    const { port, user_id: userId } = req.body

    if (!port) {
      return res.status(400).json({
        success: false,
        message: '缺少参数: port (企微的HTTP端口)'
      })
    }
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少参数: user_id (用户ID)'
      })
    }

    try {
      const data = await getUserTags(port, userId)
      return res.json({
        success: true,
        data
      })
    } catch (error) {
      let errorMessage = `${apiName}失败`
      let statusCode = 500

      if (error.code === 'NO_AUTH' || error.message.includes('未授权') || error.message.includes('授权已到期') || error.message.includes('刷新授权')) {
        statusCode = 403
        errorMessage = error.message
      } else if (error.code === 'APPLET_QUEUE_FULL' || error.code === 'USER_TAGS_QUEUE_FULL') {
        statusCode = 503
        errorMessage = error.message
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = `无法连接到企微服务 (端口 ${port})，请确认企微已启动`
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = '请求超时，请稍后重试'
      } else if (error.response) {
        errorMessage = `企微API返回错误: HTTP ${error.response.status}`
        if (error.response.data) {
          errorMessage += ` - ${JSON.stringify(error.response.data)}`
        }
      } else {
        errorMessage = error.message || errorMessage
      }

      return res.status(statusCode).json({
        success: false,
        message: errorMessage
      })
    }
  } catch (error) {
    console.error(`${apiName}接口错误: ${error.message}`)
    return res.status(500).json({
      success: false,
      message: `服务器内部错误: ${error.message}`
    })
  }
})

/**
 * 删除标签下的联系人
 * POST /api/tag/remove-friends
 * 请求体: { 
 *   "port": 8080, 
 *   "label_id": "标签ID",
 *   "user_id_list": ["用户ID1", "用户ID2"] 或 "用户ID"
 * }
 */
router.post('/remove-friends', createAPIHandler(6007, '删除标签下的联系人', (params) => {
  if (!params.label_id) {
    return { valid: false, message: '缺少参数: label_id (标签ID)' }
  }
  if (!params.user_id_list) {
    return { valid: false, message: '缺少参数: user_id_list (用户ID列表)' }
  }
  const userIdArray = Array.isArray(params.user_id_list) ? params.user_id_list : [params.user_id_list]
  return {
    valid: true,
    params: {
      label_id: params.label_id,
      user_id_list: userIdArray
    }
  }
}))

module.exports = router

