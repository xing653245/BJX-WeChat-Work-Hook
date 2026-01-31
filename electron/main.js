const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')
const net = require('net')
const { autoUpdater } = require('electron-updater')
let ini
try {
  ini = require('ini')
} catch (e) {
  // 如果ini包不存在，使用简单的解析器
  ini = {
    parse: (str) => {
      const result = {}
      let currentSection = null
      str.split('\n').forEach(line => {
        line = line.trim()
        if (line.startsWith('[') && line.endsWith(']')) {
          currentSection = line.slice(1, -1)
          result[currentSection] = {}
        } else if (line.includes('=') && currentSection) {
          // 只分割第一个 =，以支持值中包含 = 的情况（如URL）
          const equalIndex = line.indexOf('=')
          const key = line.substring(0, equalIndex).trim()
          let value = line.substring(equalIndex + 1).trim()
          // 如果值被引号包裹，移除引号并处理转义的引号
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'")
          }
          result[currentSection][key] = value
        }
      })
      return result
    },
    stringify: (obj) => {
      let result = ''
      Object.keys(obj).forEach(section => {
        result += `[${section}]\n`
        Object.keys(obj[section]).forEach(key => {
          const value = obj[section][key]
          // 如果值是字符串且包含特殊字符、空格或JSON数组/对象，则添加引号并转义内部引号
          if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{') || value.includes(' ') || value.includes('='))) {
            // 转义字符串中的引号
            const escapedValue = value.replace(/"/g, '\\"')
            result += `${key}="${escapedValue}"\n`
          } else {
            result += `${key}=${value}\n`
          }
        })
        result += '\n'
      })
      return result
    }
  }
}
const axios = require('axios')
const { saveLogToFile, getConfigPath, readIni, sendCallback, validAuthDatetime } = require('./commons/common')
const { DEFAULT_SERVER_PORT, DEFAULT_SERVER_PORT_STRING } = require('./configs/defaults')

let mainWindow
let messageServer = null // 消息接收服务器

// 更新配置
// 注意：更新服务器配置在 package.json 的 build.publish 中设置
// 1. 使用 GitHub Releases: 配置 provider 为 "github"，并设置 owner 和 repo
// 2. 使用自定义服务器: 配置 provider 为 "generic"，并设置 url
// 3. 使用 update.electronjs.org: 需要配置 repository 字段，并确保应用发布到 GitHub Releases
autoUpdater.autoDownload = false // 默认不自动下载，需要用户确认
autoUpdater.autoInstallOnAppQuit = true // 应用退出时自动安装更新

// 如果使用自定义更新服务器，可以在这里设置更新服务器地址
// autoUpdater.setFeedURL({
//   provider: 'generic',
//   url: 'https://your-update-server.com/updates/'
// })

// 更新事件处理
autoUpdater.on('checking-for-update', () => {
  console.log('正在检查更新...')
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status: 'checking', message: '正在检查更新...' })
  }
})

autoUpdater.on('update-available', (info) => {
  console.log('发现新版本:', info.version)
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'available',
      message: `发现新版本: ${info.version}，是否立即下载？`,
      version: info.version,
      releaseNotes: info.releaseNotes || '暂无更新说明'
    })
  }
})

autoUpdater.on('update-not-available', (info) => {
  console.log('当前已是最新版本:', info.version)
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'not-available',
      message: `当前已是最新版本 (${info.version})，无需更新`,
      version: info.version
    })
  }
})

autoUpdater.on('error', (err) => {
  console.error('更新检查失败:', err)
  if (mainWindow) {
    // 将常见错误转换为友好的中文提示
    let errorMessage = '更新检查失败'
    if (err.message) {
      if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
        errorMessage = '无法连接到更新服务器，请检查网络连接'
      } else if (err.message.includes('timeout')) {
        errorMessage = '连接更新服务器超时，请稍后重试'
      } else if (err.message.includes('ECONNREFUSED')) {
        errorMessage = '更新服务器拒绝连接，请稍后重试'
      } else {
        errorMessage = `更新检查失败: ${err.message}`
      }
    }
    mainWindow.webContents.send('update-status', {
      status: 'error',
      message: errorMessage
    })
  }
})

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) {
    const percent = Math.round(progressObj.percent)
    const transferred = (progressObj.transferred / 1024 / 1024).toFixed(2)
    const total = (progressObj.total / 1024 / 1024).toFixed(2)
    mainWindow.webContents.send('update-progress', {
      percent: percent,
      transferred: progressObj.transferred,
      total: progressObj.total,
      message: `正在下载更新: ${percent}% (${transferred}MB / ${total}MB)`
    })
  }
})

autoUpdater.on('update-downloaded', (info) => {
  console.log('更新下载完成:', info.version)
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'downloaded',
      message: `更新下载完成 (版本: ${info.version})，将在应用重启后自动安装`,
      version: info.version
    })
  }
})

// 获取应用资源路径（处理打包后的路径）
const getAppPath = () => {
  // 使用 app.isPackaged 判断是否是打包后的应用
  if (app.isPackaged) {
    // 打包后：process.resourcesPath 指向 resources 目录
    // extraResources 中的 bin 和 conf 目录在 resources 目录中（与 app.asar 同级）
    // 所以直接返回 resources 目录
    return process.resourcesPath
  }
  // 开发环境：返回 electron 目录的父目录（项目根目录）
  return path.join(__dirname, '..')
}

// 启动消息接收服务器（用于接收FastAPI推送的消息）
const startMessageServer = () => {
  const http = require('http')
  const messagePort = 9999 // 固定端口用于消息推送
  
  if (messageServer) {
    messageServer.close()
  }
  
  messageServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/message') {
      let body = ''
      req.on('data', chunk => {
        body += chunk.toString()
      })
      req.on('end', () => {
        try {
          const data = JSON.parse(body)
          // 发送消息到渲染进程
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('fastapi-message', data)
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch (e) {
          console.error('解析消息失败:', e)
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      })
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  
  messageServer.listen(messagePort, '127.0.0.1', () => {
    console.log(`消息接收服务器启动在端口 ${messagePort}`)
  })
  
  messageServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.log(`端口 ${messagePort} 已被占用，尝试使用其他端口`)
    } else {
      console.error('消息服务器错误:', error)
    }
  })
}

// Express 服务器管理（Node.js版本，替代Python FastAPI）
let expressServer = null

const startExpressServer = (port) => {
  // 停止旧服务器
  if (expressServer) {
    try {
      expressServer.close(() => {
        console.log('Express服务器已关闭')
      })
      expressServer = null
    } catch (e) {
      console.error('停止旧服务器失败:', e)
    }
  }
  
  // 先杀死占用端口的进程
  killProcessByPort(port).then(() => {
    // 设置环境变量
    process.env.MESSAGE_SERVER_URL = 'http://127.0.0.1:9999/message'
    
    // 导入并启动Express服务器
    const { runServer } = require('./express_server')
    
    console.log(`启动Express服务器，端口: ${port}`)
    
    runServer(port).then((server) => {
      expressServer = server
      console.log(`Express服务器启动成功，监听端口 ${port}`)
    }).catch((error) => {
      console.error('启动Express服务器失败:', error.message)
      expressServer = null
    })
  })
}

// 根据端口查找PID
const findPidByPort = (port) => {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const { exec } = require('child_process')
      exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
        if (error || !stdout) {
          resolve(-1)
          return
        }
        const lines = stdout.trim().split('\n')
        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          if (parts.length >= 5 && parts[1].includes(`:${port}`)) {
            const pid = parseInt(parts[parts.length - 1])
            if (!isNaN(pid)) {
              resolve(pid)
              return
            }
          }
        }
        resolve(-1)
      })
    } else {
      // Linux/Mac
      const { exec } = require('child_process')
      exec(`lsof -ti:${port}`, (error, stdout) => {
        if (error || !stdout) {
          resolve(-1)
          return
        }
        const pid = parseInt(stdout.trim().split('\n')[0])
        resolve(isNaN(pid) ? -1 : pid)
      })
    }
  })
}

// 根据端口杀死进程
const killProcessByPort = (port) => {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const { exec } = require('child_process')
      exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
        if (error || !stdout) {
          resolve(false)
          return
        }
        const lines = stdout.trim().split('\n')
        const pids = new Set()
        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          if (parts.length >= 5 && parts[1].includes(`:${port}`)) {
            const pid = parseInt(parts[parts.length - 1])
            if (!isNaN(pid)) {
              pids.add(pid)
            }
          }
        }
        if (pids.size === 0) {
          resolve(false)
          return
        }
        // 杀死所有找到的进程
        let killed = 0
        pids.forEach(pid => {
          exec(`taskkill /F /PID ${pid}`, (err) => {
            if (!err) killed++
            if (killed === pids.size) {
              resolve(killed > 0)
            }
          })
        })
        if (pids.size === 0) {
          resolve(false)
        }
      })
    } else {
      // Linux/Mac
      const { exec } = require('child_process')
      exec(`lsof -ti:${port} | xargs kill -9`, (error) => {
        resolve(!error)
      })
    }
  })
}

// 读取配置文件
const readConfig = () => {
  // 使用 commons/common.js 中的 getConfigPath，确保开发环境和打包环境路径一致
  const configPath = getConfigPath()
  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    return ini.parse(content)
  } catch (error) {
    console.error('读取配置失败:', error)
    return {
      sys: {
        server_port: DEFAULT_SERVER_PORT_STRING,
        callback: '',
        open_log: 'true',
        save_log: 'true'
      },
      custom: {
        login_info: '[]'
      }
    }
  }
}

// 保存配置文件
const saveConfig = (config) => {
  // 使用 commons/common.js 中的 getConfigPath，确保与读取路径一致
  const configPath = getConfigPath()
  try {
    const content = ini.stringify(config)
    fs.writeFileSync(configPath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存配置失败:', error)
    return { success: false, msg: error.message }
  }
}

function createWindow() {
  // 图标路径：开发环境使用源文件，生产环境使用打包后的文件
  let iconPath
  if (app.isPackaged) {
    // 打包后：图标应该在 dist 目录中（通过 public 目录复制）
    iconPath = path.join(app.getAppPath(), 'dist', 'bg.png')
    // 如果 dist 中没有，尝试从 app.asar 外部查找
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(process.resourcesPath, '..', 'dist', 'bg.png')
    }
  } else {
    // 开发环境：使用 public 目录或 src/assets 目录
    iconPath = path.join(__dirname, '../public/bg.png')
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, '../src/assets/bg.png')
    }
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // 在打包后，preload 脚本在 app.asar 中，路径会自动处理
    },
    icon: iconPath,
    title: '北极熊企微框架Pro'
  })

  // 开发环境加载本地服务器，生产环境加载构建后的文件
  // 检查是否是开发模式（通过检查 dist 目录是否存在来判断）
  let distPath
  if (app.isPackaged) {
    // 打包后：dist 目录内容在 app.asar 中，使用 app.getAppPath() 获取 asar 路径
    // files 配置中的 dist/**/* 会保持目录结构，所以路径是 dist/index.html
    distPath = path.join(app.getAppPath(), 'dist', 'index.html')
  } else {
    // 开发环境：dist 目录在项目根目录
    distPath = path.join(__dirname, '../dist/index.html')
  }
  const isDev = !fs.existsSync(distPath) || process.env.NODE_ENV === 'development'
  
  console.log('Environment:', process.env.NODE_ENV)
  console.log('isDev:', isDev)
  console.log('distPath exists:', fs.existsSync(distPath))
  
  if (isDev) {
    // 开发模式：等待 Vite 服务器启动
    let retryCount = 0
    const maxRetries = 30 // 最多等待30秒
    
    const checkServer = () => {
      const http = require('http')
      console.log(`Checking Vite server... (attempt ${retryCount + 1}/${maxRetries})`)
      
      const req = http.get('http://localhost:5173', (res) => {
        console.log('Vite server responded with status:', res.statusCode)
        if (res.statusCode === 200) {
          console.log('Loading http://localhost:5173')
          mainWindow.loadURL('http://localhost:5173')
          mainWindow.webContents.openDevTools()
        } else {
          retryCount++
          if (retryCount < maxRetries) {
            setTimeout(checkServer, 1000)
          } else {
            console.error('Vite server not available after 30 seconds')
            mainWindow.loadURL('http://localhost:5173') // 仍然尝试加载
          }
        }
      })
      
      req.on('error', (err) => {
        console.log('Vite server check error:', err.message)
        retryCount++
        if (retryCount < maxRetries) {
          setTimeout(checkServer, 1000)
        } else {
          console.error('Vite server not available after 30 seconds')
          mainWindow.loadURL('http://localhost:5173') // 仍然尝试加载
        }
      })
      
      req.setTimeout(5000, () => {
        req.destroy()
        retryCount++
        if (retryCount < maxRetries) {
          setTimeout(checkServer, 1000)
        } else {
          console.error('Vite server timeout after 30 seconds')
          mainWindow.loadURL('http://localhost:5173') // 仍然尝试加载
        }
      })
    }
    
    // 立即尝试一次，如果失败则开始重试
    checkServer()
  } else {
    console.log('Loading production build from:', distPath)
    mainWindow.loadFile(distPath)
  }
  
  // 监听页面加载错误
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', validatedURL, 'Error:', errorCode, errorDescription)
  })
  
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    if (expressServer) {
      expressServer.close(() => {
        console.log('Express服务器已关闭')
      })
    }
    if (messageServer) {
      messageServer.close()
    }
  })

  // 根据环境设置菜单栏：开发环境显示，生产环境隐藏
  if (isDev) {
    // 开发环境：使用默认菜单或自定义菜单
    const template = [
      {
        label: 'File',
        submenu: [
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About',
            click: () => {
              // 可以添加关于对话框
            }
          }
        ]
      }
    ]
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
  } else {
    // 生产环境：隐藏菜单栏
    Menu.setApplicationMenu(null)
  }
}

app.whenReady().then(() => {
  createWindow()
  
  // 启动消息接收服务器
  startMessageServer()
  
  // 启动Express服务器（Node.js版本）
  const config = readConfig()
  startExpressServer(parseInt(config.sys?.server_port || DEFAULT_SERVER_PORT))

  // 如果是生产环境且开启了自动更新，则启动时检查更新
  if (app.isPackaged) {
    const updateConfig = readConfig()
    const autoCheckUpdate = updateConfig.sys?.auto_check_update === 'true' || updateConfig.sys?.auto_check_update === true
    if (autoCheckUpdate) {
      // 延迟3秒后检查更新，避免影响应用启动速度
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(err => {
          console.error('自动检查更新失败:', err)
        })
      }, 3000)
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC 通信处理
ipcMain.handle('read-config', () => {
  return readConfig()
})

ipcMain.handle('save-config', (event, config) => {
  return saveConfig(config)
})

ipcMain.handle('call-api', async (event, { url, method = 'POST', data }) => {
  try {
    const response = await axios({
      method,
      url,
      data,
      timeout: 10000
    })
    
    // 提取端口号（URL格式：http://127.0.0.1:${port}/api）
    const portMatch = url.match(/http:\/\/127\.0\.0\.1:(\d+)\/api/)
    const port = portMatch ? parseInt(portMatch[1]) : null
    
    // 如果成功获取响应，记录日志并发送回调
    if (port && response.data) {
      try {
        // 读取配置
        const ini_config = readIni()
        
        // 根据端口查找对应的登录信息
        let target_item = null
        let user_id = ''
        for (const item of ini_config.login_info) {
          if (String(item.port) === String(port)) {
            target_item = item
            user_id = item.user_id || ''
            break
          }
        }
        
        // 构建API调用日志数据
        const apiType = data && data.type ? data.type : 'unknown'
        const apiTypeNames = {
          1000: '获取登录状态',
          1001: '刷新并获取登录二维码',
          1002: '获取个人信息',
          1003: '退出登录',
          1004: '退出登录通知',
          1005: '输入登录验证码',
          2003: '获取群成员列表',
          3000: '发送文本消息',
          3001: '发送图片消息',
          3006: '发送小程序',
          3009: '发送群@消息',
          5008: '获取群信息',
          9001: 'CDN下载企微图片',
          9004: 'CDN下载个微图片/视频/文件'
        }
        const apiName = apiTypeNames[apiType] || `API调用(type:${apiType})`
        
        // 检查授权是否有效
        const expire = target_item ? target_item.expire : ''
        const valid_auth = validAuthDatetime(expire)
        
        // 登录相关的API类型（这些API在登录过程中会被调用，即使还没有授权信息也应该记录日志）
        const LOGIN_RELATED_API_TYPES = new Set([1000, 1002]) // 1000: 获取登录状态, 1002: 获取个人信息
        
        // 判断是否应该记录日志：
        // 1. 登录相关的API（即使没有授权信息也记录）
        // 2. 或者授权有效
        const shouldLog = ini_config.open_log && (
          LOGIN_RELATED_API_TYPES.has(apiType) || valid_auth
        )
        
        // 判断API调用是否成功
        // 企微API通常返回 { code: 0, data: {...} } 格式，code为0表示成功
        const responseData = response.data
        const isSuccess = responseData && (
          responseData.code === 0 || 
          responseData.code === undefined || 
          (responseData.status !== undefined && responseData.status === 1) ||
          (!responseData.msg && !responseData.error && !responseData.message)
        )
        
        // 构建日志内容：成功时只显示成功信息，失败时显示失败原因
        let logContent = ''
        if (isSuccess) {
          logContent = '调用成功'
        } else {
          // 提取失败原因
          const errorMsg = responseData.msg || responseData.error || responseData.message || responseData.err_msg || '未知错误'
          logContent = `调用失败: ${errorMsg}`
        }
        
        // 构建用于前端显示的日志数据
        const displayLogData = {
          type: 'api_call',
          api_name: apiName,
          port: port,
          user_id: user_id,
          self_user_id: apiName, // 用于在运行日志页面显示为"发言者"
          content: logContent,
          time_stamp: Math.floor(Date.now() / 1000),
          sys: false
        }
        
        // 构建用于回调的完整数据（包含详细请求和响应）
        const callbackLogData = {
          type: 'api_call',
          api_name: apiName,
          port: port,
          user_id: user_id,
          response_data: response.data,
          time_stamp: displayLogData.time_stamp
        }
        
        // 如果应该记录日志，推送消息到Electron主进程
        if (shouldLog) {
          try {
            const MESSAGE_SERVER_URL = process.env.MESSAGE_SERVER_URL || 'http://127.0.0.1:9999/message'
            await axios.post(MESSAGE_SERVER_URL, displayLogData, {
              timeout: 1000
            })
          } catch (error) {
            console.error(`推送API调用日志到Electron失败: ${error.message}`)
          }
          
          // 如果开启了保存日志功能，保存日志到文件
          if (ini_config.save_log) {
            // 格式化日志内容用于文件保存（与显示日志使用相同的内容）
            const fileLogData = {
              content: `[${apiName}] ${logContent}`,
              sys: false,
              time_stamp: displayLogData.time_stamp,
              user_id: user_id,
              nick_name: target_item ? target_item.nick_name : ''
            }
            saveLogToFile(fileLogData).catch(err => {
              console.error(`保存API调用日志到文件失败: ${err.message}`)
            })
          }
        }
        
        // 判断是否应该发送回调：
        // 1. 登录相关的API（1000, 1002）无论授权状态如何都发送回调
        // 2. 其他API需要授权有效才发送回调
        const shouldSendCallback = LOGIN_RELATED_API_TYPES.has(apiType) || valid_auth
        
        if (shouldSendCallback) {
          if (ini_config.callback && ini_config.callback.includes('http') && ini_config.callback.includes('://')) {
            const callbackResult = await sendCallback(ini_config.callback, callbackLogData)
            
            // 如果开启了日志且回调失败，将回调失败信息推送到前端
            if (ini_config.open_log && !callbackResult.success) {
              const callbackErrorLogData = {
                content: callbackResult.message,
                sys: true,
                time_stamp: Math.floor(Date.now() / 1000)
              }
              
              try {
                const MESSAGE_SERVER_URL = process.env.MESSAGE_SERVER_URL || 'http://127.0.0.1:9999/message'
                await axios.post(MESSAGE_SERVER_URL, callbackErrorLogData, {
                  timeout: 1000
                })
              } catch (error) {
                console.error(`推送回调日志到Electron失败: ${error.message}`)
              }
              
              // 如果开启了保存日志功能，保存回调日志到文件
              if (ini_config.save_log) {
                saveLogToFile(callbackErrorLogData).catch(err => {
                  console.error(`保存回调日志到文件失败: ${err.message}`)
                })
              }
            }
          }
        }
      } catch (logError) {
        // 日志记录失败不影响API调用结果
        console.error(`记录API调用日志失败: ${logError.message}`)
      }
    }
    
    return { success: true, data: response.data }
  } catch (error) {
    return { success: false, msg: error.message, data: null }
  }
})

// 检查端口是否在使用
ipcMain.handle('check-port', async (event, port) => {
  const net = require('net')
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(port, () => {
      server.once('close', () => resolve({ inUse: false }))
      server.close()
    })
    server.on('error', () => resolve({ inUse: true }))
  })
})

// 查找可用端口（随机生成并检查是否被占用）
ipcMain.handle('find-available-port', async (event, startPort = 1024) => {
  const net = require('net')
  const minPort = startPort || 1024
  const maxPort = 65535
  const maxAttempts = 1000 // 最大尝试次数，避免无限循环
  
  // 检查端口是否可用的辅助函数
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer()
      server.listen(port, () => {
        server.once('close', () => resolve(true))
        server.close()
      })
      server.on('error', () => resolve(false))
    })
  }
  
  // 生成随机端口
  const generateRandomPort = () => {
    return Math.floor(Math.random() * (maxPort - minPort + 1)) + minPort
  }
  
  // 随机生成并检查端口，直到找到可用端口
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = generateRandomPort()
    const isAvailable = await isPortAvailable(port)
    
    if (isAvailable) {
      return { port }
    }
  }
  
  // 如果随机生成失败，回退到顺序查找
  for (let port = minPort; port <= maxPort; port++) {
    const isAvailable = await isPortAvailable(port)
    if (isAvailable) {
      return { port }
    }
  }
  
  return { port: null }
})

// 执行注入工具（需要根据实际情况调整）
ipcMain.handle('run-inject-tool', async (event, { port, serverPort, key }) => {
  const injectToolPath = path.join(getAppPath(), 'bin/it.exe')
  return new Promise((resolve) => {
    const child = spawn(injectToolPath, [
      'start',
      String(port),
      `--my_port=${serverPort}`,
      `--key=${key}`
    ])
    
    let output = ''
    child.stdout.on('data', (data) => {
      output += data.toString()
    })
    child.stderr.on('data', (data) => {
      output += data.toString()
    })
    
    child.on('close', (code) => {
      resolve({ success: code === 0, output })
    })
  })
})

// 获取授权信息
ipcMain.handle('get-auth-info', async (event, wxid) => {
  const backendIp = '8.137.76.99'
  const authUrl = `http://${backendIp}:5516/polarBear/getAuthInfo/${wxid}`
  try {
    const response = await axios.get(authUrl, { timeout: 10000 })
    const result = { success: true, data: response.data }
    
    // 读取配置，检查是否开启日志
    const config = readConfig()
    const openLog = config.sys?.open_log === 'true' || config.sys?.open_log === true
    const saveLog = config.sys?.save_log === 'true' || config.sys?.save_log === true
    
    // 如果开启了日志，写入运行日志
    if (openLog && saveLog) {
      let expire = '未授权'
      if (result.data && result.data.data) {
        expire = result.data.data.expire || '未授权'
      }
      
      const logData = {
        content: `刷新授权: ${wxid}, 到期时间: ${expire}`,
        sys: true,
        time_stamp: Math.floor(Date.now() / 1000)
      }
      
      // 异步写入日志，不阻塞返回值
      saveLogToFile(logData).catch(err => {
        console.error(`保存授权刷新日志失败: ${err.message}`)
      })
      
      // 同时推送到前端显示（如果开启了日志推送）
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('fastapi-message', logData)
      }
    }
    
    return result
  } catch (error) {
    const result = { success: false, msg: '获取授权信息失败，请稍后重试', data: null }
    
    // 读取配置，检查是否开启日志
    const config = readConfig()
    const openLog = config.sys?.open_log === 'true' || config.sys?.open_log === true
    const saveLog = config.sys?.save_log === 'true' || config.sys?.save_log === true
    
    // 如果开启了日志，写入错误日志
    if (openLog && saveLog) {
      const logData = {
        content: `刷新授权失败: ${wxid}, 错误: ${error.message || '获取授权信息失败，请稍后重试'}`,
        sys: true,
        time_stamp: Math.floor(Date.now() / 1000)
      }
      
      // 异步写入日志，不阻塞返回值
      saveLogToFile(logData).catch(err => {
        console.error(`保存授权刷新错误日志失败: ${err.message}`)
      })
      
      // 同时推送到前端显示（如果开启了日志推送）
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('fastapi-message', logData)
      }
    }
    
    return result
  }
})

// 打开外部链接
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url)
})

// 根据端口查找PID
ipcMain.handle('find-pid-by-port', async (event, port) => {
  return await findPidByPort(port)
})

// 根据端口杀死进程
ipcMain.handle('kill-process-by-port', async (event, port) => {
  return await killProcessByPort(port)
})

// 检查端口是否在使用
ipcMain.handle('is-port-in-use', async (event, port) => {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(port, () => {
      server.once('close', () => resolve({ inUse: false }))
      server.close()
    })
    server.on('error', () => resolve({ inUse: true }))
  })
})

// 重启Express服务器
ipcMain.handle('restart-express-server', async (event, port) => {
  startExpressServer(port)
  return { success: true }
})

// 兼容旧名称
ipcMain.handle('restart-fastapi-server', async (event, port) => {
  startExpressServer(port)
  return { success: true }
})

// 发送消息到渲染进程（用于日志推送）
ipcMain.on('send-message-to-renderer', (event, data) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('fastapi-message', data)
  }
})

// 更新相关 IPC 处理
ipcMain.handle('check-for-updates', async () => {
  try {
    if (!app.isPackaged) {
      return { success: false, message: '开发环境下无法检查更新' }
    }
    await autoUpdater.checkForUpdates()
    return { success: true, message: '正在检查更新，请稍候...' }
  } catch (error) {
    // 将错误转换为友好的中文提示
    let errorMessage = '检查更新失败'
    if (error.message) {
      if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        errorMessage = '无法连接到更新服务器，请检查网络连接'
      } else if (error.message.includes('timeout')) {
        errorMessage = '连接更新服务器超时，请稍后重试'
      } else {
        errorMessage = `检查更新失败: ${error.message}`
      }
    }
    return { success: false, message: errorMessage }
  }
})

ipcMain.handle('download-update', async () => {
  try {
    if (!app.isPackaged) {
      return { success: false, message: '开发环境下无法下载更新' }
    }
    await autoUpdater.downloadUpdate()
    return { success: true, message: '开始下载更新，请稍候...' }
  } catch (error) {
    // 将错误转换为友好的中文提示
    let errorMessage = '下载更新失败'
    if (error.message) {
      if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        errorMessage = '无法连接到更新服务器，请检查网络连接'
      } else if (error.message.includes('timeout')) {
        errorMessage = '下载超时，请稍后重试'
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = '更新服务器拒绝连接，请稍后重试'
      } else {
        errorMessage = `下载更新失败: ${error.message}`
      }
    }
    return { success: false, message: errorMessage }
  }
})

ipcMain.handle('quit-and-install', async () => {
  try {
    autoUpdater.quitAndInstall(false, true)
    return { success: true, message: '正在退出应用并安装更新...' }
  } catch (error) {
    // 将错误转换为友好的中文提示
    let errorMessage = '安装更新失败'
    if (error.message) {
      errorMessage = `安装更新失败: ${error.message}`
    }
    return { success: false, message: errorMessage }
  }
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// 保存日志到文件
ipcMain.handle('save-log-to-file', async (event, data) => {
  try {
    const result = await saveLogToFile(data)
    return { success: result }
  } catch (error) {
    console.error('保存日志失败:', error)
    return { success: false, message: error.message }
  }
})

// 发送回调
ipcMain.handle('send-callback', async (event, { url, data }) => {
  try {
    const result = await sendCallback(url, data)
    return result
  } catch (error) {
    console.error('发送回调失败:', error)
    return { success: false, message: error.message }
  }
})

