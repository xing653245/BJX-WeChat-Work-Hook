const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { singleFlight } = require('../commons/singleFlight.cjs')

test('前端辅助函数提供原生 ESM 导出，合并请求且失败后可重试', async () => {
  const { singleFlight: browserSingleFlight } = await import('../../src/utils/singleFlight.mjs')
  let attempts = 0
  const run = browserSingleFlight(async () => {
    if (++attempts === 1) throw new Error('temporary')
    return 'ok'
  })
  const first = run()
  assert.equal(run(), first)
  await assert.rejects(first, /temporary/)
  assert.equal(await run(), 'ok')
  assert.equal(attempts, 2)
})

test('慢任务重复触发时只执行一次，失败后仍可重试', async () => {
  let resolve, calls = 0
  const task = singleFlight(() => { calls++; return new Promise(r => { resolve = r }) })
  const first = task()
  assert.equal(task(), first)
  await Promise.resolve()
  assert.equal(calls, 1)
  resolve('ok')
  assert.equal(await first, 'ok')
  const next = task()
  await Promise.resolve()
  assert.equal(calls, 2)
  resolve('next')
  await next
  let attempts = 0
  const failing = singleFlight(() => { if (++attempts === 1) throw Error('temporary'); return 42 })
  await assert.rejects(failing(), /temporary/)
  assert.equal(await failing(), 42)
})

test('登录轮询慢响应不叠加请求，停止后的旧响应不再恢复账号', async () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../src/pages/VWorkManagerPage.vue'), 'utf8')
  const start = page.indexOf('const checkLoginStatus =')
  const end = page.indexOf('// 由 HTTP 接口', start)
  let tick, resolve, requests = 0, completions = 0
  const stoppedPorts = new Set()
  const timers = new Map()
  const context = {
    singleFlight, disposed: false, stoppedPorts, loginPollingPorts: new Set(), loginPollTimers: timers,
    setInterval: fn => { tick = fn; return 1 }, clearInterval() {},
    VWorkApi: { getLoginStatus: () => { requests++; return new Promise(r => { resolve = r }) } },
    completePortLogin: async () => { completions++; return true },
    console, ElMessage: { warning() {} }
  }
  vm.createContext(context)
  vm.runInContext(page.slice(start, end) + '\nthis.start = checkLoginStatus', context)
  await context.start(6272, 0)
  const first = tick()
  assert.equal(tick(), first)
  await Promise.resolve()
  assert.equal(requests, 1)
  stoppedPorts.add(6272)
  resolve({ data: { status: 1 } })
  await first
  assert.equal(completions, 0)
})
