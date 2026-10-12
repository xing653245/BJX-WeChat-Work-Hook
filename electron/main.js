const { createDiagnostics } = require('./commons/diagnostics.cjs')
const diagnostics = createDiagnostics('main.js')
const { app, BrowserWindow, ipcMain, shell, Menu, dialog, Tray, nativeImage, nativeTheme } = require('electron')
require('./commons/diagnostics.cjs').setConsoleDiagnosticsEnabled(!app.isPackaged)
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')
const net = require('net')
const { autoUpdater } = require('electron-updater')
const {
  checkForUpdatesWithFallback,
  formatUpdateError,
  getActiveFeed,
  initUpdateFeeds,
  shouldSuppressErrorEvent
} = require('./services/updateService')
const ini = require('ini')
const axios = require('axios')
const { saveLogToFile, getConfigPath, readIni, getBusinessCallbackUrl, validAuthDatetime, isAuthorizedAuthState, killProcessByPort, writeConfigAtomic, readConfigTextWithBackup, getRunLogDirectory, readTodayRunLogTail } = require('./commons/common')
const { assertMainWindow, isAllowedExternalUrl } = require('./commons/ipcSecurity')
const { ensureMessageServerToken, isValidMessageServerRequest, messageServerAxiosConfig } = require('./commons/messageBridge')
const { initDesktopNotifications, showDesktopNotification } = require('./services/desktopNotifications')
const { initCrashDiagnostics, attachWebContentsDiagnostics } = require('./services/crashDiagnostics')
const { DEFAULT_SERVER_PORT, DEFAULT_SERVER_PORT_STRING } = require('./configs/defaults')
const {
  collectHookCompatListenPorts,
  applyListenPortChangeToConfig
} = require('./commons/hookCompatPorts')
const {
  checkPortListenAvailable,
  findAvailablePort: findAvailablePortForInject,
  runInjectTool: runInjectToolService
} = require('./services/wecomInject')
const { getInjectBinDir } = require('./commons/resourcePaths')
const { discoverWecom } = require('./services/wecomDiscovery')
const { postToVWorkApi } = require('./services/wecomApiClient')
const { callFrameworkWecomApi } = require('./services/frameworkWecomApi')
const { FRAMEWORK_API_NAMES } = require('./configs/frameworkWecomApi')
const {
  canInjectPort,
  markPortStabilizing,
  markPortLoggedIn,
  markPortAccountSwitch,
  recordInjectAttempt
} = require('./services/wecomStability')

/** 开发模式：未打包运行（npm run electron:dev） */
const isDev = !app.isPackaged
const devServerUrl = process.env.VWORK_DEV_SERVER_URL || 'http://localhost:5173'

let mainWindow
/** 系统托盘（「最小化到托盘」时创建，任务栏隐藏图标区显示的是 Tray，不是 minimize） */
let tray = null
/** 为 true 时允许主窗口真正关闭（避免关闭确认与再次拦截） */
let allowMainWindowClose = false
let messageServer = null // 消息接收服务器
const instanceCallbacks = require('./services/instanceCallbacks').createInstanceCallbacks({
  getSettingsFile: () => path.join(getInjectBinDir(), 'callbackSetting.json'),
  onMessage: (port, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('fastapi-message', { ...data, port })
  }
})
let loginStatusCheckInterval = null // 定时检查登录状态
/** 同一端口注入互斥：避免手动添加并发执行 it.exe */
const injectInProgressPorts = new Set()
const TIMED_CHECK_INTERVAL_MS = 30000 // 定时登录探测间隔 30 秒
/** 单实例：避免多开导致端口冲突 */
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  console.error('[启动] 框架已有实例运行，已请求显示现有窗口。如需启动开发版，请先从系统托盘退出已有框架。')
  app.exit(23)
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return null
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
  return mainWindow
}

function notifyPortError({ port, service, detail }) {
  const title = `${service} 端口 ${port} 不可用`
  const message =
    detail ||
    `端口 ${port} 已被占用或无法绑定。\n\n请检查：\n1. 是否重复打开了本应用（应只保留一个实例）\n2. 是否有其他程序占用该端口\n3. 可在设置中更换 HTTP 监听端口后重启框架`

  diagnostics.error('L001', `[端口错误] ${title}: ${message}`)
  const userDetail = require('./commons/diagnostics.cjs').userMessage(message, '服务暂时无法启动，请关闭重复打开的应用后重试；如仍然失败，请联系技术支持')

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('service-error', { port, service, message: '服务启动失败', detail: userDetail })
  }

  showDesktopNotification({
    title: '服务启动失败',
    body: `${title}。点击查看详情。`,
    onClick: () => {
      focusMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('service-error', { port, service, message: '服务启动失败', detail: userDetail })
      }
    }
  })

  dialog
    .showMessageBox(mainWindow || undefined, {
      type: 'error',
      title: '服务启动失败',
      message: title,
      detail: userDetail,
      buttons: ['知道了']
    })
    .catch(() => {})
}

// 更新配置：优先 Gitee，失败后回退 GitHub（见 electron/configs/updateFeeds.js）
// 发布命令: npm run electron:build:publish
autoUpdater.autoDownload = false // 默认不自动下载，需要用户确认
autoUpdater.autoInstallOnAppQuit = true // 应用退出时自动安装更新
initUpdateFeeds()

// 更新事件处理
autoUpdater.on('checking-for-update', () => {
  diagnostics.info('L004', '正在检查更新...')
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status: 'checking', message: '正在检查更新...' })
  }
})

function normalizeReleaseNotes(releaseNotes) {
  if (!releaseNotes) return '暂无更新说明'
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((item) => {
        if (!item) return ''
        if (typeof item === 'string') return item
        const ver = item.version ? `## ${item.version}\n` : ''
        return `${ver}${item.note || item.body || ''}`.trim()
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return String(releaseNotes)
}

autoUpdater.on('update-available', (info) => {
  diagnostics.info('L005', '发现新版本:', info.version)
  showDesktopNotification({
    title: '发现新版本',
    body: `版本 ${info.version} 可用，打开「设置 → 更新」可下载安装。`
  })
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'available',
      message: `发现新版本: ${info.version}，是否立即下载？`,
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes)
    })
  }
})

autoUpdater.on('update-not-available', (info) => {
  diagnostics.info('L006', '当前已是最新版本:', info.version)
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'not-available',
      message: `当前已是最新版本 (${info.version})，无需更新`,
      version: info.version
    })
  }
})

autoUpdater.on('error', (err) => {
  if (shouldSuppressErrorEvent()) {
    diagnostics.warn('L007', '[update] 当前更新源失败，尝试备用源:', err?.message || err)
    return
  }
  diagnostics.error('L008', '更新检查失败:', err)
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'error',
      message: formatUpdateError(err, { action: '检查', feed: getActiveFeed() })
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
  diagnostics.info('L009', '更新下载完成:', info.version)
  showDesktopNotification({
    title: '更新已就绪',
    body: `版本 ${info.version} 已下载完成，打开设置可立即重启安装。`
  })
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'downloaded',
      message: `更新下载完成 (版本: ${info.version})，将在应用重启后自动安装`,
      version: info.version
    })
  }
})



// 启动消息接收服务器（用于接收FastAPI推送的消息）
const startMessageServer = () => {
  const http = require('http')
  const messagePort = 9999

  ensureMessageServerToken()

  if (messageServer) {
    messageServer.close()
  }

  messageServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/message') {
      if (!isValidMessageServerRequest(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Forbidden' }))
        return
      }
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
          diagnostics.error('L010', '解析消息失败:', e)
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
    diagnostics.info('L011', `消息接收服务器启动在端口 ${messagePort}`)
    process.env.MESSAGE_SERVER_URL = `http://127.0.0.1:${messagePort}/message`
  })

  messageServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      notifyPortError({
        port: messagePort,
        service: '消息推送服务',
        detail: `端口 ${messagePort} 已被占用，运行日志/消息推送可能无法正常工作。\n\n若已打开另一个本框架实例，请关闭多余窗口；否则请结束占用该端口的进程后重启应用。`
      })
    } else {
      diagnostics.error('L012', '消息服务器错误:', error)
      notifyPortError({
        port: messagePort,
        service: '消息推送服务',
        detail: error.message || String(error)
      })
    }
  })
}

// Express 服务器管理（Node.js版本，替代Python FastAPI）
let expressServers = []

function closeHttpServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve()
      return
    }
    try {
      server.close((err) => {
        if (err) diagnostics.error('L013', '停止Express失败:', err)
        resolve()
      })
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections()
      }
    } catch (e) {
      diagnostics.error('L014', '停止Express失败:', e)
      resolve()
    }
  })
}

async function closeAllExpressServers() {
  const oldServers = expressServers
  expressServers = []
  if (oldServers.length === 0) return
  await Promise.all(oldServers.map((server) => closeHttpServer(server)))
  diagnostics.info('L015', 'Express服务器已关闭')
}

/**
 * 启动内置 HTTP（Express）。失败时返回 { success:false }，不抛异常，便于 IPC/设置页提示。
 * 主端口为设置里的监听端口；额外端口用于已注入企微仍向旧 --my_port 推送 /msg。
 * @param {number|string} port
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
const startExpressServer = async (port) => {
  const p = parseInt(port, 10)
  if (Number.isNaN(p) || p <= 1024 || p > 10000) {
    const msg = `监听端口无效: ${port}（有效范围 1025～10000）`
    diagnostics.error('L016', msg)
    return { success: false, message: msg }
  }

  const reservedPorts = new Set([9999])
  if (reservedPorts.has(p)) {
    const msg = `监听端口 ${p} 已由框架内部服务保留，请使用其他端口（推荐 ${DEFAULT_SERVER_PORT}）`
    diagnostics.error('L017', msg)
    return { success: false, message: msg }
  }

  await closeAllExpressServers()

  // 仅清理「其他进程」占用；当前进程监听时不再 taskkill 自身（见 killProcessByPort）
  await killProcessByPort(p)

  process.env.MESSAGE_SERVER_URL = 'http://127.0.0.1:9999/message'
  ensureMessageServerToken()
  const { runServer, listenAppOnPort } = require('./express_server')
  diagnostics.info('L018', `启动Express服务器，端口: ${p}`)

  try {
    const server = await runServer(p)
    expressServers.push(server)
    diagnostics.important('L019', `[Express服务] 启动成功，端口 ${p}`)
  } catch (error) {
    const msg = error.message || String(error)
    diagnostics.error('L020', '启动Express服务器失败:', msg)
    expressServers = []
    if (/EADDRINUSE|已被占用|address already in use/i.test(msg)) {
      notifyPortError({
        port: p,
        service: 'HTTP 框架服务',
        detail: `无法在端口 ${p} 启动 HTTP 服务：${msg}\n\n请在「设置」中更换监听端口，或结束占用该端口的进程后重启应用。`
      })
    }
    return { success: false, message: msg }
  }

  const compatPorts = collectHookCompatListenPorts(readConfig(), p)
  for (const extraPort of compatPorts) {
    try {
      const extraServer = await listenAppOnPort(extraPort)
      expressServers.push(extraServer)
      diagnostics.info('L021', `Hook 兼容监听已启动: ${extraPort}（已注入企微仍向旧 --my_port 回包）`)
    } catch (error) {
      diagnostics.warn('L022',
        `Hook 兼容端口 ${extraPort} 无法监听: ${error.message}。已登录企微若仍指向该端口，接口可能超时。`
      )
    }
  }

  return { success: true }
}

// 根据端口查找PID
const findPidByPort = (port) => {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const { exec } = require('child_process')
      const { parseNetstatListeningPids, parseNetstatLocalPids } = require('./commons/portProcess.cjs')
      exec('netstat -ano -p tcp', (error, stdout) => {
        if (error || !stdout) {
          resolve(-1)
          return
        }
        const listening = parseNetstatListeningPids(stdout, port)
        if (listening[0]) {
          resolve(listening[0])
          return
        }
        const local = parseNetstatLocalPids(stdout, port)
        resolve(local[0] || -1)
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

// 读取配置文件
const readConfig = () => {
  const configPath = getConfigPath()
  try {
    const content = readConfigTextWithBackup(configPath)
    return ini.parse(content)
  } catch (error) {
    diagnostics.error('L023', '读取配置失败:', error)
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
  const configPath = getConfigPath()
  try {
    const content = ini.stringify(config)
    const result = writeConfigAtomic(configPath, content)
    if (!result.success) {
      return { success: false, msg: result.msg || '保存配置失败' }
    }
    return { success: true, backupPath: result.backupPath }
  } catch (error) {
    diagnostics.error('L024', '保存配置失败:', error)
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

/** 重试探测是否已登录（status === 1） */
const probeLoggedIn = async (robotPort) => {
  const attempts = 3
  const delayMs = 3000
  for (let i = 0; i < attempts; i++) {
    try {
      const data = await postToVWorkApi(robotPort, { type: 1000 }, { timeout: 5000 })
      const status = data && data.data ? data.data.status : undefined
      if (status === 1) return true
    } catch {
      /* 切换企业/账号等过程中可能短暂失败 */
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  return false
}

/**
 * 对单端口执行注入（含互斥锁与单端口冷却）
 * @returns {Promise<boolean>} 是否已发起注入
 */
const runInjectForPort = async (robotPort, reason) => {
  if (injectInProgressPorts.has(robotPort)) {
    diagnostics.info('L026', `[注入] 端口 ${robotPort} 注入进行中，跳过（${reason}）`)
    return { success: false, output: '该端口注入进行中', blocked: true }
  }

  // 必须在首次 await 前占用端口锁，避免两个调用同时通过前置检查。
  injectInProgressPorts.add(robotPort)
  try {
    const running = await discoverWecom()
    if (running.unmanagedPids.length) {
      return { success: false, blocked: true, output: '检测到已运行但尚未接入框架的企微，请从企微托盘菜单完全退出后，再在框架中添加；框架不会自动结束您的企微。' }
    }
    const safety = await canInjectPort(robotPort)
    if (!safety.allowed) {
      return { success: false, output: safety.reason, blocked: true }
    }
    const callbackUrl = await instanceCallbacks.prepare(robotPort, readInjectSettings(getInjectBinDir()))
    const result = await runInjectToolService({ port: robotPort, callbackUrl })
    if (!result.success) await instanceCallbacks.remove(robotPort)
    const ok = result.success === true
    recordInjectAttempt(robotPort, ok)
    const summary = require('./commons/injectConsole.cjs').formatInjectSummary({
      port: robotPort, reason, success: ok, callbackUrl
    })
    if (ok) diagnostics.important('L027', summary)
    else diagnostics.error('L027', summary, '\n' + (result.output || '注入工具未提供错误详情'))
    if (ok) {
      markPortStabilizing(robotPort)
    }
    return { success: ok, output: result.output || '' }
  } catch (e) {
    recordInjectAttempt(robotPort, false)
    diagnostics.error('L028', `[注入] 端口 ${robotPort} 执行失败（${reason}）:`, e.message)
    return { success: false, output: e.message }
  } finally {
    injectInProgressPorts.delete(robotPort)
  }
}

/** 定时探测只记录状态，不结束进程或自动注入。 */
const { singleFlight } = require('./commons/singleFlight.cjs')
const timedGetLoginStatus = async () => {
  for (const robotPort of getTimedCheckPorts()) {
    if (!(await probeLoggedIn(robotPort))) {
      diagnostics.info('L030', `[登录探测] 端口 ${robotPort} 暂未确认登录，请在企微管理中检查`)
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
  loginStatusCheckInterval = setInterval(singleFlight(async () => {
    await timedGetLoginStatus().catch((e) => {
      diagnostics.error('L031', '定时检查登录状态异常:', e.message)
    })
  }), TIMED_CHECK_INTERVAL_MS)
  diagnostics.info('L032', `定时检查登录状态已启动，间隔 ${TIMED_CHECK_INTERVAL_MS / 1000} 秒`)
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
  }
  return iconPath
}

function destroyTray() {
  if (tray) {
    try {
      tray.destroy()
    } catch (e) {
      diagnostics.warn('L040', '释放托盘图标失败：', e.message)
    }
    tray = null
  }
}

function createTrayIconImage() {
  const iconPath = resolveAppIconPath()
  if (!fs.existsSync(iconPath)) {
    diagnostics.warn('L041', '托盘图标文件不存在:', iconPath)
    return nativeImage.createEmpty()
  }
  let image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    diagnostics.warn('L042', '托盘图标无法解码:', iconPath)
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
    diagnostics.error('L043', '创建系统托盘失败:', e)
    return false
  }
}

/**
 * 最小化到系统托盘：隐藏窗口并显示托盘图标（不是 minimize，否则只在任务栏）
 */
function minimizeToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!ensureTray()) {
    diagnostics.warn('L044', '托盘不可用，退化为普通最小化到任务栏')
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

  // 开发环境不默认打开控制台；需要时用菜单「切换开发者工具」或 Ctrl+Shift+I

  // 未打包：优先 Vite 开发服；已打包：加载 dist 构建产物
  let distPath
  if (app.isPackaged) {
    distPath = path.join(app.getAppPath(), 'dist', 'index.html')
  } else {
    distPath = path.join(__dirname, '../dist/index.html')
  }

  const loadPackagedFrontend = () => {
    diagnostics.info('L045', '正在加载应用界面：', distPath)
    if (fs.existsSync(distPath)) {
      mainWindow.loadFile(distPath)
    } else {
      diagnostics.error('L046', '应用界面文件缺失，请重新安装；开发环境请先执行 npm run build')
      mainWindow.loadURL(devServerUrl)
    }
  }

  if (!app.isPackaged) {
    // 未打包开发：始终优先 Vite，避免 dist 存在时误加载旧前端（导致新功能不生效）
    let retryCount = 0
    const maxRetries = 30

    const checkServer = () => {
      const http = require('http')
      diagnostics.info('L047', `正在等待开发服务就绪（第 ${retryCount + 1}/${maxRetries})`)

      const req = http.get(devServerUrl, (res) => {
        if (res.statusCode === 200) {
          diagnostics.info('L048', `正在连接本地开发界面 ${devServerUrl}`)
          mainWindow.loadURL(devServerUrl)
        } else {
          retryCount++
          if (retryCount < maxRetries) {
            setTimeout(checkServer, 1000)
          } else {
            loadPackagedFrontend()
          }
        }
      })

      req.on('error', () => {
        retryCount++
        if (retryCount < maxRetries) {
          setTimeout(checkServer, 1000)
        } else {
          loadPackagedFrontend()
        }
      })

      req.setTimeout(5000, () => {
        req.destroy()
        retryCount++
        if (retryCount < maxRetries) {
          setTimeout(checkServer, 1000)
        } else {
          loadPackagedFrontend()
        }
      })
    }

    checkServer()
  } else {
    loadPackagedFrontend()
  }

  // 监听页面加载错误
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    diagnostics.error('L049', '界面加载失败，请重启应用；地址：', validatedURL, 'Error:', errorCode, errorDescription)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    diagnostics.info('L050', '应用界面加载完成')
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url)
    } else {
      diagnostics.warn('L051', '[security] 阻止打开外部窗口:', url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isDev && new URL(url).origin === new URL(devServerUrl).origin) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url)
    }
  })

  attachWebContentsDiagnostics(mainWindow.webContents)

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
    if (expressServers.length > 0) {
      closeAllExpressServers().catch((e) => {
        diagnostics.error('L052', '关闭Express失败:', e)
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

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return
  const { setDiagnosticSink } = require('./commons/diagnostics.cjs')
  const { loadReportPublicKey, sealReport } = require('./commons/reportEncryption.cjs')
  const reportKey = loadReportPublicKey()
  const writer = require('./services/diagnosticFile').createDiagnosticWriter(path.join(app.getPath('userData'), 'diagnostics'), { publicKey: reportKey })
  setDiagnosticSink(writer.write)
  try {
    await require('./services/legacyDiagnostics').migrateLegacyDiagnostics(app.getPath('userData'), reportKey)
  } catch (error) {
    diagnostics.error('D003', '旧版诊断日志迁移未完成，需开发人员检查旧文件', error)
  }
  let exportingReport = false
  ipcMain.handle('export-diagnostic-report', async (event) => {
    assertMainWindow(event, mainWindow)
    if (exportingReport) return { success: false, message: '正在导出，请稍候' }
    exportingReport = true
    try {
      const choice = await dialog.showSaveDialog(mainWindow, {
        title: '导出故障报告', defaultPath: `故障报告-${new Date().toISOString().replace(/[:.]/g, '-')}.vdiag`,
        filters: [{ name: '加密故障报告', extensions: ['vdiag'] }]
      })
      if (choice.canceled || !choice.filePath) return { canceled: true }
      const payload = { kind: 'report', version: 1, createdAt: new Date().toISOString(), appVersion: app.getVersion(), platform: process.platform, arch: process.arch, logs: await writer.snapshot() }
      const encrypted = sealReport(payload, reportKey)
      // 临时文件中也只有密文；成功后原子替换用户选择的导出文件。
      require('./commons/atomicFile').writeTextAtomic(choice.filePath, JSON.stringify(encrypted))
      return { success: true }
    } catch (error) {
      diagnostics.error('D002', '故障报告导出失败', error)
      return { success: false, message: '导出失败，请选择可写入的文件夹后重试' }
    } finally { exportingReport = false }
  })
  ipcMain.on('write-diagnostic', (event, record) => {
    try {
      assertMainWindow(event, mainWindow)
      if (record && ['warn', 'error'].includes(record.level)) writer.write(record)
    } catch { /* 非主窗口的诊断消息不接收 */ }
  })
  if (!gotSingleInstanceLock) return

  initCrashDiagnostics({ getMainWindow: () => mainWindow, writer })
  initDesktopNotifications({
    icon: resolveAppIconPath(),
    focusMainWindow
  })

  app.on('second-instance', () => {
    focusMainWindow()
  })

  try {
    const result = await require('./services/wecomInstallations').autoSaveWecomInstallation(getInjectBinDir())
    diagnostics.info('C008', '启动时自动检测企微安装路径', result)
    if (result.status === 'multiple') diagnostics.warn('C009', '找到多个兼容企微安装位置，请在设置中选择客户端路径')
    if (result.status === 'not-found') diagnostics.warn('C010', '未找到兼容企微安装位置，已保留原客户端路径')
  } catch (error) {
    diagnostics.warn('C011', '启动时自动配置企微路径失败，保留原配置并继续启动', error)
  }

  createWindow()

  startMessageServer()

  const config = readConfig()
  const frameworkPort = parseInt(config.sys?.server_port || DEFAULT_SERVER_PORT, 10)
  const expressResult = await startExpressServer(frameworkPort)
  if (!expressResult.success) {
    diagnostics.error('L053', '启动Express失败:', expressResult.message)
    if (!/EADDRINUSE|已被占用|address already in use/i.test(expressResult.message || '')) {
      notifyPortError({
        port: frameworkPort,
        service: 'HTTP 框架服务',
        detail: expressResult.message || 'Express 服务启动失败'
      })
    }
  }

  startTimedLoginStatusCheck()

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
        checkForUpdatesWithFallback().catch((err) => {
          diagnostics.error('L054', '自动检查更新失败:', err)
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-status', {
              status: 'error',
              message: formatUpdateError(err)
            })
          }
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
  void instanceCallbacks.close()
  destroyTray()
  if (loginStatusCheckInterval) {
    clearInterval(loginStatusCheckInterval)
    loginStatusCheckInterval = null
  }
})

// IPC 通信处理
// 将页面外观同步到原生窗口标题栏；system 保留系统自动切换能力。
ipcMain.handle('set-native-theme', (event, mode) => {
  assertMainWindow(event, mainWindow)
  if (!['light', 'dark', 'system'].includes(mode)) {
    throw new Error('无效的外观模式')
  }
  nativeTheme.themeSource = mode
  return { success: true }
})

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

const { readInjectSettings, saveInjectSettings } = require('./services/injectSettings')
const injectSettingsDir = getInjectBinDir

ipcMain.handle('find-wecom-installations', async event => {
  assertMainWindow(event, mainWindow)
  try {
    let host = ''
    try { host = readInjectSettings(injectSettingsDir()).host || '' } catch { /* 仍可查找安装位置 */ }
    const candidates = await require('./services/wecomInstallations').findWecomInstallations(injectSettingsDir(), host)
    return { success: true, candidates }
  } catch (error) {
    diagnostics.warn('C007', '自动查找企微安装位置失败', error)
    return { success: false, msg: '自动查找失败，请重试或手动填写企微客户端路径' }
  }
})

ipcMain.handle('discover-running-wecom', async event => {
  assertMainWindow(event, mainWindow)
  try { return { success: true, ...await discoverWecom() } }
  catch (error) {
    diagnostics.warn('C006', '检测已运行企微失败', error)
    return { success: false, message: '无法检测正在运行的企微，请稍后点击重新检测；请勿重复启动同一账号。' }
  }
})

async function listCallbackInstances() {
  const rows = new Map(instanceCallbacks.ports().map(port => [port, { port }]))
  for (const row of readIni().login_info || []) rows.set(Number(row.port), row)
  const result = []
  for (const [port, row] of rows) {
    if (!Number.isInteger(port) || port <= 1024 || port > 10000) continue
    const pid = await findPidByPort(port)
    if (pid <= 0 || (row.pid && Number(row.pid) !== pid)) continue
    const userId = row.user_id == null || row.user_id === '-' ? '' : String(row.user_id).trim()
    if (userId) await instanceCallbacks.applySaved(port, userId)
    let restored
    try { restored = instanceCallbacks.get(port, userId) }
    catch (error) { diagnostics.error('C005', '读取账号回调配置失败', error); restored = { storageWarning: '读取 callbackSetting.json 失败，请检查文件格式或读取权限' } }
    result.push({ port, pid, user_id: userId, nick_name: row.nick_name || '', ...restored })
  }
  return result
}
ipcMain.handle('list-callback-instances', async event => {
  assertMainWindow(event, mainWindow)
  return listCallbackInstances()
})
ipcMain.handle('update-instance-callback', async (event, { port, settings, pid, user_id }) => {
  assertMainWindow(event, mainWindow)
  try {
    const rows = await listCallbackInstances()
    const row = rows.find(row => row.port === Number(port) && row.pid === Number(pid) && row.user_id && row.user_id === user_id)
    if (!row) throw new Error('无法确认当前企微账号，请登录企微并刷新实例列表后重试')
    const updated = await instanceCallbacks.update(port, settings, row.user_id)
    return { success: true, settings: updated, warning: instanceCallbacks.get(port)?.storageWarning || '' }
  } catch (error) {
    diagnostics.error('C001', '更新企微实例回调配置失败', error)
    return { success: false, msg: error.response?.data?.msg || error.message }
  }
})
ipcMain.handle('save-inject-host', (event, host) => {
  assertMainWindow(event, mainWindow)
  try { saveInjectSettings(injectSettingsDir(), { host }); return { success: true } }
  catch (error) { return { success: false, msg: error.message } }
})

ipcMain.handle('read-inject-settings', (event) => {
  assertMainWindow(event, mainWindow)
  try { return { success: true, data: readInjectSettings(injectSettingsDir()) } }
  catch (error) { return { success: false, msg: error.message } }
})

ipcMain.handle('read-config', () => {
  const config = readConfig()
  const sys = { ...(config.sys || {}) }
  return {
    ...config,
    sys: {
      ...sys,
      callback: getBusinessCallbackUrl()
    }
  }
})

ipcMain.handle('save-config', async (event, config) => {
  assertMainWindow(event, mainWindow)
  const prev = readConfig()
  const mergedSys = { ...(prev.sys || {}), ...((config && config.sys) || {}) }
  // 注入相关字段只属于 bin/settings.json，不再写回 INI。
  for (const key of ['callback', 'callback_encrypt', 'callback_encrypt_key', 'callback_encrypt_private_key',
    'inject_key', 'wecom_version', 'wecom_version_selected', 'wecom_exe_path', 'wecom_exe_path_v5']) delete mergedSys[key]
  const merged = {
    sys: mergedSys,
    custom: { ...(prev.custom || {}), ...((config && config.custom) || {}) }
  }
  let rollback
  try {
    if (config.injectTool) {
      rollback = saveInjectSettings(injectSettingsDir(), config.injectTool)
    }
    const result = saveConfig(applyListenPortChangeToConfig(prev, merged))
    if (!result.success && rollback) rollback()
    if (!result.success) return result
    return result
  } catch (error) {
    if (rollback) rollback()
    return { success: false, msg: error.message }
  }
})

// 只供框架界面调用固定操作，不接收 URL，也不经框架 HTTP 端口转发。
ipcMain.handle('call-framework-wecom', async (event, input) => {
  assertMainWindow(event, mainWindow)
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('企微调用参数无效')
    const { port, ...request } = input
    const logPort = Number(port)
    if (!/^\d+$/.test(String(port)) || !Number.isInteger(logPort) || logPort <= 1024 || logPort > 65535) {
      throw new Error('请选择有效的企微实例 HTTP 端口')
    }
    const apiConfig = readConfig()
    const frameworkPort = Number(apiConfig.sys?.server_port || DEFAULT_SERVER_PORT)
    const frameworkPorts = new Set([frameworkPort, ...collectHookCompatListenPorts(apiConfig, frameworkPort)])
    if (frameworkPorts.has(logPort)) throw new Error('请选择企微实例端口，不能使用框架监听端口')
    const responseData = await callFrameworkWecomApi(logPort, request)

    // 如果成功获取响应，仅记录本地日志；业务回调由企微原生推送
    if (logPort && responseData) {
      try {
        // 读取配置
        const ini_config = readIni()
        
        // 根据端口查找对应的登录信息
        let target_item = null
        let user_id = ''
        for (const item of ini_config.login_info) {
          if (String(item.port) === String(logPort)) {
            target_item = item
            user_id = item.user_id || ''
            break
          }
        }
        
        const apiType = request.type
        const apiName = FRAMEWORK_API_NAMES[apiType]

        // 检查授权是否有效
        const expire = target_item ? target_item.expire : ''
        const valid_auth = validAuthDatetime(expire, target_item?.auth_active)
        
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
        const responseDataForLog = responseData
        const isSuccess = responseDataForLog && (
          responseDataForLog.code === 0 || 
          responseDataForLog.code === undefined || 
          (responseDataForLog.status !== undefined && responseDataForLog.status === 1) ||
          (!responseDataForLog.msg && !responseDataForLog.error && !responseDataForLog.message)
        )
        
        // 构建日志内容：成功时只显示成功信息，失败时显示失败原因
        let logContent = ''
        if (isSuccess) {
          logContent = '调用成功'
        } else {
          // 提取失败原因
          const errorMsg = responseDataForLog.msg || responseDataForLog.error || responseDataForLog.message || responseDataForLog.err_msg || '未知错误'
          logContent = `调用失败: ${errorMsg}`
        }
        
        // 构建用于前端显示的日志数据
        const displayLogData = {
          type: 'api_call',
          api_name: apiName,
          port: logPort,
          user_id: user_id,
          self_user_id: apiName, // 用于在运行日志页面显示为"发言者"
          content: logContent,
          time_stamp: Math.floor(Date.now() / 1000),
          sys: false
        }
        
        // 如果应该记录日志，推送消息到Electron主进程
        if (shouldLog) {
          try {
            const MESSAGE_SERVER_URL = process.env.MESSAGE_SERVER_URL || 'http://127.0.0.1:9999/message'
            await axios.post(MESSAGE_SERVER_URL, displayLogData, messageServerAxiosConfig({ timeout: 1000 }))
          } catch (error) {
            diagnostics.error('L055', `推送API调用日志到Electron失败: ${error.message}`)
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
              diagnostics.error('L056', `保存API调用日志到文件失败: ${err.message}`)
            })
          }
        }
        
      } catch (logError) {
        // 日志记录失败不影响API调用结果
        diagnostics.error('L059', `记录API调用日志失败: ${logError.message}`)
      }
    }
    
    return { success: true, data: responseData }
  } catch (error) {
    return { success: false, msg: error.message, code: error.code, reason: error.reason, data: null }
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

// 注入分配独立回调接收端口；宿主路径由 bin/settings.json 提供。
ipcMain.handle('run-inject-tool', async (event, { port }) => {
  assertMainWindow(event, mainWindow)
  return runInjectForPort(Number(port), '手动')
})

ipcMain.handle('mark-wecom-port-stabilizing', (_event, port) => {
  markPortStabilizing(port)
  return { success: true }
})

ipcMain.handle('mark-wecom-port-logged-in', async (event, port) => {
  assertMainWindow(event, mainWindow)
  markPortLoggedIn(port)
  const row = (readIni().login_info || []).find(item => Number(item.port) === Number(port))
  if (row?.user_id && row.user_id !== '-') {
    const result = await instanceCallbacks.applySaved(port, String(row.user_id))
    return { success: true, ...result }
  }
  return { success: true }
})

ipcMain.handle('mark-wecom-port-account-switch', (_event, port) => {
  markPortAccountSwitch(port)
  return { success: true }
})

// 获取授权信息
const { formatAuthFetchError } = require('./commons/authFetchError')
const { getAuthInfo, bindCard, unbindCard, convertCardByWxid } = require('./commons/polarBearClient.cjs')

ipcMain.handle('get-auth-info', async (event, wxid, port) => {
  try {
    const data = await getAuthInfo(wxid, port)
    const result = { success: true, data }
    
    // 读取配置，检查是否开启日志
    const config = readConfig()
    const openLog = config.sys?.open_log === 'true' || config.sys?.open_log === true
    const saveLog = config.sys?.save_log === 'true' || config.sys?.save_log === true
    
    // 如果开启了日志，写入运行日志
    if (openLog && saveLog) {
      let expire = '未授权'
      if (result.data && result.data.data) {
        const authData = result.data.data
        const auth_active = authData.active === true
        const rawExpire = authData.expire || '未授权'
        expire = isAuthorizedAuthState(rawExpire, auth_active) ? rawExpire : '未授权'
      }
      
      const logData = {
        content: `刷新授权: ${wxid}, 到期时间: ${expire}`,
        sys: true,
        time_stamp: Math.floor(Date.now() / 1000)
      }
      
      // 异步写入日志，不阻塞返回值
      saveLogToFile(logData).catch(err => {
        diagnostics.error('L060', `保存授权刷新日志失败: ${err.message}`)
      })
      
      // 同时推送到前端显示（如果开启了日志推送）
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('fastapi-message', logData)
      }
    }
    
    return result
  } catch (error) {
    const msg = formatAuthFetchError(error)
    const result = {
      success: false,
      msg,
      errorCode: 'AUTH_FETCH_FAILED',
      data: null
    }
    
    // 读取配置，检查是否开启日志
    const config = readConfig()
    const openLog = config.sys?.open_log === 'true' || config.sys?.open_log === true
    const saveLog = config.sys?.save_log === 'true' || config.sys?.save_log === true
    
    // 如果开启了日志，写入错误日志
    if (openLog && saveLog) {
      const logData = {
        content: `刷新授权失败: ${wxid}, 错误: ${msg}`,
        sys: true,
        time_stamp: Math.floor(Date.now() / 1000)
      }
      
      // 异步写入日志，不阻塞返回值
      saveLogToFile(logData).catch(err => {
        diagnostics.error('L061', `保存授权刷新错误日志失败: ${err.message}`)
      })
      
      // 同时推送到前端显示（如果开启了日志推送）
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('fastapi-message', logData)
      }
    }
    
    return result
  }
})

ipcMain.handle('card-bind', async (_event, payload) => bindCard(payload))

ipcMain.handle('card-unbind', async (_event, payload) => unbindCard(payload))

ipcMain.handle('card-convert-by-wxid', async (_event, payload) => convertCardByWxid(payload))

// 打开外部链接
ipcMain.handle('open-external', async (event, url) => {
  assertMainWindow(event, mainWindow)
  if (!isAllowedExternalUrl(url)) {
    return { success: false, message: '不允许打开此外部链接' }
  }
  await shell.openExternal(url)
  return { success: true }
})

// 根据端口查找PID
ipcMain.handle('find-pid-by-port', async (event, port) => {
  return await findPidByPort(port)
})

ipcMain.handle('get-process-state', (event, pid) => {
  assertMainWindow(event, mainWindow)
  return require('./commons/processLiveness.cjs').getProcessState(pid)
})

// 根据端口杀死进程
ipcMain.handle('kill-process-by-port', async (event, port) => {
  assertMainWindow(event, mainWindow)
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
    const { feed, usedFallback } = await checkForUpdatesWithFallback()
    let message = '正在检查更新，请稍候...'
    if (usedFallback) {
      message = `Gitee 更新源不可用，已改用 ${feed.label} 检查更新`
    }
    return { success: true, message, feed: feed.id, usedFallback }
  } catch (error) {
    const errorMessage = formatUpdateError(error)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'error',
        message: errorMessage
      })
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
    const errorMessage = formatUpdateError(error, { action: '下载', feed: getActiveFeed() })
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

ipcMain.handle('get-log-directory', () => {
  return { success: true, path: getRunLogDirectory() }
})

ipcMain.handle('open-log-directory', async (event) => {
  assertMainWindow(event, mainWindow)
  const dir = getRunLogDirectory()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const result = await shell.openPath(dir)
  return { success: result === '', path: dir, error: result || null }
})

ipcMain.handle('read-today-log-file', async (event, { maxLines } = {}) => {
  assertMainWindow(event, mainWindow)
  return readTodayRunLogTail(maxLines || 400)
})

// 保存日志到文件
ipcMain.handle('save-log-to-file', async (event, data) => {
  try {
    const result = await saveLogToFile(data)
    return { success: result }
  } catch (error) {
    diagnostics.error('L062', '保存日志失败:', error)
    return { success: false, message: error.message }
  }
})
