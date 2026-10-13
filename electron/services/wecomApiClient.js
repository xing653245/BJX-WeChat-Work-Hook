/** 框架自身的企微 HTTP 调用，按实例串行，避免内部操作互相干扰。 */
const axios = require('axios')
const { validateFrameworkRequest } = require('../configs/frameworkWecomApi')
const { heavyApiDeferMs } = require('./wecomStability')
const portQueues = new Map()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// 授权、回调配置与固定 Hook 调用共用队列；前一次失败不阻断后续任务。
function enqueuePortTask(port, taskFn) {
  const key = String(Number(port))
  const previous = portQueues.get(key) || Promise.resolve()
  const result = previous.then(taskFn, taskFn)
  const tail = result.catch(() => {})
  portQueues.set(key, tail)
  void tail.then(() => { if (portQueues.get(key) === tail) portQueues.delete(key) })
  return result
}

async function postToVWorkApi(port, input, options = {}) {
  if (!/^\d+$/.test(String(port)) || Number(port) <= 1024 || Number(port) > 65535) {
    throw Object.assign(new Error('企微端口必须为 1025–65535 的整数'), { code: 'INVALID_API_PARAMS' })
  }
  const checked = validateFrameworkRequest(input)
  if (!checked.valid) throw Object.assign(new Error(checked.message), { code: 'INVALID_API_PARAMS' })
  const requestData = checked.params
  return enqueuePortTask(port, async () => {
    const wait = heavyApiDeferMs(port, requestData.type)
    if (wait > 0) await sleep(wait)
    const response = await axios.post(`http://127.0.0.1:${Number(port)}/api`, requestData, {
      timeout: options.timeout ?? 30000, proxy: false, maxRedirects: 0, family: 4
    })
    return response.data
  })
}

module.exports = { postToVWorkApi, enqueuePortTask }
