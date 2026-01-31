/**
 * API路由主文件
 * 统一管理所有API路由
 */
const express = require('express')
const router = express.Router()
const { createAPIHandler } = require('../middleware/apiHandler')

// 导入各个模块的路由
const loginRoutes = require('./login')
const contactRoutes = require('./contact')
const groupRoutes = require('./group')
const messageRoutes = require('./message')
const friendRoutes = require('./friend')
const tagRoutes = require('./tag')
const settingsRoutes = require('./settings')
const idConvertRoutes = require('./id-convert')
const cdnRoutes = require('./cdn')
const otherRoutes = require('./other')

// 注册子路由
router.use('/login', loginRoutes)
router.use('/contact', contactRoutes)
router.use('/group', groupRoutes)
router.use('/message', messageRoutes)
router.use('/friend', friendRoutes)
router.use('/tag', tagRoutes)
router.use('/settings', settingsRoutes)
router.use('/id-convert', idConvertRoutes)
router.use('/cdn', cdnRoutes)
router.use('/other', otherRoutes)

/**
 * 通用企微API调用接口
 * 供外部系统调用，支持所有企微API接口
 * 
 * 请求方式: POST /api/call
 * 请求体: {
 *   "port": 8080,           // 企微的HTTP端口（必填）
 *   "type": 2003,           // API类型（必填）
 *   ...其他参数              // 根据不同的type，需要不同的参数
 * }
 */
router.post('/call', async (req, res) => {
  try {
    const { port, type, ...otherParams } = req.body

    // 参数验证
    if (!port) {
      return res.status(400).json({
        success: false,
        message: '缺少参数: port (企微的HTTP端口)'
      })
    }

    if (type === undefined || type === null) {
      return res.status(400).json({
        success: false,
        message: '缺少参数: type (API类型)'
      })
    }

    try {
      const { callVWorkAPI } = require('../middleware/apiHandler')
      const data = await callVWorkAPI(port, type, otherParams)
      res.json({
        success: true,
        data: data
      })
    } catch (error) {
      // 企微API调用失败
      let errorMessage = '调用企微API失败'
      let statusCode = 500

      if (error.message.includes('未授权') || error.message.includes('授权已到期')) {
        statusCode = 403
        errorMessage = error.message
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = `无法连接到企微服务 (端口 ${port})，请确认企微已启动`
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = '请求超时，请稍后重试'
      } else if (error.response) {
        errorMessage = `企微API返回错误: HTTP ${error.response.status} - ${error.response.statusText}`
        if (error.response.data) {
          errorMessage += ` - ${JSON.stringify(error.response.data)}`
        }
      } else {
        errorMessage = error.message || errorMessage
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage
      })
    }
  } catch (error) {
    console.error(`调用企微API接口错误: ${error.message}`)
    res.status(500).json({
      success: false,
      message: `服务器内部错误: ${error.message}`
    })
  }
})

module.exports = router

