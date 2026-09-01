/**
 * 其他功能相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')
const { readIni } = require('../commons/common')
const { AGENT_HTTP_PORT, getWecomAgentManager } = require('../services/wecomAgentManager')
const { notifyWecomInjectStarted } = require('../services/wecomNotify')

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
 */
router.post('/wx-pid', createAPIHandler(10004, '获取当前微信进程的PID'))

/**
 * 获取当前聊天窗口信息
 * POST /api/other/chat-window
 * 请求体: { "port": 8080 }
 */
router.post('/chat-window', createAPIHandler(10005, '获取当前聊天窗口信息'))

/**
 * 启动企微（注入工具）
 * POST /api/other/start-wecom
 * 请求体可为空；内置 Agent 固定使用 8080，旧调用方传入的 port 会被忽略。
 */
router.post('/start-wecom', async (req, res) => {
  try {
    const config = readIni()
    const frameworkPort = parseInt(config.server_port, 10) || 8888
    const result = await getWecomAgentManager().ensureStarted({
      callbackUrl: `http://127.0.0.1:${frameworkPort}/msg`
    })
    if (result.success) {
      notifyWecomInjectStarted(AGENT_HTTP_PORT, 'HTTP 接口启动')
      return res.json({
        success: true,
        data: {
          port: AGENT_HTTP_PORT,
          output: result.output || ''
        }
      })
    }
    return res.status(500).json({
      success: false,
      message: '启动失败: ' + (result.output || '')
    })
  } catch (error) {
    console.error(`启动企微接口错误: ${error.message}`)
    return res.status(500).json({
      success: false,
      message: `服务器内部错误: ${error.message}`
    })
  }
})

module.exports = router

