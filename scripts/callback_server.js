/**
 * 回调服务器示例
 * 用于接收企微框架推送的消息
 *
 * 启动方式：
 * node scripts/callback_server.js
 * node scripts/callback_server.js 8002
 *
 * 若设置页开启了「消息加密」，启动时传入 RSA 私钥 PEM 文件路径：
 * node scripts/callback_server.js 8002 ./private.pem
 * 或设置环境变量 CALLBACK_ENCRYPT_PRIVATE_KEY（PEM 文本，可用 \n 表示换行）
 */
const path = require('path')
const fs = require('fs')
const express = require('express')
const cors = require('cors')
const {
  decryptCallbackPayload,
  isEncryptedCallbackBody,
  decodePemFromIni
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

function loadPrivateKey() {
  if (process.env.CALLBACK_ENCRYPT_PRIVATE_KEY) {
    return decodePemFromIni(process.env.CALLBACK_ENCRYPT_PRIVATE_KEY)
  }
  const arg = process.argv[3]
  if (!arg) return ''
  if (arg.includes('BEGIN') && arg.includes('PRIVATE KEY')) {
    return decodePemFromIni(arg)
  }
  const filePath = path.resolve(arg)
  if (fs.existsSync(filePath)) {
    return decodePemFromIni(fs.readFileSync(filePath, 'utf8'))
  }
  return decodePemFromIni(arg)
}

const PRIVATE_KEY = loadPrivateKey()

function unwrapCallbackBody(body) {
  if (!isEncryptedCallbackBody(body)) {
    return body
  }
  if (!PRIVATE_KEY) {
    throw new Error(
      '收到加密回调，但未提供 RSA 私钥。请设置 CALLBACK_ENCRYPT_PRIVATE_KEY 或传入私钥 PEM 文件路径'
    )
  }
  return decryptCallbackPayload(body, PRIVATE_KEY)
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
    encrypted: Boolean(PRIVATE_KEY),
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
  if (PRIVATE_KEY) {
    console.log('🔐 已启用回调解密（RSA-OAEP-SHA256）')
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
