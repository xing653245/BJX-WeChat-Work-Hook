const { createDiagnostics } = require('../electron/commons/diagnostics.cjs')
const diagnostics = createDiagnostics('message_callback_server.js')
/**
 * 消息回调服务器
 * 只接收并打印回调，不读取私钥，也不做加密或解密。
 *
 * 启动方式：
 * node scripts/message_callback_server.js http://127.0.0.1:8002/msg
 */
const express = require('express')
const cors = require('cors')

function readCallbackTarget(callbackUrl) {
  const url = String(callbackUrl || '').trim()
  if (!url) {
    throw new Error('请传入回调地址，例如: node scripts/message_callback_server.js http://127.0.0.1:8002/msg')
  }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`回调地址不是有效地址: ${url}`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`回调地址必须是 HTTP/HTTPS: ${url}`)
  }
  const port = parsed.port
    ? Number(parsed.port)
    : (parsed.protocol === 'https:' ? 443 : 80)
  const pathname = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '/'
  return {
    url,
    host: parsed.hostname || '127.0.0.1',
    port,
    pathname
  }
}

function createCallbackApp(target, { logger = console } = {}) {
  const app = express()

  app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['*'],
    allowedHeaders: ['*']
  }))

  app.use(express.json({ limit: '8mb' }))
  app.use(express.urlencoded({ extended: true, limit: '8mb' }))
  app.use(express.text({ type: ['text/*', 'application/octet-stream'], limit: '8mb' }))

  function handleCallback(req, res) {
    try {
      const data = req.body
      logger.log(`[${new Date().toLocaleString('zh-CN')}] 收到回调 ${req.method} ${req.originalUrl}`)
      if (data && typeof data === 'object' && !Buffer.isBuffer(data) && data.msg_type != null) {
        logger.log(`  msg_type: ${data.msg_type}${data.msg_type_text ? ` (${data.msg_type_text})` : ''}`)
      }
      logger.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
      res.json({
        success: true,
        message: '回调接收成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      logger.error('处理回调消息错误:', error.message)
      res.status(500).json({
        success: false,
        message: error.message
      })
    }
  }

  app.post(target.pathname, handleCallback)
  if (target.pathname.length > 1 && target.pathname.endsWith('/')) {
    app.post(target.pathname.replace(/\/+$/, ''), handleCallback)
  }

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'message-callback-server',
      url: target.url,
      timestamp: new Date().toISOString()
    })
  })

  app.get('/', (req, res) => {
    res.json({
      message: '消息回调服务器运行中',
      callback: `POST ${target.url}`,
      health: 'GET /health'
    })
  })

  app.use((req, res) => {
    logger.log(`[${new Date().toLocaleString('zh-CN')}] 未匹配请求 ${req.method} ${req.originalUrl}`)
    res.status(404).json({
      success: false,
      message: `未找到接口 ${req.method} ${req.originalUrl}，回调请 POST ${target.pathname}`
    })
  })

  return app
}

function startServer(callbackUrl = process.argv[2]) {
  const target = readCallbackTarget(callbackUrl)
  const app = createCallbackApp(target)
  const server = app.listen(target.port, target.host, () => {
    diagnostics.info('L001', `命令行回调地址: ${target.url}`)
    diagnostics.info('L002', `监听地址: http://${target.host}:${target.port}`)
    diagnostics.info('L003', `回调接口: ${target.url}`)
    diagnostics.info('L004', '只接收回调，不处理加密')
  })
  server.on('error', error => {
    diagnostics.error('L005', '回调服务器启动失败:', error.message)
    process.exitCode = 1
  })

  process.on('SIGINT', () => {
    diagnostics.info('L006', '\n正在关闭服务器...')
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    diagnostics.info('L007', '\n正在关闭服务器...')
    process.exit(0)
  })
  return server
}

if (require.main === module) {
  try { startServer() } catch (error) {
    diagnostics.error('L008', '回调服务器启动失败:', error.message)
    process.exitCode = 1
  }
}

module.exports = { readCallbackTarget, createCallbackApp }
