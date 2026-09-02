const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { pollCrashDialogOnce } = require('../services/wecomCrashDialog')
const { createWecomRecovery } = require('../services/wecomRecovery')

test('只有明确检测到企微崩溃弹窗才触发恢复', async () => {
  let recoveryCount = 0
  const noCrash = await pollCrashDialogOnce({
    closeDialogs: async () => 0,
    onCrash: () => { recoveryCount++ }
  })
  const crashed = await pollCrashDialogOnce({
    closeDialogs: async () => 1,
    onCrash: () => { recoveryCount++ }
  })

  assert.equal(noCrash, 0)
  assert.equal(crashed, 1)
  assert.equal(recoveryCount, 1)
})

test('企微闪退恢复会启动原企微程序并让 Agent 重新连接', async () => {
  const spawned = []
  const agentCalls = []
  const child = new EventEmitter()
  child.unref = () => { child.unrefCalled = true }

  const recovery = createWecomRecovery({
    readConfig: () => ({ sys: { wecom_exe_path_v5: 'C:\\WXWork\\WXWork.exe' } }),
    resolveWecomExePath: () => ({ path: 'C:\\WXWork\\WXWork.exe', source: 'config' }),
    spawnProcess: (...args) => {
      spawned.push(args)
      return child
    },
    delay: async () => {},
    agentManager: {
      ensureStarted: async (options) => {
        agentCalls.push(options)
        return { success: true, connected: true }
      }
    }
  })

  const result = await recovery.recover({ callbackUrl: 'http://127.0.0.1:8868/msg' })

  assert.equal(result.success, true)
  assert.equal(spawned.length, 1)
  assert.equal(spawned[0][0], 'C:\\WXWork\\WXWork.exe')
  assert.equal(spawned[0][2].windowsHide, true)
  assert.equal(spawned[0][2].detached, true)
  assert.equal(child.unrefCalled, true)
  assert.deepEqual(agentCalls, [{ callbackUrl: 'http://127.0.0.1:8868/msg' }])
})

test('找不到企微程序时不会盲目启动', async () => {
  let spawnCount = 0
  const recovery = createWecomRecovery({
    readConfig: () => ({ sys: {} }),
    resolveWecomExePath: () => ({ path: '', error: '未找到企微客户端路径' }),
    spawnProcess: () => { spawnCount++ },
    agentManager: { ensureStarted: async () => ({ success: true }) }
  })

  const result = await recovery.recover()

  assert.equal(result.success, false)
  assert.match(result.message, /未找到企微客户端路径/)
  assert.equal(spawnCount, 0)
})

test('企微进程异步启动失败不会导致框架闪退', async () => {
  const child = new EventEmitter()
  child.unref = () => {}
  let agentCallCount = 0
  const recovery = createWecomRecovery({
    readConfig: () => ({ sys: {} }),
    resolveWecomExePath: () => ({ path: 'C:\\WXWork\\WXWork.exe' }),
    spawnProcess: () => child,
    delay: async () => { child.emit('error', new Error('access denied')) },
    agentManager: {
      ensureStarted: async () => {
        agentCallCount++
        return { success: true }
      }
    }
  })

  const result = await recovery.recover()

  assert.equal(result.success, false)
  assert.match(result.message, /access denied/)
  assert.equal(agentCallCount, 0)
})
