/**
 * Electron版本的通用工具函数
 * Node.js版本，独立于vwork_qt项目
 */
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const ini = require('ini')
const { ReadConfig, LoginInfo } = require('../utils/schemas')
const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)
const { DEFAULT_SERVER_PORT_STRING } = require('../configs/defaults')

/**
 * 获取配置文件路径
 * 打包后：放到用户可写的 userData 目录中（避免 Program Files 权限问题），并在首次运行时从内置 conf 复制一份
 * 开发环境或非 Electron 环境：仍然使用项目根目录下的 conf/conf.ini
 */
function getConfigPath() {
  // 优先尝试使用 Electron 的 app（仅在 Electron 环境且已初始化时可用）
  try {
    // 延迟 require，避免在纯 Node 环境运行 express_server 时直接报错
    const { app } = require('electron')
    if (app && app.isPackaged) {
      // 用户数据目录，例如：C:\Users\xxx\AppData\Roaming\北极熊企微框架Pro\
      const userDataPath = app.getPath('userData')
      const configDir = path.join(userDataPath, 'conf')

      // 确保目录存在
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      const userConfigPath = path.join(configDir, 'conf.ini')

      // 默认配置文件（打包时通过 extraResources 拷贝到 resources\conf\conf.ini）
      const defaultConfigPath = path.join(process.resourcesPath || '', 'conf', 'conf.ini')

      // 如果用户目录下还没有配置文件，但 resources 里有默认配置，则复制一份过去
      try {
        if (!fs.existsSync(userConfigPath) && fs.existsSync(defaultConfigPath)) {
          fs.copyFileSync(defaultConfigPath, userConfigPath)
        }
      } catch (e) {
        // 复制失败时不影响后续读取逻辑，后面 readIni 会有默认配置兜底
        console.error(`初始化用户配置文件失败: ${e.message}`)
      }

      return userConfigPath
    }
  } catch (e) {
    // 在纯 Node 环境或 Electron 未就绪时，这里可能报错，直接降级为项目根目录逻辑
  }

  // 开发环境或无 Electron 环境：仍使用项目根目录下的 conf/conf.ini
  const electronDir = __dirname.replace(/[\\/]commons$/, '')
  const projectRoot = path.dirname(electronDir)
  const configPath = path.join(projectRoot, 'conf', 'conf.ini')
  return configPath
}

/**
 * 获取应用根目录路径
 */
function getAppRootPath() {
  // 获取electron目录的绝对路径
  const electronDir = __dirname.replace(/[\\/]commons$/, '')
  // 返回项目根目录（electron目录的父目录）
  return path.dirname(electronDir)
}

/**
 * 保存日志到文件
 * @param {object} data - 日志数据对象
 * @returns {Promise<boolean>} 保存成功返回true，失败返回false
 */
async function saveLogToFile(data) {
  try {
    let baseDir
    let fallbackDir = null

    // 打包后的 Electron：优先把日志写到「安装目录/logs」，如果失败再回退到用户数据目录
    try {
      const { app } = require('electron')
      if (app && app.isPackaged) {
        // 安装目录：resources 的上级目录，例如 C:\Program Files\xxx\
        const installRoot = path.join(process.resourcesPath || app.getAppPath(), '..')
        const userDataPath = app.getPath('userData')
        baseDir = installRoot
        fallbackDir = userDataPath
      }
    } catch (e) {
      // 非 Electron 环境或 app 未就绪时忽略，降级到项目根目录
    }

    if (!baseDir) {
      // 开发环境或纯 Node 环境：使用项目根目录
      baseDir = getAppRootPath()
    }

    // 封装一个实际写入日志的函数，方便主/备用目录复用
    const writeToDir = (rootDir) => {
      const logDir = path.join(rootDir, 'logs', 'runLog')
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }

      // 获取当前日期，格式：YYYY-MM-DD（使用本地时间）
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`
      const logFileName = `${dateStr}.log`
      const logFilePath = path.join(logDir, logFileName)
      
      // 格式化时间戳
      const timestamp = data.time_stamp || Math.floor(now.getTime() / 1000)
      const logTime = new Date(timestamp * 1000)
      const timeStr = logTime.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/\//g, '-')
      
      // 格式化日志内容
      let logContent = ''
      if (data.sys) {
        // 系统消息
        logContent = `[${timeStr}] [系统] ${data.content || ''}\n`
      } else {
        // 普通消息
        const sender = data.sender || data.nick_name || ''
        const userId = data.user_id || ''
        const content = data.content || ''
        const msgType = data.is_self_msg === 1 ? '[发出]' : '[收到]'
        logContent = `[${timeStr}] ${msgType} ${sender}(${userId}): ${content}\n`
      }

      fs.appendFileSync(logFilePath, logContent, 'utf-8')
    }

    try {
      // 优先写入主目录（打包后为安装目录，开发环境为项目根目录）
      writeToDir(baseDir)
      return true
    } catch (err) {
      // 如果存在备用目录（打包后为 userData），主目录失败时回退
      if (fallbackDir && fallbackDir !== baseDir) {
        try {
          writeToDir(fallbackDir)
          return true
        } catch (e2) {
          console.error(`保存日志失败(主目录和备用目录都失败): ${e2.message}`)
          return false
        }
      }
      console.error(`保存日志失败: ${err.message}`)
      return false
    }
  } catch (error) {
    console.error(`保存日志失败: ${error.message}`)
    return false
  }
}

/**
 * 异步发送回调
 * @param {string} url - 回调地址
 * @param {object} data - 回调数据
 * @returns {Promise<{success: boolean, message: string, data: any}>} 返回发送结果
 */
async function sendCallback(url, data) {
  const startTime = Date.now()
  try {
    const response = await axios.post(url, data, {
      timeout: 10000
    })
    const duration = Date.now() - startTime
    console.log(`✅ 回调发送成功: ${url} (耗时: ${duration}ms)`)
    return {
      success: true,
      message: '回调发送成功',
      data: response.data,
      duration
    }
  } catch (error) {
    const duration = Date.now() - startTime
    let errorMessage = '回调发送失败'
    if (error.code === 'ECONNREFUSED') {
      errorMessage = `回调发送失败: 无法连接到 ${url} (连接被拒绝)`
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = `回调发送失败: 请求超时 (${url})`
    } else if (error.response) {
      errorMessage = `回调发送失败: HTTP ${error.response.status} - ${error.response.statusText}`
    } else {
      errorMessage = `回调发送失败: ${error.message}`
    }
    console.error(`❌ ${errorMessage} (耗时: ${duration}ms)`)
    return {
      success: false,
      message: errorMessage,
      data: null,
      duration,
      error: error.code || error.message
    }
  }
}

/**
 * 判断授权是否有效
 * @param {string} dateStr - 日期字符串，格式：'YYYY-MM-DD HH:mm:ss'
 * @returns {boolean} True表示有效，False表示无效
 */
function validAuthDatetime(dateStr) {
  try {
    if (!dateStr || dateStr === '未授权') {
      return false
    }
    const dt = new Date(dateStr.replace(/-/g, '/'))
    const now = new Date()
    return now <= dt
  } catch (error) {
    return false
  }
}

/**
 * 检查端口是否被占用
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const net = require('net')
    const server = net.createServer()
    server.listen(port, () => {
      server.once('close', () => resolve(false))
      server.close()
    })
    server.on('error', () => resolve(true))
  })
}

/**
 * 杀死占用指定端口的进程
 */
async function killProcessByPort(port) {
  const inUse = await isPortInUse(port)
  if (!inUse) {
    return false
  }

  // Windows 系统
  if (process.platform === 'win32') {
    try {
      // 查找占用端口的进程 PID
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`)
      const lines = stdout.trim().split('\n')
      if (!lines || lines.length === 0 || lines[0].trim() === '') {
        console.log(`未找到占用端口 ${port} 的进程`)
        return false
      }

      const pids = new Set()
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 5) {
          const pid = parseInt(parts[parts.length - 1])
          if (!isNaN(pid)) {
            pids.add(pid)
          }
        }
      }

      if (pids.size === 0) {
        return false
      }

      // 不得结束当前 Node/Electron 进程，否则重启 Express 时会误杀自身导致连接被拒绝
      const selfPid = process.pid
      const toKill = [...pids].filter((pid) => pid !== selfPid)
      if (toKill.length === 0) {
        console.log(`端口 ${port} 仅由当前进程监听，跳过 taskkill（避免自杀）`)
        return false
      }

      for (const pid of toKill) {
        try {
          await execAsync(`taskkill /F /PID ${pid}`)
          console.log(`成功终止进程 (PID: ${pid})`)
        } catch (error) {
          console.error(`终止进程失败 (PID: ${pid}):`, error.message)
        }
      }
      return true
    } catch (error) {
      if (error.code === 1) {
        // 未找到进程
        return false
      }
      console.error(`终止进程失败: ${error.message}`)
      return false
    }
  } else {
    // Linux/MacOS 系统
    try {
      const { stdout } = await execAsync(`lsof -ti:${port}`)
      const pids = stdout.trim().split('\n').filter(pid => pid)
      const selfPid = String(process.pid)
      const toKill = pids.filter((pid) => pid !== selfPid)
      if (toKill.length === 0) {
        if (pids.length > 0) {
          console.log(`端口 ${port} 仅由当前进程监听，跳过 kill（避免自杀）`)
        } else {
          console.log(`未找到占用端口 ${port} 的进程`)
        }
        return false
      }

      for (const pid of toKill) {
        try {
          await execAsync(`kill -9 ${pid}`)
          console.log(`成功终止进程 (PID: ${pid})`)
        } catch (error) {
          console.error(`终止进程失败 (PID: ${pid}):`, error.message)
        }
      }
      return true
    } catch (error) {
      if (error.code === 1) {
        // 未找到进程
        return false
      }
      console.error(`终止进程失败: ${error.message}`)
      return false
    }
  }
}

/**
 * 读取INI配置文件
 * @param {string|null} configPath - 配置文件路径，如果为null则使用默认路径
 * @returns {ReadConfig} ReadConfig对象
 */
function readIni(configPath = null) {
  if (configPath === null) {
    configPath = getConfigPath()
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    const conf = ini.parse(content)

    let server_port = DEFAULT_SERVER_PORT_STRING
    let callback = ''
    let open_log = true
    let save_log = true

    if (conf.sys) {
      server_port = conf.sys.server_port || server_port
      callback = conf.sys.callback || callback
      open_log = conf.sys.open_log === 'true' || conf.sys.open_log === true
      save_log = conf.sys.save_log === 'true' || conf.sys.save_log === true
    }

    let login_info_list = '[]'
    if (conf.custom && conf.custom.login_info) {
      login_info_list = conf.custom.login_info
    }

    let login_info = []
    try {
      const parsed = JSON.parse(login_info_list)
      if (Array.isArray(parsed)) {
        login_info = parsed.map(item => new LoginInfo(item))
      }
    } catch (e) {
      console.error('解析login_info失败:', e)
    }

    return new ReadConfig({
      server_port,
      callback,
      open_log,
      save_log,
      login_info
    })
  } catch (error) {
    console.error(`读取配置失败: ${error.message}`)
    return new ReadConfig({
      server_port: DEFAULT_SERVER_PORT_STRING,
      callback: '',
      open_log: true,
      save_log: true,
      login_info: []
    })
  }
}

module.exports = {
  getConfigPath,
  getAppRootPath,
  sendCallback,
  validAuthDatetime,
  isPortInUse,
  killProcessByPort,
  readIni,
  saveLogToFile
}

