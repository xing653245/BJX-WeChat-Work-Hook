const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const AGENT_HTTP_PORT = 8080
const AGENT_WS_PORT = 8081
const AGENT_BASE_URL = `http://127.0.0.1:${AGENT_HTTP_PORT}`
const AGENT_EXECUTABLE_NAME = 'WeComHttpAgentStable.exe'

function resolveAgentExecutable() {
  try {
    const { app } = require('electron')
    if (app?.isPackaged) {
      return path.join(process.resourcesPath, 'bin', 'agent', AGENT_EXECUTABLE_NAME)
    }
  } catch {
    /* plain Node / tests */
  }
  return path.join(__dirname, '..', '..', 'bin', 'agent', AGENT_EXECUTABLE_NAME)
}

async function defaultRequest({ method = 'GET', path: requestPath, data, params, timeout = 15000 }) {
  const axios = require('axios')
  const response = await axios({
    method,
    url: `${AGENT_BASE_URL}${requestPath}`,
    data,
    params,
    timeout,
    proxy: false,
    family: 4
  })
  return response.data
}

function createWecomAgentManager(options = {}) {
  const executablePath = options.executablePath || resolveAgentExecutable()
  const fileExists = options.fileExists || fs.existsSync
  const spawnProcess = options.spawnProcess || spawn
  const request = options.request || defaultRequest
  const delay = options.delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const onLog = options.onLog || ((level, message) => console[level]?.(message))

  let child = null
  let ownsProcess = false
  let startPromise = null

  async function isHealthy() {
    try {
      const response = await request({ method: 'GET', path: '/health', timeout: 1500 })
      return response?.status === 'ok'
    } catch {
      return false
    }
  }

  function wireChildProcess(processHandle) {
    if (processHandle?.stdout?.on) {
      processHandle.stdout.on('data', (chunk) => {
        const message = String(chunk || '').trim()
        if (message) onLog('log', `[企微 Agent] ${message}`)
      })
    }
    if (processHandle?.stderr?.on) {
      processHandle.stderr.on('data', (chunk) => {
        const message = String(chunk || '').trim()
        if (message) onLog('warn', `[企微 Agent] ${message}`)
      })
    }
    processHandle?.once?.('error', (error) => {
      onLog('error', `[企微 Agent] 启动失败: ${error.message}`)
    })
    processHandle?.once?.('exit', (code, signal) => {
      onLog('warn', `[企微 Agent] 已退出（code=${code ?? '-'}, signal=${signal ?? '-'}）`)
      if (child === processHandle) {
        child = null
        ownsProcess = false
      }
    })
  }

  async function waitUntilHealthy() {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await isHealthy()) return true
      if (attempt < 59) await delay(500)
    }
    return false
  }

  async function startInternal({ callbackUrl } = {}) {
    try {
      let reused = await isHealthy()
      if (!reused) {
        if (!fileExists(executablePath)) {
          return {
            success: false,
            port: AGENT_HTTP_PORT,
            output: `企微 Agent 不存在: ${executablePath}`
          }
        }

        child = spawnProcess(executablePath, [], {
          cwd: path.dirname(executablePath),
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        ownsProcess = true
        wireChildProcess(child)

        if (!(await waitUntilHealthy())) {
          return {
            success: false,
            port: AGENT_HTTP_PORT,
            output: '企微 Agent 启动超时，请查看运行日志'
          }
        }
      }

      if (callbackUrl) {
        await request({
          method: 'PUT',
          path: '/api/v1/config/callback',
          data: { callback_url: callbackUrl }
        })
      }

      let connected = false
      let startMessage = ''
      try {
        const startResult = await request({
          method: 'POST',
          path: '/api/v1/start',
          data: {}
        })
        connected = startResult?.data?.wx_connected === true
        startMessage = startResult?.message || ''
      } catch (error) {
        startMessage = error?.response?.data?.message || error.message || String(error)
        onLog('warn', `[企微 Agent] 连接尚未就绪，将继续自动重试: ${startMessage}`)
      }

      return {
        success: true,
        port: AGENT_HTTP_PORT,
        wsPort: AGENT_WS_PORT,
        pid: child?.pid || null,
        reused,
        connected,
        output: connected
          ? '企微 Agent 已连接'
          : (startMessage || '企微 Agent 已启动，等待企微登录')
      }
    } catch (error) {
      return {
        success: false,
        port: AGENT_HTTP_PORT,
        output: error.message || String(error)
      }
    }
  }

  async function ensureStarted(options = {}) {
    if (!startPromise) {
      startPromise = startInternal(options).finally(() => {
        startPromise = null
      })
    }
    return startPromise
  }

  function stop() {
    if (!ownsProcess || !child) return false
    try {
      child.kill()
      return true
    } catch (error) {
      onLog('warn', `[企微 Agent] 关闭失败: ${error.message}`)
      return false
    }
  }

  return {
    ensureStarted,
    isHealthy,
    request,
    stop,
    getPid: () => child?.pid || null,
    getExecutablePath: () => executablePath
  }
}

let singleton = null

function getWecomAgentManager() {
  if (!singleton) singleton = createWecomAgentManager()
  return singleton
}

module.exports = {
  AGENT_HTTP_PORT,
  AGENT_WS_PORT,
  AGENT_BASE_URL,
  AGENT_EXECUTABLE_NAME,
  resolveAgentExecutable,
  createWecomAgentManager,
  getWecomAgentManager
}
