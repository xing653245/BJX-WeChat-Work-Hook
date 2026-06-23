/**
 * 企微本地 HTTP API 客户端：对消息发送类接口按端口串行 + 最小间隔，避免并发压垮 Hook 导致崩溃。
 */
const axios = require('axios')

/** 消息发送 type（3000～3011）需排队 */
const MESSAGE_SEND_TYPES = new Set([
  3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 3011
])

/** 小程序/媒体等重操作，间隔更长 */
const HEAVY_MESSAGE_TYPES = new Set([3001, 3003, 3004, 3006, 3007, 3011])

const MIN_INTERVAL_MS = {
  message: 600,
  heavy: 1500
}

const portQueues = new Map()

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function getMinInterval(type) {
  const t = Number(type)
  if (HEAVY_MESSAGE_TYPES.has(t)) return MIN_INTERVAL_MS.heavy
  if (MESSAGE_SEND_TYPES.has(t)) return MIN_INTERVAL_MS.message
  return 0
}

function needsQueue(type) {
  return MESSAGE_SEND_TYPES.has(Number(type))
}

function getPortQueue(port) {
  const key = String(port)
  if (!portQueues.has(key)) {
    portQueues.set(key, { tail: Promise.resolve(), lastDoneAt: 0 })
  }
  return portQueues.get(key)
}

/**
 * 在单端口队列中执行任务（前序失败不阻断后续）
 */
function enqueuePortTask(port, type, taskFn) {
  if (!needsQueue(type)) {
    return taskFn()
  }
  const q = getPortQueue(port)
  const run = async () => {
    const interval = getMinInterval(type)
    if (interval > 0) {
      const wait = interval - (Date.now() - q.lastDoneAt)
      if (wait > 0) {
        await sleep(wait)
      }
    }
    try {
      return await taskFn()
    } finally {
      q.lastDoneAt = Date.now()
    }
  }
  const result = q.tail.then(run, run)
  q.tail = result.catch(() => {})
  return result
}

/**
 * POST 到企微实例本地 API（带发送类接口排队）
 * @param {number|string} port
 * @param {object} requestData 含 type 及业务字段
 * @param {{ timeout?: number }} [options]
 */
async function postToVWorkApi(port, requestData, options = {}) {
  const type = requestData?.type
  const url = `http://127.0.0.1:${port}/api`
  const timeout = options.timeout ?? 30000

  return enqueuePortTask(port, type, () =>
    axios.post(url, requestData, { timeout }).then((res) => res.data)
  )
}

module.exports = {
  postToVWorkApi,
  enqueuePortTask,
  needsQueue,
  MESSAGE_SEND_TYPES,
  HEAVY_MESSAGE_TYPES
}
