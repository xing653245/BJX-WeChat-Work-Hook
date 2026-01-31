/**
 * 其他功能相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')

/**
 * 清空聊天记录
 * POST /api/other/clear-chat
 * 请求体: { "port": 8080, "user_id": "用户ID" }
 */
router.post('/clear-chat', createAPIHandler(10000, '清空聊天记录', (params) => {
  if (!params.user_id) {
    return { valid: false, message: '缺少参数: user_id (用户ID)' }
  }
  return { valid: true, params: { user_id: params.user_id } }
}))

/**
 * 语音转文字
 * POST /api/other/voice-to-text
 * 请求体: { "port": 8080, "msg_id": "消息ID" }
 * 返回示例：{
    "data": {
        "text": "你好啊。" //文字内容
    },
    "errmsg": "OK",
    "errno": 0
}
 */
router.post('/voice-to-text', createAPIHandler(10003, '语音转文字', (params) => {
  if (!params.msg_id) {
    return { valid: false, message: '缺少参数: msg_id (消息ID)' }
  }
  return { valid: true, params: { msg_id: params.msg_id } }
}))

/**
 * 获取当前微信进程的PID
 * POST /api/other/wx-pid
 * 请求体: { "port": 8080 }
 * 返回示例：{
    "data": {
        "pid": 17556 //当前微信进程的PID
    },
    "errmsg": "OK",
    "errno": 0
}
 */
router.post('/wx-pid', createAPIHandler(10004, '获取当前微信进程的PID'))

/**
 * 获取当前聊天窗口信息
 * POST /api/other/chat-window
 * 请求体: { "port": 8080 }
 * 返回示例：{
    "data": {
        "is_chat_room": 1, //是否是群聊
        "user_id": "R:1970326367001468" //聊天对象的微信ID、群ID、公众号ID等
    },
    "errmsg": "OK",
    "errno": 0
}
 */
router.post('/chat-window', createAPIHandler(10005, '获取当前聊天窗口信息'))

module.exports = router

