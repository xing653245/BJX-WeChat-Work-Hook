/**
 * Express服务器 - 供Electron启动
 * 接收企微消息并转发
 * Node.js版本，替代Python FastAPI
 */
const express = require('express')
const cors = require('cors')
const axios = require('axios')
const { readIni, sendCallback, getBusinessCallbackUrl, checkAuthByUserId, killProcessByPort, saveLogToFile } = require('./commons/common')
const { enrichWecomMessage } = require('./commons/msgParser.cjs')
const { messageServerAxiosConfig } = require('./commons/messageBridge')
const { DEFAULT_SERVER_PORT } = require('./configs/defaults')
const { notifyWecomSessionEnded } = require('./services/wecomNotify')

function resolveLogoutPort(payload, loginInfo) {
  const data = payload && typeof payload === 'object' ? payload : {}
  for (const key of ['port', 'robot_port', 'http_port', 'client_port']) {
    const port = parseInt(data[key], 10)
    if (port > 1024 && port <= 10000) return port
  }
  const userId = data.user_id || data.self_user_id
  const list = Array.isArray(loginInfo) ? loginInfo : []
  if (userId) {
    const item = list.find((entry) => entry?.user_id === userId)
    const port = parseInt(item?.port, 10)
    if (port > 1024 && port <= 10000) return port
  }
  if (list.length === 1) {
    const port = parseInt(list[0]?.port, 10)
    if (port > 1024 && port <= 10000) return port
  }
  return NaN
}

// 导入路由
const apiRoutes = require('./routes/index')

const app = express()

// 添加CORS支持
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['*'],
  allowedHeaders: ['*']
}))

// 支持远程合同文件以 Base64 传入；仍保留明确上限，避免意外占用过多内存。
app.use(express.json({ limit: '35mb' }))

// 消息推送地址（由环境变量设置）
const MESSAGE_SERVER_URL = process.env.MESSAGE_SERVER_URL

/**
 * 异步处理企微消息推送（日志、回调），不阻塞对注入层的 HTTP 响应
 */
async function processIncomingWecomMessage(data) {
  const ini_config = readIni()
  // 不按 msg_type 过滤；未知类型同样推送日志与回调，并补充 msg_type_text 便于排查
  const payload = enrichWecomMessage(data)
  const incomingType = Number(payload?.type)
  if (incomingType === 900 || incomingType === 1003) {
    const port = resolveLogoutPort(payload, ini_config.login_info)
    if (!Number.isNaN(port)) {
      try {
        await killProcessByPort(port)
      } catch (error) {
        console.warn(`[企微退出] 结束端口 ${port} 进程失败: ${error.message}`)
      }
      notifyWecomSessionEnded(port, '企微退出')
    }
    try {
      await axios.post(MESSAGE_SERVER_URL || 'http://127.0.0.1:9999/message', {
        ...payload,
        port: Number.isNaN(port) ? payload.port : port
      }, messageServerAxiosConfig())
    } catch (error) {
      console.error(`推送退出登录消息失败: ${error.message}`)
    }
    return
  }

  let self_user_id = payload.self_user_id || ''
  if (self_user_id === '') {
    self_user_id = payload.user_id || ''
  }

  const authResult = checkAuthByUserId(self_user_id, ini_config.login_info)
  const valid_auth = authResult.valid
  const user_id = payload && payload.user_id ? payload.user_id : 'unknown'

  if (ini_config.open_log && valid_auth) {
    try {
      await axios.post(MESSAGE_SERVER_URL || 'http://127.0.0.1:9999/message', payload, messageServerAxiosConfig())
    } catch (error) {
      console.error(`推送消息到Electron失败: ${error.message}`)
    }

    if (ini_config.save_log) {
      saveLogToFile(payload).catch(err => {
        console.error(`保存日志到文件失败: ${err.message}`)
      })
    }
  }

  if (valid_auth) {
    const callbackUrl = getBusinessCallbackUrl(ini_config.callback)
    if (callbackUrl && callbackUrl.includes('http') && callbackUrl.includes('://')) {
      const callbackResult = await sendCallback(callbackUrl, payload)

      if (ini_config.open_log && !callbackResult.success) {
        const callbackLogData = {
          content: callbackResult.message,
          sys: true,
          time_stamp: Math.floor(Date.now() / 1000)
        }

        try {
          await axios.post(MESSAGE_SERVER_URL || 'http://127.0.0.1:9999/message', callbackLogData, messageServerAxiosConfig({ timeout: 1000 }))
        } catch (error) {
          console.error(`推送回调日志到Electron失败: ${error.message}`)
        }

        if (ini_config.save_log) {
          saveLogToFile(callbackLogData).catch(err => {
            console.error(`保存回调日志到文件失败: ${err.message}`)
          })
        }
      }
    }
  } else {
    const error_data = {
      content: authResult.message || '当前授权已到期，请重新购买授权',
      sys: true
    }
    try {
      await axios.post(MESSAGE_SERVER_URL || 'http://127.0.0.1:9999/message', error_data, messageServerAxiosConfig({ timeout: 1000 }))
    } catch (error) {
      console.error(`推送错误消息失败: ${error.message}`)
    }

    if (ini_config.open_log && ini_config.save_log) {
      saveLogToFile(error_data).catch(err => {
        console.error(`保存错误日志到文件失败: ${err.message}`)
      })
    }
  }
}

/**
 * 接收企微消息推送（立即响应 success，避免注入层阻塞；业务异步处理）
 */
app.post('/msg', (req, res) => {
  const data = req.body
  res.json({ message: 'success' })
  processIncomingWecomMessage(data).catch((error) => {
    console.error(`处理消息推送失败: ${error.message}`)
  })
})

/**
 * 根路径
 */
app.get('/', (req, res) => {
  res.json({ 
    message: 'Express Server Running',
      endpoints: {
        message: 'POST /msg - 接收企微消息推送',
        // API路由
        login: '/api/login/* - 登录相关接口',
        user: '/api/user/* - 用户相关接口',
        contact: '/api/contact/* - 联系人/列表相关接口',
        group: '/api/group/* - 群组相关接口',
        message: '/api/message/* - 消息发送接口',
        friend: '/api/friend/* - 好友管理接口',
        tag: '/api/tag/* - 标签管理接口',
        settings: '/api/settings/* - 设置相关接口',
        idConvert: '/api/id-convert/* - ID转换接口',
        cdn: '/api/cdn/* - CDN相关接口',
        other: '/api/other/* - 其他功能接口（含 POST /api/other/start-wecom 启动企微）',
        // 通用接口
        apiCall: 'POST /api/call - 通用企微API调用接口',
        // 兼容接口
        groupMembersLegacy: 'POST /api/group-members - 获取群成员列表（兼容接口）'
      }
  })
})

// 注册API路由
app.use('/api', apiRoutes)

/**
 * 在已有 Express app 上监听端口（不杀占用进程）
 * @param {number} port
 * @returns {Promise<http.Server>}
 */
function listenAppOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(Number(port), '127.0.0.1', () => {
      console.log(`Express服务器启动在端口 ${port}`)
      resolve(server)
    })
    server.on('error', (error) => {
      console.error(`Express服务器启动失败: ${error.message}`)
      reject(error)
    })
  })
}

/**
 * 运行Express服务器
 * @param {number} port - 端口号
 * @returns {Promise<http.Server>} HTTP服务器实例
 */
async function runServer(port) {
  try {
    await killProcessByPort(port)
  } catch (error) {
    // 忽略错误
  }
  return listenAppOnPort(port)
}

// 如果直接运行此文件
if (require.main === module) {
  const port = parseInt(process.argv[2]) || DEFAULT_SERVER_PORT
  runServer(port)
}

module.exports = { app, runServer, listenAppOnPort }

