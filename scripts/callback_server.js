/**
 * 回调服务器示例
 * 用于接收企微框架推送的消息
 * 
 * 启动方式：
 * node scripts/callback_server.js
 * 或
 * node scripts/callback_server.js 8001
 */

const express = require('express')
const cors = require('cors')

const app = express()

// 添加CORS支持
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['*'],
  allowedHeaders: ['*']
}))

// 解析JSON请求体
app.use(express.json())

// 接收回调消息的接口
app.post('/msg', (req, res) => {
  try {
    const data = req.body
    
    // 打印接收到的消息（可以在这里处理你的业务逻辑）
    console.log(`[${new Date().toLocaleString('zh-CN')}] 收到回调消息:`)
    if (data.msg_type != null) {
      console.log(`  msg_type: ${data.msg_type}${data.msg_type_text ? ` (${data.msg_type_text})` : ''}`)
    }
    console.log(JSON.stringify(data, null, 2))
    
    // 这里可以添加你的业务逻辑，比如：
    // - 保存到数据库
    // - 转发到其他服务
    // - 处理消息内容
    // - 等等...
    
    // 返回成功响应（必须返回，否则企微框架会认为回调失败）
    res.json({ 
      success: true, 
      message: '回调接收成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('处理回调消息错误:', error)
    // 即使出错也返回成功，避免企微框架重试
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'callback-server',
    timestamp: new Date().toISOString()
  })
})

// 根路径
app.get('/', (req, res) => {
  res.json({ 
    message: '回调服务器运行中',
    endpoints: {
      callback: 'POST /msg - 接收企微回调消息',
      health: 'GET /health - 健康检查'
    }
  })
})

// 启动服务器
const PORT = process.argv[2] || 8001
const HOST = '127.0.0.1'

app.listen(PORT, HOST, () => {
  console.log(`📡 监听地址: http://${HOST}:${PORT}`)
  console.log(`📥 回调接口: http://${HOST}:${PORT}/msg`)
})

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n正在关闭服务器...')
  process.exit(0)
})

