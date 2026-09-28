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
const { formatMessageContent, getMsgTypeText } = require('./msgParser.cjs')

const LEGACY_LOCAL_CALLBACK_URL = 'http://127.0.0.1:8001/msg'
const DEFAULT_BUSINESS_CALLBACK_URL = 'http://127.0.0.1:8002/msg'

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
      const defaultBackupConfigPath = `${defaultConfigPath}.bak`

      // 如果用户目录下还没有配置文件，但 resources 里有默认配置，则复制一份过去
      try {
        if (!fs.existsSync(userConfigPath)) {
          const sourceConfigPath = fs.existsSync(defaultConfigPath)
            ? defaultConfigPath
            : defaultBackupConfigPath
          if (fs.existsSync(sourceConfigPath)) {
            fs.copyFileSync(sourceConfigPath, userConfigPath)
          }
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
 * 解析运行日志目录（与 saveLogToFile 写入位置一致）
 * @returns {{ dir: string, writableRoot: string }}
 */
function resolveRunLogRoots() {
  let baseDir
  let fallbackDir = null

  try {
    const { app } = require('electron')
    if (app && app.isPackaged) {
      const installRoot = path.join(process.resourcesPath || app.getAppPath(), '..')
      baseDir = installRoot
      fallbackDir = app.getPath('userData')
    }
  } catch {
    /* 非 Electron */
  }

  if (!baseDir) {
    baseDir = getAppRootPath()
  }

  return { baseDir, fallbackDir }
}

function getRunLogDirectory() {
  const { baseDir, fallbackDir } = resolveRunLogRoots()
  const primary = path.join(baseDir, 'logs', 'runLog')
  if (fs.existsSync(primary)) return primary
  if (fallbackDir) {
    const fallback = path.join(fallbackDir, 'logs', 'runLog')
    if (fs.existsSync(fallback)) return fallback
  }
  return primary
}

/**
 * @param {number} [maxLines=400]
 */
function readTodayRunLogTail(maxLines = 400) {
  const logDir = getRunLogDirectory()
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const logFilePath = path.join(logDir, `${dateStr}.log`)
  if (!fs.existsSync(logFilePath)) {
    return { success: true, path: logFilePath, lines: [], content: '' }
  }
  const raw = fs.readFileSync(logFilePath, 'utf-8')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const tail = lines.slice(-maxLines)
  return { success: true, path: logFilePath, lines: tail, content: tail.join('\n') }
}

/** 原子写入配置并保留 .bak 备份 */
function writeConfigAtomic(configPath, content) {
  const backupPath = `${configPath}.bak`
  const tempPath = `${configPath}.${process.pid}.tmp`
  try {
    const dir = path.dirname(configPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, backupPath)
    }
    fs.writeFileSync(tempPath, content, 'utf-8')
    fs.renameSync(tempPath, configPath)
    return { success: true, backupPath }
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    } catch {
      /* ignore */
    }
    return { success: false, msg: error.message }
  }
}

/** 读取配置文本，主文件失败时尝试 .bak */
function readConfigTextWithBackup(configPath) {
  try {
    return fs.readFileSync(configPath, 'utf-8')
  } catch (primaryErr) {
    const backupPath = `${configPath}.bak`
    if (fs.existsSync(backupPath)) {
      console.warn(`主配置读取失败，使用备份: ${primaryErr.message}`)
      const content = fs.readFileSync(backupPath, 'utf-8')
      try {
        writeConfigAtomic(configPath, content)
      } catch {
        /* 恢复失败仍返回备份内容 */
      }
      return content
    }
    throw primaryErr
  }
}

/**
 * 保存日志到文件
 * @param {object} data - 日志数据对象
 * @returns {Promise<boolean>} 保存成功返回true，失败返回false
 */
async function saveLogToFile(data) {
  try {
    const { baseDir, fallbackDir } = resolveRunLogRoots()
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
        // 普通消息（含未知 msg_type）
        const sender = data.sender || data.nick_name || ''
        const userId = data.user_id || ''
        const content = formatMessageContent(data)
        const direction = data.is_self_msg === 1 ? '[发出]' : '[收到]'
        const typeHint = data.msg_type != null && data.msg_type !== ''
          ? `[${getMsgTypeText(data.msg_type)}]`
          : ''
        logContent = `[${timeStr}] ${direction}${typeHint} ${sender}(${userId}): ${content}\n`
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

function parseIniFlag(value) {
  return value === 'true' || value === true
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

const {
  AUTH_REASON,
  checkAuthExpire,
  checkAuthByPort,
  checkAuthByUserId,
  validAuthDatetime,
  isAuthorizedAuthState
} = require('./authCheck.cjs')

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
          if (!isNaN(pid) && pid > 0) {
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
      if (callback === LEGACY_LOCAL_CALLBACK_URL) {
        callback = DEFAULT_BUSINESS_CALLBACK_URL
        conf.sys.callback = callback
        const migration = writeConfigAtomic(configPath, ini.stringify(conf))
        if (!migration.success) {
          console.error(`迁移旧回调地址失败: ${migration.msg}`)
        }
      }
      open_log = parseIniFlag(conf.sys.open_log)
      save_log = parseIniFlag(conf.sys.save_log)
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
  getRunLogDirectory,
  readTodayRunLogTail,
  writeConfigAtomic,
  readConfigTextWithBackup,
  sendCallback,
  AUTH_REASON,
  checkAuthExpire,
  checkAuthByPort,
  checkAuthByUserId,
  validAuthDatetime,
  isAuthorizedAuthState,
  isPortInUse,
  killProcessByPort,
  readIni,
  saveLogToFile
}

