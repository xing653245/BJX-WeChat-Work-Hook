/**
 * 回调服务器示例
 * 监听地址和路径从 bin/settings.json 的 url 读取
 *
 * 启动方式：
 * node scripts/callback_server.js
 */
const fs = require('fs')
const path = require('path')
const express = require('express')
const cors = require('cors')

const SETTINGS_PATH = path.join(__dirname, '..', 'bin', 'settings.json')

function readCallbackTarget() {
  const text = fs.readFileSync(SETTINGS_PATH, 'utf8').replace(/^\uFEFF/, '')
  const settings = JSON.parse(text)
  const url = String(settings.url || '').trim()
  if (!url) {
    throw new Error(`${SETTINGS_PATH} 未配置 url`)
  }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`settings.json url 不是有效地址: ${url}`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`settings.json url 必须是 HTTP/HTTPS: ${url}`)
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

const target = readCallbackTarget()
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
    console.log(`[${new Date().toLocaleString('zh-CN')}] 收到回调 ${req.method} ${req.originalUrl}`)
    if (data && typeof data === 'object' && !Buffer.isBuffer(data) && data.msg_type != null) {
      console.log(`  msg_type: ${data.msg_type}${data.msg_type_text ? ` (${data.msg_type_text})` : ''}`)
    }
    console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
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
}

app.post(target.pathname, handleCallback)
if (target.pathname.length > 1 && target.pathname.endsWith('/')) {
  app.post(target.pathname.replace(/\/+$/, ''), handleCallback)
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'callback-server',
    url: target.url,
    timestamp: new Date().toISOString()
  })
})

app.get('/', (req, res) => {
  res.json({
    message: '回调服务器运行中',
    callback: `POST ${target.url}`,
    health: 'GET /health'
  })
})

app.use((req, res) => {
  console.log(`[${new Date().toLocaleString('zh-CN')}] 未匹配请求 ${req.method} ${req.originalUrl}`)
  res.status(404).json({
    success: false,
    message: `未找到接口 ${req.method} ${req.originalUrl}，回调请 POST ${target.pathname}`
  })
})

app.listen(target.port, target.host, () => {
  console.log(`📄 配置文件: ${SETTINGS_PATH}`)
  console.log(`📡 监听地址: http://${target.host}:${target.port}`)
  console.log(`📥 回调接口: ${target.url}`)
})

process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n正在关闭服务器...')
  process.exit(0)
})
