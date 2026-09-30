const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { getProcessState } = require('../commons/processLiveness.cjs')

test('PID 存活、已退出、权限不足与无 PID 分开处理', () => {
  assert.equal(getProcessState(process.pid), 'alive')
  assert.equal(getProcessState(123, () => {}), 'alive')
  assert.equal(getProcessState(123, () => { throw { code: 'ESRCH' } }), 'exited')
  assert.equal(getProcessState(123, () => { throw { code: 'EPERM' } }), 'unknown')
  for (const pid of [undefined, '', -1, 0, 'bad']) assert.equal(getProcessState(pid), 'unknown')
})

const page = fs.readFileSync(path.resolve(__dirname, '../../src/pages/VWorkManagerPage.vue'), 'utf8')
test('Hook 和端口不可达时仍检查已记录 PID，未知状态和检测异常都保留条目', async () => {
  const start = page.indexOf('const isWecomProcessAlive =')
  const end = page.indexOf('// 启动时检查登录状态', start)
  for (const state of ['alive', 'unknown', 'exited', 'throw']) {
    const context = {
      isWecomPortReachable: async () => false,
      tableData: { value: [{ port: '6272', pid: '123' }] },
      configStore: { getLoginInfo: () => [] },
      window: { electronAPI: {
        isPortInUse: async () => ({ inUse: false }),
        findPidByPort: async () => -1,
        getProcessState: async pid => { assert.equal(pid, '123'); if (state === 'throw') throw Error('IPC'); return state }
      } }
    }
    vm.createContext(context)
    vm.runInContext(page.slice(start, end) + '\nthis.check = isWecomProcessAlive', context)
    assert.equal(await context.check(6272), state !== 'exited')
  }
})

test('自动移除不杀进程，手动退出才允许结束进程', async () => {
  const start = page.indexOf('const removeWecomFromManager =')
  const end = page.indexOf('const executeAddWechat =', start)
  let kills = 0
  const context = {
    stoppedPorts: new Set(), stopLoginPolling() {}, untrackPendingPort() {},
    findRowIndexByPort: () => 0, deleteTableRowByPort() {},
    configStore: { getLoginInfo: () => [], updateLoginInfo: async () => {} },
    window: { electronAPI: { killProcessByPort: async () => { kills++ } } },
    ElMessage: { warning() {} }, console
  }
  vm.createContext(context)
  vm.runInContext(page.slice(start, end) + '\nthis.remove = removeWecomFromManager', context)
  await context.remove(6272)
  assert.equal(kills, 0)
  await context.remove(6272, { terminate: true })
  assert.equal(kills, 1)
})

test('普通消息中的退出文字不触发清理，退出事件也先核实存活', async () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../../src/App.vue'), 'utf8')
  const start = app.indexOf('const handleLogoutMessage =')
  const end = app.indexOf('// 监听消息推送', start)
  let checks = 0
  const context = {
    resolveWecomPortFromMessage: () => 6272,
    vworkManagerRef: { value: { handleWecomOfflineSignal: async () => { checks++ } } }
  }
  vm.createContext(context)
  vm.runInContext(app.slice(start, end) + '\nthis.handle = handleLogoutMessage', context)
  await context.handle({ type: 1001, msg: '客户说：退出登录' })
  assert.equal(checks, 0)
  await context.handle({ type: 1003 })
  await context.handle({ type: 900 })
  assert.equal(checks, 2)
})
