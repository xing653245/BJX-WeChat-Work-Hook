const { createDiagnostics } = require('../commons/diagnostics.cjs')
const diagnostics = createDiagnostics('services/wecomInject.js')
/**
 * 企微注入工具：查找可用端口、执行 it.exe --port <端口>（供主进程 IPC 与 Express API 共用）
 */
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const net = require('net')
const { StringDecoder } = require('string_decoder')
const { getInjectToolPath } = require('../commons/resourcePaths')

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
  // 随机起点后遍历一次，避免在端口紧张时重复探测同一端口。
  const count = maxPort - minPort + 1
  const offset = Math.floor(Math.random() * count)
  for (let i = 0; i < count; i++) {
    const port = minPort + (offset + i) % count
    if (!(await checkPortListenAvailable(port)).inUse) return { port }
  }
  return { port: null }
}

const INJECT_FAIL_OUTPUT_PATTERNS = [
  /文件不存在/,
  /参数错误/,
  /注入失败/,
  /无法启动企业微信/,
  /宿主文件校验失败|设置目标环境失败|加载日志 DLL 失败/,
  /找不到/,
  /未能找到路径/,
  /not found/i
]

/** 根据 it.exe 输出判断是否真正注入成功（不能只看 exit code） */
function evaluateInjectResult(code, output) {
  const text = String(output || '').trim()

  if (INJECT_FAIL_OUTPUT_PATTERNS.some((pattern) => pattern.test(text))) {
    return { success: false, output: text || '注入失败' }
  }

  // 新工具的命令行模式可能静默退出，不再依赖旧版“注入成功”文案。
  if (code === 0) {
    return { success: true, output: text || '注入工具执行完成' }
  }

  return {
    success: false,
    output: text || `注入进程退出码 ${code}`
  }
}

function buildInjectArgs({ port }) {
  return ['--port', String(port)]
}

/** 将 it.exe 原始输出转为更易懂的提示 */
function formatInjectErrorHint(output) {
  const text = String(output || '').trim()
  if (/未能找到路径/.test(text)) {
    return `${text}。请检查注入工具目录下 settings.json 的 host 是否指向本机实际存在的 WXWork.exe。`
  }
  if (/文件不存在|找不到/.test(text)) {
    let hint = `${text}。请确认本机已安装当前企微客户端。`

    return hint
  }
  if (/参数错误/.test(text)) {
    return `${text}。请检查 --port 指定的企微端口。`
  }
  return text || '注入失败'
}

/**
 * 执行注入工具启动企微
 * @param {object} options
 * @param {number|string} options.port - 企微 HTTP 端口
 * @returns {Promise<{ success: boolean, output: string, injectToolPath?: string }>}
 */
function runInjectTool({ port }) {
  if (!Number.isInteger(Number(port)) || Number(port) < WECOM_HTTP_PORT_MIN || Number(port) > WECOM_HTTP_PORT_MAX) {
    return Promise.resolve({ success: false, output: '企微端口必须为 1025–10000 的整数' })
  }
  const injectToolPath = getInjectToolPath()
  if (!fs.existsSync(injectToolPath)) {
    return Promise.resolve({
      success: false,
      output: `注入工具不存在: ${injectToolPath}`
    })
  }

  const injectBinDir = path.dirname(injectToolPath)
  // 配套配置由注入工具自行读取，框架只传入端口。
  const spawnArgs = buildInjectArgs({ port })

  return new Promise((resolve) => {
    let finished = false
    const finish = (payload) => {
      if (finished) return
      finished = true
      resolve({ ...payload, injectToolPath })
    }

    diagnostics.info('L001', `[注入工具] exe=${injectToolPath} cwd=${injectBinDir} port=${port}`)

    const child = spawn(injectToolPath, spawnArgs, {
      cwd: injectBinDir,
      windowsHide: true,
      shell: false
    })

    let output = ''
    // 新工具重定向输出为 UTF-8；两个流分别保留跨数据块的多字节字符。
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    child.stdout.on('data', (data) => {
      output += stdoutDecoder.write(data)
    })
    child.stderr.on('data', (data) => {
      output += stderrDecoder.write(data)
    })

    child.on('error', (err) => {
      finish({ success: false, output: err.message })
    })
    child.on('close', (code) => {
      output += stdoutDecoder.end() + stderrDecoder.end()
      const evaluated = evaluateInjectResult(code, output)
      if (!evaluated.success) {
        evaluated.output = formatInjectErrorHint(evaluated.output)
      }
      finish(evaluated)
    })
  })
}

module.exports = {
  checkPortListenAvailable,
  findAvailablePort,
  runInjectTool,
  evaluateInjectResult,
  formatInjectErrorHint,
  buildInjectArgs
}
