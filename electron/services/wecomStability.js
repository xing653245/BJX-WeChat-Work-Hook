/**
 * 企微稳定性：防重复注入、登录/注入后保护期、写操作延迟
 */
const { exec } = require('child_process')
const axios = require('axios')
const { parseNetstatListeningPids, parseNetstatLocalPids } = require('../commons/portProcess.cjs')

/** 注入后 Hook 初始化保护（此期间写操作排队延迟） */
const STABILIZING_AFTER_INJECT_MS = 45000
/** 登录成功后额外保护，避免立即发送测试消息干扰 Hook */
const PROTECTION_AFTER_LOGIN_MS = 25000
/** 账号切换期间保护 */
const PROTECTION_ACCOUNT_SWITCH_MS = 15000
/** 手动注入失败后最短重试间隔（防连点） */
const MANUAL_INJECT_RETRY_MS = 15000

const portStabilizingUntil = new Map()
const portLoggedInProtectionUntil = new Map()
const portAccountSwitchUntil = new Map()
const lastInjectAttemptAt = new Map()
const lastInjectSuccessAt = new Map()

function portKey(port) {
  return String(Number(port))
}

function findPidByPort(port) {
  return new Promise((resolve) => {
    const p = Number(port)
    if (Number.isNaN(p) || p <= 0) {
      resolve(-1)
      return
    }
    if (process.platform === 'win32') {
      exec('netstat -ano -p tcp', (error, stdout) => {
        if (error || !stdout) {
          resolve(-1)
          return
        }
        const listening = parseNetstatListeningPids(stdout, p)
        if (listening[0]) {
          resolve(listening[0])
          return
        }
        const local = parseNetstatLocalPids(stdout, p)
        resolve(local[0] || -1)
      })
      return
    }
    exec(`lsof -ti:${p}`, (error, stdout) => {
      if (error || !stdout) {
        resolve(-1)
        return
      }
      const pid = parseInt(String(stdout).trim().split('\n')[0], 10)
      resolve(Number.isNaN(pid) ? -1 : pid)
    })
  })
}

async function probeHookReachable(port) {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return false
  try {
    await axios.post(`http://127.0.0.1:${p}/api`, { type: 1000 }, { timeout: 3000 })
    return true
  } catch {
    return false
  }
}

function getProtectionUntil(port) {
  const key = portKey(port)
  return Math.max(
    portStabilizingUntil.get(key) || 0,
    portLoggedInProtectionUntil.get(key) || 0,
    portAccountSwitchUntil.get(key) || 0
  )
}

function markPortStabilizing(port, durationMs = STABILIZING_AFTER_INJECT_MS) {
  const key = portKey(port)
  if (!key || key === 'NaN') return
  portStabilizingUntil.set(key, Date.now() + durationMs)
}

function markPortLoggedIn(port, durationMs = PROTECTION_AFTER_LOGIN_MS) {
  const key = portKey(port)
  if (!key || key === 'NaN') return
  // 已登录说明 Hook 可用，结束注入初始化保护，避免阻塞关闭自动更新等必要调用
  portStabilizingUntil.delete(key)
  portLoggedInProtectionUntil.set(key, Date.now() + durationMs)
}

function markPortAccountSwitch(port, durationMs = PROTECTION_ACCOUNT_SWITCH_MS) {
  const key = portKey(port)
  if (!key || key === 'NaN') return
  portAccountSwitchUntil.set(key, Date.now() + durationMs)
}

function recordInjectAttempt(port, success) {
  const key = portKey(port)
  const now = Date.now()
  lastInjectAttemptAt.set(key, now)
  if (success) {
    lastInjectSuccessAt.set(key, now)
  }
}

/**
 * 仅文本测试发送在保护期内等待；登录管理和关闭自动更新立即执行。
 */
function heavyApiDeferMs(port, type) {
  if (Number(type) !== 3000) {
    return 0
  }
  const until = getProtectionUntil(port)
  const wait = until - Date.now()
  return wait > 0 ? wait : 0
}

/**
 * 注入前安全检查
 * @param {number} port
 */
async function canInjectPort(port) {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) {
    return { allowed: false, reason: '端口无效' }
  }

  const key = portKey(p)
  const stabilizingUntil = portStabilizingUntil.get(key) || 0
  if (stabilizingUntil > Date.now()) {
    const sec = Math.ceil((stabilizingUntil - Date.now()) / 1000)
    return {
      allowed: false,
      reason: `端口 ${p} Hook 仍在初始化（约 ${sec}s），请勿重复注入以免崩溃`
    }
  }

  const lastAttempt = lastInjectAttemptAt.get(key) || 0
  const cooldown = MANUAL_INJECT_RETRY_MS
  const lastSuccess = lastInjectSuccessAt.get(key) || 0
  const cooldownBase =
    lastSuccess === 0 ? lastAttempt : Math.max(lastAttempt, lastSuccess)
  if (Date.now() - cooldownBase < cooldown) {
    const sec = Math.ceil((cooldown - (Date.now() - cooldownBase)) / 1000)
    return {
      allowed: false,
      reason: `端口 ${p} 距上次注入过近（请 ${sec}s 后再试），频繁注入易导致企微崩溃`
    }
  }

  const pid = await findPidByPort(p)
  const hookUp = await probeHookReachable(p)

  if (hookUp) {
    return {
      allowed: false,
      reason: `端口 ${p} 上 Hook 已在运行，请勿重复注入（易导致崩溃）`
    }
  }

  if (pid > 0) {
    return {
      allowed: false,
      reason: `端口 ${p} 已被占用（PID ${pid}），请先结束 WXWork.exe 或更换端口`
    }
  }

  return { allowed: true }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * type=900 可能是瞬时掉线。仍已登录、Hook 还在或进程还在时不能当退出处理。
 */
async function isWecomInstanceStillAlive(port) {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return { alive: false, loggedIn: false }
  for (let i = 0; i < 3; i++) {
    try {
      const { data } = await axios.post(`http://127.0.0.1:${p}/api`, { type: 1000 }, {
        timeout: 4000,
        proxy: false,
        family: 4
      })
      const status = data && data.data ? data.data.status : undefined
      if (Number(status) === 1 || status === true) {
        return { alive: true, loggedIn: true }
      }
      if (data != null) return { alive: true, loggedIn: false }
    } catch {
      /* Hook 可能瞬时不可达 */
    }
    if (i < 2) await sleep(1200)
  }
  if (await probeHookReachable(p)) return { alive: true, loggedIn: false }
  const pid = await findPidByPort(p)
  if (pid > 0) return { alive: true, loggedIn: false, pid }
  return { alive: false, loggedIn: false }
}

module.exports = {
  markPortStabilizing,
  markPortLoggedIn,
  markPortAccountSwitch,
  recordInjectAttempt,
  heavyApiDeferMs,
  canInjectPort,
  isWecomInstanceStillAlive,
  findPidByPort
}
