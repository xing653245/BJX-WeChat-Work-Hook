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

function createLoginHarness(fetchPersonalInfo) {
  const page = fs.readFileSync(path.resolve(__dirname, '../../src/pages/VWorkManagerPage.vue'), 'utf8')
  const personalInfo = fs.readFileSync(path.resolve(__dirname, '../../src/utils/personalInfo.js'), 'utf8')
    .replace('export function', 'function')
  const complete = page.slice(page.indexOf('const completePortLogin ='), page.indexOf('/** 供 App.vue'))
  const polling = page.slice(page.indexOf('const checkLoginStatus ='), page.indexOf('// 由 HTTP 接口'))
  const rows = { value: [{ port: '6272', nick_name: '登录中', user_id: '-', pid: '123' }] }
  const timers = new Map(), pollingPorts = new Set(), stoppedPorts = new Set()
  const warnings = [], saved = [], pendingRemoved = [], callbacks = []
  let tick, now = 0, cleared = 0, personalCalls = 0
  const context = vm.createContext({
    singleFlight, disposed: false, stoppedPorts, tableData: rows,
    loginPollTimers: timers, loginPollingPorts: pollingPorts, autoUpdateTimers: new Map(),
    Date: { now: () => now }, setInterval: fn => { tick = fn; return 1 },
    clearInterval: () => { cleared++ }, clearTimeout() {}, setTimeout: () => 2,
    VWorkApi: {
      getLoginStatus: async () => ({ data: { status: 1 } }),
      getPersonalInfo: async () => fetchPersonalInfo(++personalCalls)
    },
    ensureTableRowForPort: port => rows.value.findIndex(row => row.port === String(port)),
    updateTableItem: (index, data) => Object.assign(rows.value[index], data),
    getPidByPort: async () => 123, isWecomProcessAlive: async () => true,
    refreshAuthForRow: async (_index, _userId, data) => saved.push(data),
    untrackPendingPort: port => pendingRemoved.push(port), invokeDefaultAutoUpdateOff() {},
    window: { electronAPI: { markWecomPortLoggedIn: async port => { callbacks.push(port); return {} } } },
    ElMessage: { warning: message => warnings.push({ message }) },
    feedback: { warning: (code, message) => warnings.push({ code, message }) },
    diagnostics: { warn() {} }
  })
  vm.runInContext(personalInfo + '\n' + complete + '\n' + polling + '\nthis.start = checkLoginStatus', context)
  return {
    context, rows, timers, pollingPorts, stoppedPorts, warnings, saved, pendingRemoved, callbacks,
    tick: () => tick(), setTime: value => { now = value },
    get personalCalls() { return personalCalls }, get cleared() { return cleared }
  }
}

test('已登录但账号信息暂缺或请求失败时继续重试，获取账号后才停止轮询', async () => {
  for (const first of [
    { errno: 0, data: {} },
    { errno: 0, data: { nick_name: '尚未提供 ID' } },
    new Error('1002 temporarily unavailable')
  ]) {
    const harness = createLoginHarness(attempt => {
      if (attempt === 1) { if (first instanceof Error) throw first; return first }
      return { errno: 0, data: { user_id: 'account-1', nick_name: '测试账号' } }
    })
    await harness.context.start(6272, 0)
    await harness.tick()
    assert.equal(harness.timers.has(6272), true)
    assert.equal(harness.pollingPorts.has(6272), true)
    assert.equal(harness.cleared, 0)
    assert.equal(harness.rows.value[0].nick_name, '同步账号信息中')
    assert.equal(harness.saved.length, 0)
    assert.deepEqual(harness.warnings, [])
    await harness.tick()
    assert.equal(harness.personalCalls, 2)
    assert.equal(harness.rows.value[0].user_id, 'account-1')
    assert.equal(harness.rows.value[0].nick_name, '测试账号')
    assert.equal(harness.saved.length, 1)
    assert.equal(harness.cleared, 1)
    assert.equal(harness.timers.has(6272), false)
    assert.equal(harness.pollingPorts.has(6272), false)
    assert.deepEqual(harness.pendingRemoved, [6272])
    assert.deepEqual(harness.callbacks, [6272])
  }
})

test('账号信息请求缓慢时不重叠，退出、卸载或轮询被取消后不恢复账号', async () => {
  for (const cancel of ['exit', 'unmount', 'stop']) {
    let resolve
    const harness = createLoginHarness(() => new Promise(done => { resolve = done }))
    await harness.context.start(6272, 0)
    const first = harness.tick()
    await new Promise(done => setImmediate(done))
    assert.equal(harness.tick(), first)
    assert.equal(harness.personalCalls, 1)
    assert.equal(harness.cleared, 0)
    if (cancel === 'exit') harness.stoppedPorts.add(6272)
    if (cancel === 'unmount') harness.context.disposed = true
    if (cancel === 'stop') harness.timers.delete(6272)
    resolve({ data: { user_id: 'late-account', nick_name: '过期响应' } })
    await first
    assert.equal(harness.saved.length, 0)
    assert.deepEqual(harness.callbacks, [])
    assert.equal(harness.rows.value[0].user_id, '-')
    assert.deepEqual(harness.warnings, [])
  }
})

test('账号信息持续缺失时有界重试，超时保留实例并提示重新检测', async () => {
  const harness = createLoginHarness(() => ({ data: {} }))
  await harness.context.start(6272, 0)
  await harness.tick()
  for (const time of [180001, 240002, 300003, 360004]) {
    harness.setTime(time)
    await harness.tick()
  }
  assert.equal(harness.timers.has(6272), false)
  assert.equal(harness.rows.value.length, 1)
  assert.deepEqual(harness.pendingRemoved, [])
  assert.equal(harness.warnings.length, 1)
  assert.match(harness.warnings[0].message, /账号信息.*同步.*重新检测/)
  assert.doesNotMatch(harness.warnings[0].message, /刷新授权|重新添加/)
})
