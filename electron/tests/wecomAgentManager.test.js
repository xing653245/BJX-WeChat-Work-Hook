const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const {
  AGENT_HTTP_PORT,
  createWecomAgentManager
} = require('../services/wecomAgentManager')

test('框架复用已运行的 Agent 并自动配置本机回调', async () => {
  const calls = []
  let spawnCount = 0
  const manager = createWecomAgentManager({
    executablePath: 'C:\\app\\bin\\agent\\WeComHttpAgentStable.exe',
    fileExists: () => true,
    spawnProcess: () => {
      spawnCount++
      throw new Error('不应启动第二个 Agent')
    },
    request: async (options) => {
      calls.push(options)
      if (options.path === '/health') return { status: 'ok' }
      if (options.path === '/api/v1/start') {
        return { code: 0, data: { wx_connected: true } }
      }
      return { code: 0, data: { callback_url: options.data.callback_url } }
    }
  })

  const result = await manager.ensureStarted({
    callbackUrl: 'http://127.0.0.1:8868/msg'
  })

  assert.equal(result.success, true)
  assert.equal(result.port, AGENT_HTTP_PORT)
  assert.equal(spawnCount, 0)
  assert.deepEqual(calls, [
    { method: 'GET', path: '/health', timeout: 1500 },
    {
      method: 'PUT',
      path: '/api/v1/config/callback',
      data: { callback_url: 'http://127.0.0.1:8868/msg' }
    },
    { method: 'POST', path: '/api/v1/start', data: {} }
  ])
})

test('Agent 未运行时由框架隐藏启动并等待健康检查', async () => {
  let healthChecks = 0
  const spawnCalls = []
  const child = new EventEmitter()
  child.pid = 1234
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => true

  const manager = createWecomAgentManager({
    executablePath: 'C:\\app\\bin\\agent\\WeComHttpAgentStable.exe',
    fileExists: () => true,
    delay: async () => {},
    spawnProcess: (...args) => {
      spawnCalls.push(args)
      return child
    },
    request: async (options) => {
      if (options.path === '/health') {
        healthChecks++
        if (healthChecks === 1) throw new Error('ECONNREFUSED')
        return { status: 'ok' }
      }
      if (options.path === '/api/v1/start') {
        return { code: 0, data: { wx_connected: false } }
      }
      return { code: 0, data: {} }
    }
  })

  const result = await manager.ensureStarted({ callbackUrl: 'http://127.0.0.1:8868/msg' })

  assert.equal(result.success, true)
  assert.equal(result.pid, 1234)
  assert.equal(result.connected, false)
  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0][0], 'C:\\app\\bin\\agent\\WeComHttpAgentStable.exe')
  assert.equal(spawnCalls[0][2].windowsHide, true)
})

test('Agent 进程已就绪但企微尚未登录时仍允许页面进入登录等待', async () => {
  const manager = createWecomAgentManager({
    executablePath: 'C:\\app\\bin\\agent\\WeComHttpAgentStable.exe',
    fileExists: () => true,
    spawnProcess: () => {
      throw new Error('不应重复启动')
    },
    onLog: () => {},
    request: async (options) => {
      if (options.path === '/health') return { status: 'ok' }
      if (options.path === '/api/v1/start') {
        const error = new Error('企业微信连接失败')
        error.response = { data: { message: '企业微信连接失败' } }
        throw error
      }
      return { code: 0, data: {} }
    }
  })

  const result = await manager.ensureStarted({ callbackUrl: 'http://127.0.0.1:8868/msg' })

  assert.equal(result.success, true)
  assert.equal(result.connected, false)
  assert.equal(result.output, '企业微信连接失败')
})
