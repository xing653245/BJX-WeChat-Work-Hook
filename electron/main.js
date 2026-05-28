const { app, BrowserWindow, ipcMain, shell, Menu, dialog, Tray, nativeImage } = require('electron')
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
const { DEFAULT_SERVER_PORT, DEFAULT_SERVER_PORT_STRING, DEFAULT_INJECT_KEY } = require('./configs/defaults')
const {
  checkPortListenAvailable,
  findAvailablePort: findAvailablePortForInject,
  runInjectTool: runInjectToolService
} = require('./services/wecomInject')
const { tryCloseWecomCrashDialogs } = require('./services/wecomCrashDialog')

let mainWindow
/** 系统托盘（「最小化到托盘」时创建，任务栏隐藏图标区显示的是 Tray，不是 minimize） */
let tray = null
/** 为 true 时允许主窗口真正关闭（避免关闭确认与再次拦截） */
let allowMainWindowClose = false
let messageServer = null // 消息接收服务器
let loginStatusCheckInterval = null // 定时检查登录状态
let wecomCrashDialogInterval = null // Windows：监视企微「错误报告」崩溃窗口
let lastWecomCrashRecoveryAt = 0 // 关闭崩溃窗后触发 it.exe 重启的冷却时间戳

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

/**
 * 启动内置 HTTP（Express）。失败时返回 { success:false }，不抛异常，便于 IPC/设置页提示。
 * @param {number|string} port
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
const startExpressServer = async (port) => {
  const p = parseInt(port, 10)
  if (Number.isNaN(p) || p <= 1024 || p > 10000) {
    const msg = `监听端口无效: ${port}（有效范围 1025～10000）`
    console.error(msg)
    return { success: false, message: msg }
  }

  // 先关闭旧 HTTP 服务并等待端口释放，避免与 killProcessByPort 竞态
  if (expressServer) {
    const oldServer = expressServer
    expressServer = null
    await new Promise((resolve) => {
      try {
        oldServer.close((err) => {
          if (err) console.error('停止旧Express失败:', err)
          else console.log('Express服务器已关闭')
          resolve()
        })
      } catch (e) {
        console.error('停止旧服务器失败:', e)
        resolve()
      }
    })
  }

  // 仅清理「其他进程」占用；当前进程监听时不再 taskkill 自身（见 killProcessByPort）
  await killProcessByPort(p)

  process.env.MESSAGE_SERVER_URL = 'http://127.0.0.1:9999/message'
  const { runServer } = require('./express_server')
  console.log(`启动Express服务器，端口: ${p}`)

  try {
    const server = await runServer(p)
    expressServer = server
    console.log(`Express服务器启动成功，监听端口 ${p}`)
    return { success: true }
  } catch (error) {
    const msg = error.message || String(error)
    console.error('启动Express服务器失败:', msg)
    expressServer = null
    return { success: false, message: msg }
  }
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
        const selfPid = process.pid
        const toKill = [...pids].filter((pid) => pid !== selfPid)
        if (toKill.length === 0) {
          console.log(`端口 ${port} 仅由当前进程监听，跳过 taskkill（避免自杀）`)
          resolve(false)
          return
        }
        let killed = 0
        toKill.forEach((pid) => {
          exec(`taskkill /F /PID ${pid}`, (err) => {
            if (!err) killed++
            if (killed === toKill.length) {
              resolve(killed > 0)
            }
          })
        })
      })
    } else {
      // Linux/Mac：不得 kill 当前进程
      const { exec } = require('child_process')
      exec(`lsof -ti:${port}`, (error, stdout) => {
        if (error || !stdout) {
          resolve(false)
          return
        }
        const pids = stdout.trim().split('\n').filter(Boolean)
        const toKill = pids.filter((p) => parseInt(p, 10) !== process.pid)
        if (toKill.length === 0) {
          if (pids.length > 0) {
            console.log(`端口 ${port} 仅由当前进程监听，跳过 kill（避免自杀）`)
          }
          resolve(false)
          return
        }
        let finished = 0
        toKill.forEach((pid) => {
          exec(`kill -9 ${pid}`, () => {
            finished++
            if (finished === toKill.length) resolve(true)
          })
        })
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
        save_log: 'true',
        auto_check_update: 'true',
        window_close_action: 'ask'
      },
      custom: {
        login_info: '[]'
      }
    }
  }
}

/** 设置页「点击关闭主窗口」：ask 弹窗；tray 进托盘；quit 直接退出（立即读配置，保存后无需重启） */
function getWindowCloseBehavior() {
  const raw = String(readConfig().sys?.window_close_action || 'ask')
    .trim()
    .toLowerCase()
  if (raw === 'quit' || raw === 'exit') return 'quit'
  if (raw === 'tray' || raw === 'minimize_tray') return 'tray'
  return 'ask'
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

/**
 * 从配置中解析出需要定时检查的企微端口列表（来自 login_info）
 */
const getTimedCheckPorts = () => {
  const config = readConfig()
  let raw = config.custom?.login_info
  if (typeof raw !== 'string') return []
  try {
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list
      .map((item) => (item && item.port != null ? parseInt(item.port, 10) : NaN))
      .filter((p) => !Number.isNaN(p) && p > 0)
  } catch (e) {
    return []
  }
}

/**
 * 单次执行：对配置中的每个企微端口检查登录状态，若异常则执行注入工具重启
 */
const timedGetLoginStatus = async () => {
  const config = readConfig()
  const serverPort = parseInt(config.sys?.server_port || DEFAULT_SERVER_PORT) || DEFAULT_SERVER_PORT
  const ports = getTimedCheckPorts()
  if (ports.length === 0) return

  const probeLoginOk = async (robotPort) => {
    const attempts = 4
    const delayMs = 3000
    for (let i = 0; i < attempts; i++) {
      try {
        const url = `http://127.0.0.1:${robotPort}/api`
        const response = await axios.post(url, { type: 1000 }, { timeout: 5000 })
        const data = response.data && response.data.data
        const status = data ? data.status : undefined
        if (status === 1) return true
      } catch {
        /* 切换企业等过程中可能短暂失败 */
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
    return false
  }

  for (const robotPort of ports) {
    const ok = await probeLoginOk(robotPort)
    if (ok) continue

    try {
      const injectToolPath = path.join(getAppPath(), 'bin/it.exe')
      const child = spawn(injectToolPath, [
        'start',
        String(robotPort),
        `--my_port=${serverPort}`,
        `--key=${DEFAULT_INJECT_KEY}`
      ])
      let output = ''
      child.stdout.on('data', (d) => { output += d.toString() })
      child.stderr.on('data', (d) => { output += d.toString() })
      child.on('close', (code) => {
        console.log(`定时检查：端口 ${robotPort} 登录异常，已执行注入工具，退出码: ${code}`)
      })
      child.on('error', (e) => {
        console.error('定时检查：执行注入工具失败:', e.message)
      })
    } catch (e) {
      console.error('定时检查：重启企微客户端失败:', e.message)
    }
  }
}

/**
 * 启动定时检查登录状态（每 30 秒执行一次）
 */
const startTimedLoginStatusCheck = () => {
  if (loginStatusCheckInterval) {
    clearInterval(loginStatusCheckInterval)
    loginStatusCheckInterval = null
  }
  loginStatusCheckInterval = setInterval(() => {
    timedGetLoginStatus().catch((e) => {
      console.error('定时检查登录状态异常:', e.message)
    })
  }, 30000)
  console.log('定时检查登录状态已启动，间隔 30 秒')
}

/**
 * Windows：周期性查找企微「错误报告」窗口并发送关闭，随后尽快走与定时任务相同的注入重启逻辑
 */
const startWecomCrashDialogWatch = () => {
  if (process.platform !== 'win32') return
  if (wecomCrashDialogInterval) {
    clearInterval(wecomCrashDialogInterval)
    wecomCrashDialogInterval = null
  }
  const intervalMs = 8000
  const recoveryCooldownMs = 25000
  wecomCrashDialogInterval = setInterval(() => {
    tryCloseWecomCrashDialogs()
      .then((closed) => {
        if (closed <= 0) return
        console.log(`[企微崩溃] 已关闭 ${closed} 个企业微信错误报告窗口`)
        const now = Date.now()
        if (now - lastWecomCrashRecoveryAt < recoveryCooldownMs) {
          console.log('[企微崩溃] 距上次注入恢复较短，跳过本轮（避免重复启动 it.exe）')
          return
        }
        lastWecomCrashRecoveryAt = now
        console.log('[企微崩溃] 开始对配置中的实例做登录探测，异常端口将执行注入重启')
        timedGetLoginStatus().catch((e) => {
          console.error('[企微崩溃] 注入恢复检查失败:', e.message)
        })
      })
      .catch((e) => {
        console.warn('[企微崩溃] 监视脚本异常:', e.message)
      })
  }, intervalMs)
  console.log(`企微崩溃报告窗口监视已启动，每 ${intervalMs / 1000} 秒检查一次`)
}

/** 与应用窗口相同的图标路径，供托盘等复用 */
function resolveAppIconPath() {
  let iconPath
  if (app.isPackaged) {
    iconPath = path.join(app.getAppPath(), 'dist', 'bg.png')
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(process.resourcesPath, '..', 'dist', 'bg.png')
    }
  } else {
    iconPath = path.join(__dirname, '../public/bg.png')
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, '../src/assets/bg.png')
    }
  }
  return iconPath
}

function destroyTray() {
  if (tray) {
    try {
      tray.destroy()
    } catch (e) {
      console.warn('destroyTray:', e.message)
    }
    tray = null
  }
}

function createTrayIconImage() {
  const iconPath = resolveAppIconPath()
  if (!fs.existsSync(iconPath)) {
    console.warn('托盘图标文件不存在:', iconPath)
    return nativeImage.createEmpty()
  }
  let image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    console.warn('托盘图标无法解码:', iconPath)
    return nativeImage.createEmpty()
  }
  // Windows 通知区像素小，缩放到 16 避免显示为空白方块
  if (process.platform === 'win32') {
    const { width, height } = image.getSize()
    if (width > 16 || height > 16) {
      image = image.resize({ width: 16, height: 16 })
    }
  }
  return image
}

function showMainFromTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (process.platform === 'win32' || process.platform === 'linux') {
    mainWindow.setSkipTaskbar(false)
  }
  mainWindow.show()
  mainWindow.focus()
}

/** 创建或复用托盘实例，失败返回 false */
function ensureTray() {
  if (tray) return true
  try {
    const image = createTrayIconImage()
    if (image.isEmpty()) {
      return false
    }
    tray = new Tray(image)
    tray.setToolTip('北极熊企微框架Pro')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: '显示窗口',
          click: () => {
            showMainFromTray()
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            allowMainWindowClose = true
            app.quit()
          }
        }
      ])
    )
    tray.on('click', () => {
      showMainFromTray()
    })
    return true
  } catch (e) {
    console.error('创建系统托盘失败:', e)
    return false
  }
}

/**
 * 最小化到系统托盘：隐藏窗口并显示托盘图标（不是 minimize，否则只在任务栏）
 */
function minimizeToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!ensureTray()) {
    console.warn('托盘不可用，退化为普通最小化到任务栏')
    mainWindow.minimize()
    return
  }
  if (process.platform === 'win32' || process.platform === 'linux') {
    mainWindow.setSkipTaskbar(true)
  }
  mainWindow.hide()
}

function createWindow() {
  allowMainWindowClose = false
  const iconPath = resolveAppIconPath()

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

  // 本地未打包运行时默认打开开发者工具（含：走 Vite、或本地已有 dist 仅 loadFile 调试）
  if (!app.isPackaged) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.openDevTools({ mode: 'bottom' })
    })
  }

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

  mainWindow.on('close', (e) => {
    if (allowMainWindowClose) {
      return
    }
    e.preventDefault()
    const wc = mainWindow.webContents
    if (wc.isDestroyed()) {
      return
    }
    const closeBehavior = getWindowCloseBehavior()

    // 页面仍在加载时无法展示自定义 UI
    if (wc.isLoading()) {
      if (closeBehavior === 'quit') {
        allowMainWindowClose = true
        mainWindow.close()
        return
      }
      if (closeBehavior === 'tray') {
        minimizeToTray()
        return
      }
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['最小化', '退出程序', '取消'],
        cancelId: 2,
        defaultId: 0,
        title: '关闭窗口',
        message: '请选择最小化窗口还是退出程序？',
        detail:
          '选择「最小化」后程序将最小化到任务栏并继续运行；选择「退出程序」将结束应用。'
      })
      if (choice === 0) {
        minimizeToTray()
      } else if (choice === 1) {
        allowMainWindowClose = true
        mainWindow.close()
      }
      return
    }

    if (closeBehavior === 'quit') {
      allowMainWindowClose = true
      mainWindow.close()
      return
    }
    if (closeBehavior === 'tray') {
      minimizeToTray()
      return
    }

    wc.send('close-confirm-request')
  })

  mainWindow.on('closed', () => {
    destroyTray()
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
          {
            label: 'Quit',
            click: () => {
              allowMainWindowClose = true
              app.quit()
            }
          }
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
  startExpressServer(parseInt(config.sys?.server_port || DEFAULT_SERVER_PORT, 10)).then((r) => {
    if (!r.success) {
      console.error('启动Express失败:', r.message)
    }
  })

  // 启动定时检查登录状态
  startTimedLoginStatusCheck()
  startWecomCrashDialogWatch()

  // 如果是生产环境且开启了自动更新，则启动时检查更新
  if (app.isPackaged) {
    const updateConfig = readConfig()
    const acu = updateConfig.sys?.auto_check_update
    const autoCheckUpdate = !(
      acu === 'false' ||
      acu === false
    )
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

app.on('before-quit', () => {
  destroyTray()
  if (loginStatusCheckInterval) {
    clearInterval(loginStatusCheckInterval)
    loginStatusCheckInterval = null
  }
})

// IPC 通信处理
ipcMain.handle('respond-close-confirm', (event, action) => {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) {
    return { ok: false }
  }
  if (event.sender !== mainWindow.webContents) {
    return { ok: false }
  }
  if (action === 'minimize') {
    minimizeToTray()
  } else if (action === 'quit') {
    allowMainWindowClose = true
    mainWindow.close()
  }
  return { ok: true }
})

ipcMain.handle('read-config', () => {
  const config = readConfig()
  return {
    ...config,
    sys: { ...(config.sys || {}), inject_key: DEFAULT_INJECT_KEY }
  }
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
        // 与 electron/routes 保持一致，用于 API 调用日志展示
        const apiTypeNames = {
          // login
          1000: '获取登录状态',
          1001: '获取登录二维码',
          1002: '获取个人信息',
          1003: '退出登录',
          1004: '获取个人二维码',
          1005: '输入登录验证码',
          // contact
          2000: '获取联系人列表',
          2001: '获取好友列表',
          2002: '获取群列表',
          2003: '获取群成员列表',
          2004: '获取公司列表',
          2005: '获取部门列表',
          // message
          3000: '发送文本消息',
          3001: '发送图片消息',
          3002: '发送GIF表情',
          3003: '发送文件消息',
          3004: '发送视频消息',
          3005: '发送名片',
          3006: '发送小程序',
          3007: '发送视频号',
          3008: '发送卡片链接',
          3009: '发送群@消息',
          3010: '发送位置消息',
          3011: '发送语音消息',
          // friend
          4000: '添加好友',
          4001: '删除好友',
          4002: '同意好友请求',
          4003: '设置好友备注',
          4004: '设置好友描述',
          4005: '设置好友公司',
          4006: '设置好友手机号',
          4007: '本地查询好友信息',
          4008: '网络查询陌生人信息',
          4009: '添加好友【网络查询】',
          // group
          5000: '创建群聊【外部】',
          5001: '创建群聊【内部】',
          5002: '修改群名称',
          5003: '发送群公告',
          5004: '邀请好友进群（40人以下）',
          5005: '邀请好友进群（40人以上）',
          5006: '移除群成员',
          5007: '获取群二维码',
          5008: '获取群信息',
          5009: '获取欢迎语列表',
          5010: '获取欢迎语',
          5011: '设置欢迎语',
          5012: '删除欢迎语',
          5013: '添加管理员',
          5014: '删除管理员',
          5015: '转让群主',
          5016: '退出群聊',
          5017: '解散群聊',
          5018: '允许/禁止修改群名',
          5019: '开启/关闭邀请确认',
          // tag
          6000: '获取标签组列表',
          6001: '添加标签',
          6002: '修改标签',
          6003: '删除标签',
          6004: '一个好友打多个标签',
          6005: '一个标签打多个好友',
          6006: '获取标签下的联系人',
          6007: '删除标签下的联系人',
          // settings
          7000: '开启/关闭自动更新',
          7001: '开启/关闭自动登录',
          7002: '开启/关闭消息免打扰',
          7003: '开启/关闭自动下载',
          // id-convert
          8000: '企业用户ID转开放平台ID',
          8001: '企业群ID转开放平台ID',
          8002: '开放平台ID转企业用户ID',
          8003: '开放平台ID转企业群ID',
          // cdn
          9000: 'CDN上传文件',
          9001: 'CDN下载企微图片',
          9002: 'CDN下载视频',
          9003: 'CDN下载文件',
          9004: 'CDN下载个微文件',
          // other
          10000: '清空聊天记录',
          10003: '语音转文字',
          10004: '获取当前微信进程的PID',
          10005: '获取当前聊天窗口信息'
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
  return checkPortListenAvailable(port)
})

// 查找可用端口（随机生成并检查是否被占用，范围 1025～10000）
ipcMain.handle('find-available-port', async (event, startPort, endPort) => {
  return findAvailablePortForInject(startPort, endPort)
})

// 执行注入工具（需要根据实际情况调整）
ipcMain.handle('run-inject-tool', async (event, { port, serverPort, key }) => {
  const injectKey = key || DEFAULT_INJECT_KEY
  return runInjectToolService({ port, serverPort, key: injectKey })
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
  return startExpressServer(port)
})

// 兼容旧名称
ipcMain.handle('restart-fastapi-server', async (event, port) => {
  return startExpressServer(port)
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
    allowMainWindowClose = true
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

