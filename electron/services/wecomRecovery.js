const { spawn } = require('child_process')
const { DEFAULT_WECOM_VERSION } = require('../configs/wecomVersion')
const { resolveWecomExePath } = require('./wecomInject')
const { getWecomAgentManager } = require('./wecomAgentManager')

function createWecomRecovery(options = {}) {
  const readConfig = options.readConfig || (() => ({ sys: {} }))
  const resolveExecutable = options.resolveWecomExePath || resolveWecomExePath
  const spawnProcess = options.spawnProcess || spawn
  const delay = options.delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const agentManager = options.agentManager || getWecomAgentManager()
  const onLog = options.onLog || ((level, message) => console[level]?.(message))
  const startupDelayMs = options.startupDelayMs ?? 8000

  async function recover({ callbackUrl } = {}) {
    const conf = readConfig()
    const resolved = resolveExecutable(conf, DEFAULT_WECOM_VERSION)
    if (!resolved?.path) {
      return {
        success: false,
        message: resolved?.error || '未找到企业微信客户端路径'
      }
    }

    let launchError = null
    try {
      const child = spawnProcess(resolved.path, [], {
        cwd: require('path').dirname(resolved.path),
        windowsHide: true,
        detached: true,
        shell: false,
        stdio: 'ignore'
      })
      child?.once?.('error', (error) => {
        launchError = error
        onLog('error', `[企微崩溃] 企业微信启动失败: ${error.message}`)
      })
      child?.unref?.()
      onLog('log', `[企微崩溃] 已重新启动企业微信: ${resolved.path}`)
    } catch (error) {
      return { success: false, message: `启动企业微信失败: ${error.message}` }
    }

    await delay(startupDelayMs)
    if (launchError) {
      return { success: false, message: `启动企业微信失败: ${launchError.message}` }
    }
    const agentResult = await agentManager.ensureStarted({ callbackUrl })
    if (launchError) {
      return { success: false, message: `启动企业微信失败: ${launchError.message}` }
    }
    if (!agentResult?.success) {
      return {
        success: false,
        message: agentResult?.output || '企微 Agent 重新连接失败'
      }
    }
    return {
      success: true,
      connected: agentResult.connected === true,
      message: agentResult.output || '企业微信恢复已启动'
    }
  }

  return { recover }
}

module.exports = { createWecomRecovery }
