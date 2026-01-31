/**
 * 标签管理相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')

/**
 * 获取标签组列表
 * POST /api/tag/groups
 * 请求体: { "port": 8080 }
 * 返回示例：{
    "data": {
        "list": [
            {
                "create_time": "1708796042", //创建时间
                "group_id": "14073749414867782", //分组ID
                "group_name": "客户等级", //分组名
                "group_type": "1", //分组类型 1:企业标签 2:个人标签
                "label_list": [ //标签列表
                    {
                        "create_time": "1708796042", //创建时间
                        "label_id": "14073749414867783", //标签ID
                        "label_name": "一般" //标签名
                    },
                    ...
                ]
            },
            {
                "create_time": "1708796043", //创建时间
                "group_id": "14073753095818178", //分组ID
                "group_name": "个人标签", //分组名
                "group_type": "2", //分组类型 1:企业标签 2:个人标签
                "label_list": [ //标签列表
                    {
                        "create_time": "1709469367", //创建时间
                        "label_id": "14073749711835212", //标签ID
                        "label_name": "男的" //标签名
                    },
                    ...
                ]
            },
            ...
        ]
    },
    "errmsg": "OK",
    "errno": 0
}
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
 * 返回示例：{
    "data": {
        "list": [ //用户ID列表
            "788xxx1",
            "788xxx2"
        ]
    },
    "errmsg": "OK",
    "errno": 0
}
 */
router.post('/friends', createAPIHandler(6006, '获取标签下的联系人', (params) => {
  if (!params.label_id) {
    return { valid: false, message: '缺少参数: label_id (标签ID)' }
  }
  return { valid: true, params: { label_id: params.label_id } }
}))

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

