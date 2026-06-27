/**
 * 其他功能相关路由
 * 
 * 授权说明：
 * - 所有接口都需要授权验证
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')
const { isPortInUse } = require('../commons/common')
const { findAvailablePort, runInjectTool, readInjectConfig } = require('../services/wecomInject')
const { notifyWecomInjectStarted } = require('../services/wecomNotify')
const { canInjectPort, markPortStabilizing, recordInjectAttempt } = require('../services/wecomStability')

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
 * 请求体: {
 *   "port": 8080   // 可选；不传则自动分配可用端口（与界面「随机端口」逻辑一致）
 * }
 * 说明：与「添加企微」一致，指定端口时范围为 (1024, 10000]，即 1025-10000
 * 占用：若指定端口已被系统占用则 HTTP 409，body 含 code: PORT_IN_USE
 */
router.post('/start-wecom', async (req, res) => {
  try {
    const raw = req.body.port
    let port

    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      port = parseInt(raw, 10)
      if (Number.isNaN(port) || port <= 1024 || port > 10000) {
        return res.status(400).json({
          success: false,
          message: '端口可用范围(1024, 10000]，即 1025-10000'
        })
      }
      const inUse = await isPortInUse(port)
      if (inUse) {
        return res.status(409).json({
          success: false,
          code: 'PORT_IN_USE',
          message: `指定端口 ${port} 已被系统占用（无法绑定），请更换其他端口或未传 port 由系统自动分配`
        })
      }
    } else {
      const { port: found } = await findAvailablePort()
      port = found
      if (!port) {
        return res.status(500).json({
          success: false,
          message: '未找到可用端口'
        })
      }
    }

    const { serverPort, key } = readInjectConfig()

    const safety = await canInjectPort(port)
    if (!safety.allowed) {
      return res.status(409).json({
        success: false,
        code: 'INJECT_UNSAFE',
        message: safety.reason
      })
    }

    const result = await runInjectTool({ port, serverPort, key })
    const ok = result.success || (result.output && result.output.includes('注入成功'))
    recordInjectAttempt(port, ok)
    if (ok) {
      markPortStabilizing(port)
      notifyWecomInjectStarted(port)
      return res.json({
        success: true,
        data: {
          port,
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

