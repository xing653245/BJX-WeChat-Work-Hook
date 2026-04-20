/**
 * 企微注入工具：查找可用端口、执行 it.exe start（供主进程 IPC 与 Express API 共用）
 */
const path = require('path')
const { spawn } = require('child_process')
const net = require('net')
const fs = require('fs')
const ini = require('ini')
const iconv = require('iconv-lite')
const { getConfigPath } = require('../commons/common')
const { DEFAULT_SERVER_PORT, DEFAULT_INJECT_KEY } = require('../configs/defaults')

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
  // 与 main.js getAppPath 一致：main 位于 electron/ 时用 join(__dirname,'..') 为项目根；
  // 本文件在 electron/services/，需上两级才是项目根（bin/it.exe 在项目根下）
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

/**
 * 查找可用端口（随机优先，失败则顺序扫描）
 * @param {number} startPort - 随机与顺序扫描下限，默认 1024
 * @returns {Promise<{ port: number | null }>}
 */
async function findAvailablePort(startPort = 1024) {
  const minPort = startPort || 1024
  const maxPort = 65535
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

/**
 * 执行注入工具启动企微
 * @returns {Promise<{ success: boolean, output: string }>}
 */
function runInjectTool({ port, serverPort, key }) {
  const injectToolPath = path.join(getAppPathForResources(), 'bin', 'it.exe')
  const injectKey = key || DEFAULT_INJECT_KEY
  return new Promise((resolve) => {
    let finished = false
    const finish = (payload) => {
      if (finished) return
      finished = true
      resolve(payload)
    }

    const child = spawn(injectToolPath, [
      'start',
      String(port),
      `--my_port=${serverPort}`,
      `--key=${injectKey}`
    ])

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
      finish({ success: code === 0, output })
    })
  })
}

/**
 * 从 conf.ini 读取框架监听端口与注入 key
 */
function readInjectConfig() {
  try {
    const content = fs.readFileSync(getConfigPath(), 'utf-8')
    const conf = ini.parse(content)
    const serverPort = parseInt(conf.sys?.server_port || DEFAULT_SERVER_PORT, 10) || DEFAULT_SERVER_PORT
    const key = conf.sys?.inject_key || DEFAULT_INJECT_KEY
    return { serverPort, key }
  } catch (e) {
    return { serverPort: DEFAULT_SERVER_PORT, key: DEFAULT_INJECT_KEY }
  }
}

module.exports = {
  getAppPathForResources,
  checkPortListenAvailable,
  findAvailablePort,
  runInjectTool,
  readInjectConfig
}
