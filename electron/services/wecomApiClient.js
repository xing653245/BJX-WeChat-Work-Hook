/**
 * 企微本地 HTTP API 客户端：同一端口所有 Hook 请求串行 + 写操作最小间隔，避免并发压垮 Hook 导致崩溃。
 */
const axios = require('axios')

/** 消息发送 type（3000～3011） */
const MESSAGE_SEND_TYPES = new Set([
  3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 3011
])

/** 群组写操作 type（5000～5019），群发/群公告等 */
const GROUP_WRITE_TYPES = new Set([
  5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008,
  5009, 5010, 5011, 5012, 5013, 5014, 5015, 5016, 5017, 5018, 5019
])

/** 小程序/媒体/CDN 等重操作，间隔更长 */
const HEAVY_MESSAGE_TYPES = new Set([3001, 3003, 3004, 3007, 3011, 9000])

/** 小程序（3006）：群发场景 Hook 需读封面并上传，单独加长间隔与冷却 */
const APPLET_MESSAGE_TYPE = 3006

/** 标签读操作（6000 标签组、6006 标签联系人），连续调用易压 Hook */
const TAG_READ_TYPES = new Set([6000, 6006])

/** 网络好友（4008 查询、4009 加好友），Hook 敏感且可能较慢 */
const FRIEND_NETWORK_TYPES = new Set([4008, 4009])

const { heavyApiDeferMs } = require('./wecomStability')

const MIN_INTERVAL_MS = {
  message: 1000,
  group: 1000,
  heavy: 2000,
  applet: 4000,
  tagRead: 400,
  friendNetwork: 2000
}

/** 请求结束后额外冷却（Hook 可能在 HTTP 返回后仍在处理封面/发送） */
const POST_COMPLETION_COOLDOWN_MS = {
  [APPLET_MESSAGE_TYPE]: 3000
}

/** 小程序请求失败/超时后额外等待，避免 Hook 仍在处理时收到下一请求 */
const APPLET_ERROR_RECOVERY_MS = 8000

/** 单端口小程序待发队列上限，超出直接拒绝，防止客户端超时重试压垮 Hook */
const MAX_APPLET_QUEUE_DEPTH = 20

/** 按 type 的请求超时（小程序封面上传可能较慢） */
const REQUEST_TIMEOUT_MS = {
  [APPLET_MESSAGE_TYPE]: 120000,
  4008: 60000,
  4009: 60000
}
const DEFAULT_REQUEST_TIMEOUT_MS = 30000
const HEAVY_REQUEST_TIMEOUT_MS = 60000

const portQueues = new Map()

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function isAppletType(type) {
  return Number(type) === APPLET_MESSAGE_TYPE
}

function getMinInterval(type) {
  const t = Number(type)
  if (t === APPLET_MESSAGE_TYPE) return MIN_INTERVAL_MS.applet
  if (HEAVY_MESSAGE_TYPES.has(t)) return MIN_INTERVAL_MS.heavy
  if (MESSAGE_SEND_TYPES.has(t)) return MIN_INTERVAL_MS.message
  if (GROUP_WRITE_TYPES.has(t)) return MIN_INTERVAL_MS.group
  if (TAG_READ_TYPES.has(t)) return MIN_INTERVAL_MS.tagRead
  if (FRIEND_NETWORK_TYPES.has(t)) return MIN_INTERVAL_MS.friendNetwork
  return 0
}

function getPostCompletionCooldown(type) {
  return POST_COMPLETION_COOLDOWN_MS[Number(type)] || 0
}

function getRequestTimeout(type) {
  const t = Number(type)
  if (REQUEST_TIMEOUT_MS[t] != null) return REQUEST_TIMEOUT_MS[t]
  if (HEAVY_MESSAGE_TYPES.has(t)) return HEAVY_REQUEST_TIMEOUT_MS
  return DEFAULT_REQUEST_TIMEOUT_MS
}

function getPortQueue(port) {
  const key = String(port)
  if (!portQueues.has(key)) {
    portQueues.set(key, {
      tail: Promise.resolve(),
      lastDoneAt: 0,
      appletPending: 0
    })
  }
  return portQueues.get(key)
}

/**
 * 同一端口所有 Hook 请求均串行（前序失败不阻断后续），避免群发时与登录探测等并发访问导致崩溃
 */
function enqueuePortTask(port, type, taskFn) {
  const q = getPortQueue(port)
  const applet = isAppletType(type)

  if (applet) {
    if (q.appletPending >= MAX_APPLET_QUEUE_DEPTH) {
      const err = new Error(
        `小程序发送队列已满（${MAX_APPLET_QUEUE_DEPTH}），请降低群发并发或等待队列消化后再试`
      )
      err.code = 'APPLET_QUEUE_FULL'
      return Promise.reject(err)
    }
    q.appletPending++
  }

  const run = async () => {
    const stabilizingWait = heavyApiDeferMs(port, type)
    if (stabilizingWait > 0) {
      console.log(
        `[Hook队列] 端口 ${port} 登录保护期内，写操作延迟 ${Math.round(stabilizingWait / 1000)}s（type ${type}）`
      )
      await sleep(stabilizingWait)
    }

    const interval = getMinInterval(type)
    if (interval > 0) {
      const wait = interval - (Date.now() - q.lastDoneAt)
      if (wait > 0) {
        await sleep(wait)
      }
    }

    let failed = false
    try {
      return await taskFn()
    } catch (e) {
      failed = true
      throw e
    } finally {
      if (failed && applet) {
        console.warn(
          `[Hook队列] 端口 ${port} 小程序发送失败，额外等待 ${APPLET_ERROR_RECOVERY_MS / 1000}s 再处理下一请求`
        )
        await sleep(APPLET_ERROR_RECOVERY_MS)
      }

      const cooldown = getPostCompletionCooldown(type)
      if (cooldown > 0) {
        await sleep(cooldown)
      }

      q.lastDoneAt = Date.now()

      if (applet) {
        q.appletPending = Math.max(0, q.appletPending - 1)
      }
    }
  }

  const result = q.tail.then(run, run)
  q.tail = result.catch(() => {})
  return result
}

/**
 * POST 到企微实例本地 API（同一端口串行 + 写操作最小间隔）
 * @param {number|string} port
 * @param {object} requestData 含 type 及业务字段
 * @param {{ timeout?: number }} [options]
 */
async function postToVWorkApi(port, requestData, options = {}) {
  const type = Number(requestData?.type)
  const url = `http://127.0.0.1:${port}/api`
  const timeout = options.timeout ?? getRequestTimeout(type)

  if (type === 4008 || type === 4009) {
    const {
      assertFriendNetworkReady,
      recordNetworkQuery,
      validateAddNetworkParams,
      buildAddNetworkHookPayload
    } = require('./friendNetworkGuard')

    await assertFriendNetworkReady(port)

    let hookPayload = requestData
    if (type === 4009) {
      const check = validateAddNetworkParams(port, requestData)
      if (!check.valid) {
        const err = new Error(check.message)
        err.code = 'INVALID_FRIEND_NETWORK_PARAMS'
        throw err
      }
      hookPayload = buildAddNetworkHookPayload(check.params)
    }

    const data = await enqueuePortTask(port, type, () =>
      axios.post(url, hookPayload, { timeout, proxy: false, family: 4 }).then((res) => res.data)
    )

    if (type === 4008) {
      recordNetworkQuery(port, requestData.key, data)
    }

    return data
  }

  return enqueuePortTask(port, type, () =>
    axios.post(url, requestData, { timeout, proxy: false, family: 4 }).then((res) => res.data)
  )
}

/**
 * POST 到企微实例自定义路径（如 /updatesettings），不走 /api + type
 */
async function postToWecomPath(port, pathname, body, options = {}) {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  const url = `http://127.0.0.1:${port}${path}`
  const timeout = options.timeout ?? 10000
  return enqueuePortTask(port, 0, () =>
    axios.post(url, body, {
      timeout,
      proxy: false,
      family: 4,
      headers: { 'Content-Type': 'application/json' }
    }).then((res) => res.data)
  )
}

module.exports = {
  postToVWorkApi,
  postToWecomPath,
  enqueuePortTask,
  MESSAGE_SEND_TYPES,
  GROUP_WRITE_TYPES,
  HEAVY_MESSAGE_TYPES,
  APPLET_MESSAGE_TYPE,
  MAX_APPLET_QUEUE_DEPTH
}
