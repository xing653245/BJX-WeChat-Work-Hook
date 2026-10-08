const test = require('node:test')
const assert = require('node:assert/strict')
const { candidates, createWecomDiscovery } = require('../services/wecomDiscovery')

const input = {
  processes: [{ ProcessId: 10, ParentProcessId: 1 }, { ProcessId: 11, ParentProcessId: 10 }, { ProcessId: 20, ParentProcessId: 1 }],
  netstat: `TCP 127.0.0.1:6272 0.0.0.0:0 LISTENING 11
TCP [::]:6272 [::]:0 LISTENING 11
TCP 127.0.0.1:6273 0.0.0.0:0 LISTENING 20
TCP 127.0.0.1:9999 0.0.0.0:0 LISTENING 999
TCP 127.0.0.1:7777 127.0.0.1:6272 ESTABLISHED 10
TCP 192.168.1.1:7778 0.0.0.0:0 LISTENING 10`
}

test('按企微进程树发现监听端口，排除其他应用、外部地址及连接对端', () => {
  assert.deepEqual(candidates(input), {
    ports: [{ port: 6272, pid: 11, rootPid: 10 }, { port: 6273, pid: 20, rootPid: 20 }], roots: [10, 20]
  })
})

test('无配置也能发现已启动企微；未注入进程单独返回，子进程不重复报告', async () => {
  const checked = []
  const scan = createWecomDiscovery({ readSnapshot: async () => input, probePort: async port => {
    checked.push(port)
    if (port === 6272) return { loggedIn: true }
    throw Error('unavailable')
  } })
  assert.deepEqual(await scan(), { instances: [{ port: 6272, pid: 11, rootPid: 10, loggedIn: true }], unmanagedPids: [20] })
  assert.deepEqual(checked.sort(), [6272, 6273])
})

test('并发检测只扫描一次，错误不当作没有企微，失败后可重试', async () => {
  let calls = 0
  const scan = createWecomDiscovery({ readSnapshot: async () => {
    if (++calls === 1) throw Error('access denied')
    return { processes: [], netstat: '' }
  } })
  const first = scan()
  assert.equal(scan(), first)
  await assert.rejects(first, /access denied/)
  assert.deepEqual(await scan(), { instances: [], unmanagedPids: [] })
  assert.equal(calls, 2)
})

test('接口未登录仍可接入，普通 HTTP 响应不会创建实例', async () => {
  const scan = createWecomDiscovery({ readSnapshot: async () => input,
    probePort: async port => port === 6272 ? { loggedIn: false } : null })
  assert.equal((await scan()).instances[0].loggedIn, false)
  assert.deepEqual((await scan()).unmanagedPids, [20])
})

test('添加前发现现有企微时接入或提示，不再执行启动工具', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/pages/VWorkManagerPage.vue'), 'utf8')
  let started = 0, result
  const context = vm.createContext({
    singleFlight: require('../commons/singleFlight.cjs').singleFlight,
    discoverRunningWecom: async () => result,
    discoveryNotice: { value: '请先退出已运行企微' },
    feedback: { warning() {} }, ElMessage: { success() {} },
    window: { electronAPI: { findAvailablePort() { started++; throw Error('不应启动新实例') } } }
  })
  vm.runInContext(source.slice(source.indexOf('const executeAddWechat ='), source.indexOf('const handleAddWechat =')) + '\nthis.add = executeAddWechat', context)
  for (const state of [
    { success: true, unmanagedPids: [20], recovered: 0 },
    { success: true, unmanagedPids: [], recovered: 1 },
    { success: false, unmanagedPids: [], recovered: 0 }
  ]) { result = state; await context.add('random') }
  assert.equal(started, 0)
})

test('发现已登录实例恢复账号，未登录实例恢复轮询，重复检测不重复建行', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/pages/VWorkManagerPage.vue'), 'utf8')
  const rows = [], completed = [], polling = new Set()
  const context = vm.createContext({
    singleFlight: require('../commons/singleFlight.cjs').singleFlight,
    discovering: { value: false }, discoveryNotice: { value: '' }, disposed: false,
    unmanagedPids: { value: [] },
    window: { electronAPI: { discoverRunningWecom: async () => ({ success: true, unmanagedPids: [],
      instances: [{ port: 6272, pid: 11, loggedIn: true }, { port: 6273, pid: 20, loggedIn: false }] }) } },
    tableData: { value: rows }, stoppedPorts: new Set(), trackPendingPort() {},
    ensureTableRowForPort(port, defaults) {
      let index = rows.findIndex(row => row.port === port)
      if (index < 0) { rows.push({ port, ...defaults }); index = rows.length - 1 }
      return index
    },
    completePortLogin: async port => { completed.push(port); rows.find(row => row.port === port).user_id = 'demo'; return true },
    checkLoginStatus: port => polling.add(port), diagnostics: { warn() {} }
  })
  vm.runInContext(source.slice(source.indexOf('const discoverRunningWecom ='), source.indexOf('/** 已登录但表格缺失时恢复')) + '\nthis.scan = discoverRunningWecom', context)
  await context.scan()
  await context.scan()
  assert.equal(rows.length, 2)
  assert.deepEqual(completed, [6272])
  assert.deepEqual([...polling], [6273])
})
