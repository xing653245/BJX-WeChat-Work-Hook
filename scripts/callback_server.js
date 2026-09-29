/**
 * 回调服务器示例
 * 监听地址和路径从 bin/settings.json 的 url 读取
 *
 * 启动方式：
 * node scripts/callback_server.js
 * 加密回调：先设置 CALLBACK_PRIVATE_KEY_FILE 为配对的 PEM 私钥文件路径。
 * 详见 docs/callback-server.md。
 */
const fs = require('fs')
const path = require('path')
const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const { TextDecoder } = require('util')
const { parseJsonDocument } = require('../electron/services/injectSettings')

const SETTINGS_PATH = path.join(__dirname, '..', 'bin', 'settings.json')

function readCallbackTarget(settingsPath = SETTINGS_PATH) {
  const settings = parseJsonDocument(fs.readFileSync(settingsPath, 'utf8'))
  const url = String(settings.url || '').trim()
  if (!url) {
    throw new Error(`${settingsPath} 未配置 url`)
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

function loadPrivateKey(filePath) {
  if (!filePath) return null
  let key
  try {
    key = crypto.createPrivateKey(fs.readFileSync(filePath))
  } catch {
    throw new Error('无法读取 RSA 私钥，请检查 CALLBACK_PRIVATE_KEY_FILE（PEM 格式的 PKCS#1 或 PKCS#8 私钥）')
  }
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength !== 1024) {
    throw new Error('回调解密需要 RSA 1024 bits 私钥')
  }
  // 启动时验证运行时能力，不关闭 Node 的安全保护或自行实现 RSA 填充。
  try {
    const probe = Buffer.from('callback-rsa-check')
    const encrypted = crypto.publicEncrypt({ key: crypto.createPublicKey(key), padding: crypto.constants.RSA_PKCS1_PADDING }, probe)
    const decrypted = crypto.privateDecrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, encrypted)
    if (!decrypted.equals(probe)) throw new Error('RSA self-test failed')
  } catch {
    throw new Error('当前 Node/OpenSSL 不支持 RSA PKCS#1 v1.5 私钥解密，请使用支持 implicit rejection 的 Node 版本（参见 docs/callback-server.md）')
  }
  return key
}

function decodeCallback(body, privateKey) {
  // 只有明确标记 encrypted: true 的信封才解密，明文不做转换。
  if (!body || typeof body !== 'object' || body.encrypted !== true) return body
  if (!privateKey) {
    const error = new Error('未配置解密私钥，请设置 CALLBACK_PRIVATE_KEY_FILE 后重启')
    error.status = 503
    throw error
  }
  try {
    if (!Array.isArray(body.data) || body.data.length === 0) throw new Error('Invalid envelope')
    const chunks = body.data.map(chunk => {
      if (typeof chunk !== 'string') throw new Error('Invalid block')
      const base64 = chunk.replace(/\s+/g, '')
      const bytes = Buffer.from(base64, 'base64')
      // 1024 bits RSA：每个密文块恰好 128 字节，拒绝宽松 Base64 解码。
      if (bytes.length !== 128 || bytes.toString('base64') !== base64) throw new Error('Invalid block')
      return bytes
    })
    const decrypted = chunks.map(chunk => crypto.privateDecrypt({
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    }, chunk))
    // 必须先拼字节再解码，中文或 emoji 可能跨越 RSA 分段边界。
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(decrypted))
    try { return JSON.parse(text) } catch { return text }
  } catch {
    const error = new Error('加密回调解密失败，请检查配对私钥和密文格式')
    error.status = 400
    throw error
  }
}

function createCallbackApp(target, { privateKey = null, logger = console } = {}) {
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
      const data = decodeCallback(req.body, privateKey)
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
      res.status(error.status || 500).json({
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
    logger.log(`[${new Date().toLocaleString('zh-CN')}] 未匹配请求 ${req.method} ${req.originalUrl}`)
    res.status(404).json({
      success: false,
      message: `未找到接口 ${req.method} ${req.originalUrl}，回调请 POST ${target.pathname}`
    })
  })

  return app
}

function startServer() {
  const target = readCallbackTarget()
  const privateKey = loadPrivateKey(process.env.CALLBACK_PRIVATE_KEY_FILE)
  const app = createCallbackApp(target, { privateKey })
  const server = app.listen(target.port, target.host, () => {
    console.log(`📄 配置文件: ${SETTINGS_PATH}`)
    console.log(`📡 监听地址: http://${target.host}:${target.port}`)
    console.log(`📥 回调接口: ${target.url}`)
    console.log(`🔑 RSA 解密: ${privateKey ? '已配置（1024 bits / PKCS#1 v1.5）' : '未配置私钥，仍可接收明文'}`)
  })
  server.on('error', error => {
    console.error('回调服务器启动失败:', error.message)
    process.exitCode = 1
  })

  process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...')
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\n正在关闭服务器...')
    process.exit(0)
  })
  return server
}

if (require.main === module) {
  try { startServer() } catch (error) {
    console.error('回调服务器启动失败:', error.message)
    process.exitCode = 1
  }
}

module.exports = { readCallbackTarget, loadPrivateKey, decodeCallback, createCallbackApp }
