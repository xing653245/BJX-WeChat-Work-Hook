/**
 * 回调服务器示例
 * 用于接收企微框架推送的消息
 *
 * 启动方式：
 * node scripts/callback_server.js
 * node scripts/callback_server.js 8001
 *
 * 若设置页开启了「消息加密」，启动时传入同一把 64 位十六进制密钥：
 * node scripts/callback_server.js 8001 <64位hex密钥>
 * 或设置环境变量 CALLBACK_ENCRYPT_KEY
 */
const path = require('path')
const express = require('express')
const cors = require('cors')
const {
  decryptCallbackPayload,
  isEncryptedCallbackBody
} = require(path.join(__dirname, '../electron/commons/callbackCrypto'))

const app = express()

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['*'],
  allowedHeaders: ['*']
}))

app.use(express.json({ limit: '8mb' }))

const PORT = process.argv[2] || 8002
const ENCRYPT_KEY = process.env.CALLBACK_ENCRYPT_KEY || process.argv[3] || ''

function unwrapCallbackBody(body) {
  if (!isEncryptedCallbackBody(body)) {
    return body
  }
  if (!ENCRYPT_KEY) {
    throw new Error('收到加密回调，但未提供密钥。请设置 CALLBACK_ENCRYPT_KEY 或传入第三个启动参数')
  }
  return decryptCallbackPayload(body, ENCRYPT_KEY)
}

app.post('/msg', (req, res) => {
  try {
    const data = unwrapCallbackBody(req.body)

    console.log(`[${new Date().toLocaleString('zh-CN')}] 收到回调消息:`)
    if (data.msg_type != null) {
      console.log(`  msg_type: ${data.msg_type}${data.msg_type_text ? ` (${data.msg_type_text})` : ''}`)
    }
    console.log(JSON.stringify(data, null, 2))

    res.json({
      success: true,
      message: '回调接收成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('处理回调消息错误:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'callback-server',
    encrypted: Boolean(ENCRYPT_KEY),
    timestamp: new Date().toISOString()
  })
})

app.get('/', (req, res) => {
  res.json({
    message: '回调服务器运行中',
    endpoints: {
      callback: 'POST /msg - 接收企微回调消息',
      health: 'GET /health - 健康检查'
    }
  })
})

const HOST = '127.0.0.1'

app.listen(PORT, HOST, () => {
  console.log(`📡 监听地址: http://${HOST}:${PORT}`)
  console.log(`📥 回调接口: http://${HOST}:${PORT}/msg`)
  if (ENCRYPT_KEY) {
    console.log('🔐 已启用回调解密（AES-256-GCM）')
  }
})

process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n正在关闭服务器...')
  process.exit(0)
})
