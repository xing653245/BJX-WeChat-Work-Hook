/**
 * Express服务器 - 供Electron启动
 * 接收企微消息并转发
 * Node.js版本，替代Python FastAPI
 */
const express = require('express')
const cors = require('cors')
const axios = require('axios')
const { readIni, sendCallback, validAuthDatetime, killProcessByPort, saveLogToFile } = require('./commons/common')
const { DEFAULT_SERVER_PORT } = require('./configs/defaults')

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

// 解析JSON请求体
app.use(express.json())

// 消息推送地址（由环境变量设置）
const MESSAGE_SERVER_URL = process.env.MESSAGE_SERVER_URL

/**
 * 接收企微消息推送
 */
app.post('/msg', async (req, res) => {
  try {
    const data = req.body
    let self_user_id = data.self_user_id || ''
    if (self_user_id === '') {
      self_user_id = data.user_id || ''
    }

    // 读取配置
    const ini_config = readIni()
    let target_item = null
    for (const item of ini_config.login_info) {
      if (item.user_id === self_user_id) {
        target_item = item
        break
      }
    }

    const expire = target_item ? target_item.expire : ''
    const user_id = data && data.user_id ? data.user_id : 'unknown'
    
    const valid_auth = user_id === 'unknown' ? true : validAuthDatetime(expire)

    // 如果开启日志且授权有效，推送消息到Electron主进程
    if (ini_config.open_log && valid_auth) {
      try {
        await axios.post(MESSAGE_SERVER_URL || 'http://127.0.0.1:9999/message', data, {
          timeout: 15000
        })
      } catch (error) {
        console.error(`推送消息到Electron失败: ${error.message}`)
      }
      
      // 如果开启了保存日志功能，保存日志到文件
      if (ini_config.save_log) {
        saveLogToFile(data).catch(err => {
          console.error(`保存日志到文件失败: ${err.message}`)
        })
      }
    }

    // 如果授权有效，发送回调
    if (valid_auth) {
      if (ini_config.callback && ini_config.callback.includes('http') && ini_config.callback.includes('://')) {
        const callbackResult = await sendCallback(ini_config.callback, data)
        
        // 如果开启了日志且回调失败，将回调失败信息推送到前端
        if (ini_config.open_log && !callbackResult.success) {
          const callbackLogData = {
            content: callbackResult.message, // message 已经包含了完整错误信息
            sys: true,
            time_stamp: Math.floor(Date.now() / 1000)
          }
          
          try {
            await axios.post(MESSAGE_SERVER_URL, callbackLogData, {
              timeout: 1000
            })
          } catch (error) {
            console.error(`推送回调日志到Electron失败: ${error.message}`)
          }
          
          // 如果开启了保存日志功能，保存回调日志到文件
          if (ini_config.save_log) {
            saveLogToFile(callbackLogData).catch(err => {
              console.error(`保存回调日志到文件失败: ${err.message}`)
            })
          }
        }
      }
    } else {
      // 授权过期，推送错误消息
      const error_data = {
        content: '当前授权已到期，请重新购买授权',
        sys: true
      }
      try {
        await axios.post(MESSAGE_SERVER_URL, error_data, {
          timeout: 1000
        })
      } catch (error) {
        console.error(`推送错误消息失败: ${error.message}`)
      }
      
      // 如果开启了保存日志功能，保存错误消息到日志文件
      if (ini_config.open_log && ini_config.save_log) {
        saveLogToFile(error_data).catch(err => {
          console.error(`保存错误日志到文件失败: ${err.message}`)
        })
      }
    }

    res.json({ message: 'success' })
  } catch (error) {
    console.error(`处理消息错误: ${error.message}`)
    res.json({ message: 'success' }) // 即使出错也返回success，避免企微重试
  }
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
 * 运行Express服务器
 * @param {number} port - 端口号
 * @returns {Promise<http.Server>} HTTP服务器实例
 */
async function runServer(port) {
  // 先杀死占用端口的进程
  try {
    await killProcessByPort(port)
  } catch (error) {
    // 忽略错误
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      console.log(`Express服务器启动在端口 ${port}`)
      resolve(server)
    })
    
    server.on('error', (error) => {
      console.error(`Express服务器启动失败: ${error.message}`)
      reject(error)
    })
  })
}

// 如果直接运行此文件
if (require.main === module) {
  const port = parseInt(process.argv[2]) || DEFAULT_SERVER_PORT
  runServer(port)
}

module.exports = { app, runServer }

