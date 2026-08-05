/**
 * 企微注入工具：查找可用端口、执行 it.exe start（供主进程 IPC 与 Express API 共用）
 */
const path = require('path')
const fs = require('fs')
const { spawn, execSync } = require('child_process')
const net = require('net')
const ini = require('ini')
const iconv = require('iconv-lite')
const { getConfigPath } = require('../commons/common')
const { DEFAULT_SERVER_PORT, DEFAULT_INJECT_KEY } = require('../configs/defaults')
const {
  DEFAULT_WECOM_VERSION,
  normalizeWecomVersion,
  resolveInjectToolPath,
  resolveInjectDllPath
} = require('../configs/wecomVersion')

/**
 * 与主进程 getAppPath 一致：开发为项目根，打包为 resources
 */
function getAppPathForResources() {
  try {
    const { app } = require('electron')
    if (app && app.isPackaged) {
      return process.resourcesPath
    }
  } catch (e) {
    /* 非 Electron 环境 */
  }
  return path.join(__dirname, '..', '..')
}

/**
 * 本机端口是否可 bind（与主进程 check-port 语义一致：可绑定则未占用）
 */
function checkPortListenAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(port, () => {
      server.once('close', () => resolve({ inUse: false }))
      server.close()
    })
    server.on('error', () => resolve({ inUse: true }))
  })
}

/** 企微 HTTP 端口有效范围：(1024, 10000]，即 1025～10000 */
const WECOM_HTTP_PORT_MIN = 1025
const WECOM_HTTP_PORT_MAX = 10000

/**
 * 查找可用端口（随机优先，失败则顺序扫描）
 * @param {number} [startPort=1025] - 扫描下限（含）
 * @param {number} [endPort=10000] - 扫描上限（含）
 * @returns {Promise<{ port: number | null }>}
 */
async function findAvailablePort(startPort = WECOM_HTTP_PORT_MIN, endPort = WECOM_HTTP_PORT_MAX) {
  const minPort = Math.max(parseInt(startPort, 10) || WECOM_HTTP_PORT_MIN, WECOM_HTTP_PORT_MIN)
  const maxPort = Math.min(parseInt(endPort, 10) || WECOM_HTTP_PORT_MAX, WECOM_HTTP_PORT_MAX)
  if (minPort > maxPort) {
    return { port: null }
  }
  const maxAttempts = 1000

  const isPortAvailable = (p) => {
    return new Promise((resolve) => {
      const server = net.createServer()
      server.listen(p, () => {
        server.once('close', () => resolve(true))
        server.close()
      })
      server.on('error', () => resolve(false))
    })
  }

  const generateRandomPort = () => {
    return Math.floor(Math.random() * (maxPort - minPort + 1)) + minPort
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const p = generateRandomPort()
    if (await isPortAvailable(p)) {
      return { port: p }
    }
  }

  for (let p = minPort; p <= maxPort; p++) {
    if (await isPortAvailable(p)) {
      return { port: p }
    }
  }

  return { port: null }
}

/**
 * 子进程控制台在中文 Windows 下多为 GBK，默认 toString() 按 UTF-8 会乱码
 */
function decodeInjectStdoutChunk(chunk) {
  if (!Buffer.isBuffer(chunk)) {
    chunk = Buffer.from(chunk)
  }
  if (process.platform === 'win32') {
    return iconv.decode(chunk, 'gbk')
  }
  return chunk.toString('utf8')
}

const INJECT_FAIL_OUTPUT_PATTERNS = [
  /文件不存在/,
  /参数错误/,
  /注入失败/,
  /找不到/,
  /not found/i
]

/** 根据 it.exe 输出判断是否真正注入成功（不能只看 exit code） */
function evaluateInjectResult(code, output) {
  const text = String(output || '').trim()

  if (INJECT_FAIL_OUTPUT_PATTERNS.some((pattern) => pattern.test(text))) {
    return { success: false, output: text || '注入失败' }
  }

  if (text.includes('注入成功')) {
    return { success: true, output: text }
  }

  if (code === 0 && !text) {
    return { success: false, output: '注入工具无输出，可能未启动企微' }
  }

  return {
    success: false,
    output: text || `注入进程退出码 ${code}`
  }
}

/** v5 注入工具加载 device.dll；旧包可能只有 vworkApi.dll */
function ensureInjectDllReady(injectBinDir, version) {
  const dllInfo = resolveInjectDllPath(injectBinDir, version)
  if (!dllInfo.source) {
    const expected = dllInfo.dllName
    return {
      ok: false,
      output: `注入库不存在: ${path.join(injectBinDir, expected)}（当前企微版本: ${version}）`
    }
  }
  if (dllInfo.source === dllInfo.dllName) {
    return { ok: true, dllPath: dllInfo.dllPath }
  }
  try {
    fs.copyFileSync(dllInfo.aliasPath, dllInfo.dllPath)
    console.log(`[注入工具] 已将 ${dllInfo.source} 复制为 ${dllInfo.dllName}`)
    return { ok: true, dllPath: dllInfo.dllPath, copiedFrom: dllInfo.source }
  } catch (err) {
    return {
      ok: false,
      output: `无法准备 ${dllInfo.dllName}: ${err.message}`
    }
  }
}

/** 从注册表或默认目录解析本机企微可执行文件路径 */
function resolveWecomExePath(conf) {
  const configured = String(conf?.sys?.wecom_exe_path || '').trim()
  if (configured && fs.existsSync(configured)) {
    return configured
  }

  if (process.platform === 'win32') {
    try {
      const out = execSync('reg query "HKCU\\Software\\Tencent\\WXWork" /v Executable', {
        encoding: 'utf8'
      })
      const match = out.match(/Executable\s+REG_\w+\s+(.+)/i)
      const exePath = match?.[1]?.trim()
      if (exePath && fs.existsSync(exePath)) {
        return exePath
      }
    } catch {
      /* ignore */
    }

    const localExe = path.join(process.env.LOCALAPPDATA || '', 'WXWork', 'WXWork.exe')
    if (localExe && fs.existsSync(localExe)) {
      return localExe
    }
  }

  return ''
}

function buildInjectArgs({ port, serverPort, injectKey, wecomExePath }) {
  const args = [
    'start',
    String(port),
    `--my_port=${serverPort}`,
    `--key=${injectKey}`
  ]
  if (wecomExePath) {
    args.push(`--exe_path=${wecomExePath}`)
  }
  return args
}

/** 将 it.exe 原始输出转为更易懂的提示 */
function formatInjectErrorHint(output, wecomVersion, wecomExePath) {
  const text = String(output || '').trim()
  if (/文件不存在|找不到/.test(text)) {
    const verLabel = wecomVersion === 'v5' ? '企微 v5' : '企微 v4'
    const dllName = wecomVersion === 'v5' ? 'device.dll' : 'vworkApi.dll'
    let hint = `${text}。请确认本机已安装 ${verLabel} 客户端，且注入工具版本与客户端一致；v4/v5 不能混用。`
    if (wecomVersion === 'v5') {
      hint += ` v5 注入目录需包含 ${dllName}（若仅有 vworkApi.dll 会自动复制）。`
    }
    if (wecomExePath) {
      hint += ` 当前企微路径: ${wecomExePath}`
    }
    return hint
  }
  if (/参数错误/.test(text)) {
    return `${text}。请检查框架监听端口与注入 key 配置。`
  }
  return text || '注入失败'
}

/**
 * 执行注入工具启动企微
 * @param {object} options
 * @param {number|string} options.port - 企微 HTTP 端口
 * @param {number|string} options.serverPort - 框架监听端口
 * @param {string} [options.key] - 注入 key
 * @param {string} [options.wecomVersion] - v4 | v5，未传则从 conf.ini 读取
 * @returns {Promise<{ success: boolean, output: string, wecomVersion?: string }>}
 */
function runInjectTool({ port, serverPort, key, wecomVersion }) {
  const appRoot = getAppPathForResources()
  let version = normalizeWecomVersion(wecomVersion)

  if (!version) {
    try {
      const content = fs.readFileSync(getConfigPath(), 'utf-8')
      const conf = ini.parse(content)
      version = normalizeWecomVersion(conf.sys?.wecom_version)
    } catch {
      /* ignore */
    }
  }

  version = version || DEFAULT_WECOM_VERSION
  const { injectToolPath } = resolveInjectToolPath(appRoot, version)

  if (!fs.existsSync(injectToolPath)) {
    return Promise.resolve({
      success: false,
      wecomVersion: version,
      output: `注入工具不存在: ${injectToolPath}（当前企微版本: ${version}）`
    })
  }

  const injectBinDir = path.dirname(injectToolPath)
  const dllReady = ensureInjectDllReady(injectBinDir, version)
  if (!dllReady.ok) {
    return Promise.resolve({
      success: false,
      wecomVersion: version,
      output: dllReady.output
    })
  }

  let conf = {}
  try {
    const content = fs.readFileSync(getConfigPath(), 'utf-8')
    conf = ini.parse(content)
  } catch {
    /* ignore */
  }

  const injectKey = key || conf.sys?.inject_key || DEFAULT_INJECT_KEY
  const wecomExePath = resolveWecomExePath(conf)
  const spawnArgs = buildInjectArgs({ port, serverPort, injectKey, wecomExePath })

  return new Promise((resolve) => {
    let finished = false
    const finish = (payload) => {
      if (finished) return
      finished = true
      resolve({ ...payload, wecomVersion: version, injectToolPath })
    }

    console.log(`[注入工具] version=${version} exe=${injectToolPath} cwd=${injectBinDir} port=${port} serverPort=${serverPort}${wecomExePath ? ` wecomExe=${wecomExePath}` : ''}`)

    const child = spawn(injectToolPath, spawnArgs, {
      cwd: injectBinDir
    })

    let output = ''
    child.stdout.on('data', (data) => {
      output += decodeInjectStdoutChunk(data)
    })
    child.stderr.on('data', (data) => {
      output += decodeInjectStdoutChunk(data)
    })

    child.on('error', (err) => {
      finish({ success: false, output: err.message })
    })
    child.on('close', (code) => {
      const evaluated = evaluateInjectResult(code, output)
      if (!evaluated.success) {
        evaluated.output = formatInjectErrorHint(evaluated.output, version, wecomExePath)
      }
      finish(evaluated)
    })
  })
}

/**
 * 从 conf.ini 读取框架监听端口、注入 key、企微版本
 */
function readInjectConfig() {
  try {
    const content = fs.readFileSync(getConfigPath(), 'utf-8')
    const conf = ini.parse(content)
    const serverPort = parseInt(conf.sys?.server_port || DEFAULT_SERVER_PORT, 10) || DEFAULT_SERVER_PORT
    const key = conf.sys?.inject_key || DEFAULT_INJECT_KEY
    const wecomVersion = normalizeWecomVersion(conf.sys?.wecom_version) || DEFAULT_WECOM_VERSION
    return { serverPort, key, wecomVersion }
  } catch (e) {
    return { serverPort: DEFAULT_SERVER_PORT, key: DEFAULT_INJECT_KEY, wecomVersion: DEFAULT_WECOM_VERSION }
  }
}

module.exports = {
  getAppPathForResources,
  checkPortListenAvailable,
  findAvailablePort,
  runInjectTool,
  readInjectConfig,
  evaluateInjectResult,
  formatInjectErrorHint,
  ensureInjectDllReady,
  resolveWecomExePath,
  buildInjectArgs
}
