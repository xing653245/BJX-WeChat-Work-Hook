const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { singleFlight } = require('../commons/singleFlight.cjs')
const source = fs.readFileSync(path.resolve(__dirname, '../../src/pages/VWorkManagerPage.vue'), 'utf8')

test('随机及指定端口注入期间保持 loading，重复请求只执行一次，成功失败后均释放', async () => {
  for (const mode of ['random', 'custom']) {
    for (const outcome of ['success', 'failure', 'throw']) {
      let finish, calls = 0
      const pending = new Promise((resolve, reject) => { finish = () => outcome === 'throw' ? reject(Error('failed')) : resolve({ success: outcome === 'success' }) })
      const addingWechat = { value: false }
      const context = vm.createContext({
        singleFlight, addingWechat,
        discoverRunningWecom: async () => ({ success: true, unmanagedPids: [], recovered: 0 }),
        window: { electronAPI: { findAvailablePort: async () => ({ port: 6272 }), runInjectTool: () => { calls++; return pending } } },
        checkPort: async () => false, feedback: { error() {}, warning() {} }, ElMessage: { success() {} },
        stoppedPorts: new Set(), trackPendingPort() {}, ensureTableRowForPort: () => 0, checkLoginStatus() {}
      })
      vm.runInContext(source.slice(source.indexOf('const executeAddWechat ='), source.indexOf('const handleAddWechat =')) + '\nthis.add = executeAddWechat', context)
      const first = context.add(mode, '6272')
      await new Promise(setImmediate)
      assert.equal(addingWechat.value, true)
      assert.equal(context.add(mode, '6273'), first)
      assert.equal(calls, 1)
      finish()
      await first
      assert.equal(addingWechat.value, false)
    }
  }
})
