const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const http = require('node:http')
const { once } = require('node:events')
const { createRequire } = require('node:module')
const axios = require('axios')
const { FRAMEWORK_API_NAMES, validateFrameworkRequest } = require('../configs/frameworkWecomApi')
const { postToVWorkApi, enqueuePortTask } = require('../services/wecomApiClient')

test('内部仅保留五个固定操作，拒绝其他 type 且不发送多余字段', () => {
  assert.deepEqual(Object.keys(FRAMEWORK_API_NAMES).map(Number), [1000, 1002, 1003, 3000, 7000])
  for (const type of [1000, 1002, 1003]) {
    assert.deepEqual(validateFrameworkRequest({ type, port: 8002, url: '/other', extra: true }).params, { type })
  }
  for (const input of [null, [], {}, { type: '1000' }, { type: false }, { type: 1001 }, { type: 3001 }, { type: 4009 }, { type: 9006 }, { type: 7000, state: 1 }, { type: 3000, user_id: '123' }]) {
    assert.equal(validateFrameworkRequest(input).valid, false)
  }
  assert.deepEqual(validateFrameworkRequest({ type: 7000, state: false }).params, { type: 7000, state: 0 })
  assert.deepEqual(validateFrameworkRequest({ type: 3000, user_id: ' 123 ', msg: 'hello', path: 'ignored' }).params, { type: 3000, user_id: '123', msg: 'hello' })
})

test('内部调用直连指定企微端口，未保留接口不会触达企微，也不跟随重定向', async t => {
  const received = []
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    received.push({ path: req.url, body })
    if (body.type === 1003) { res.writeHead(302, { Location: '/redirect' }); res.end(); return }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ errno: 0, data: body }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const port = server.address().port
  const result = await postToVWorkApi(port, { type: 1002, port: 9999 })
  assert.deepEqual(result, { errno: 0, data: { type: 1002 } })
  assert.deepEqual(received, [{ path: '/api', body: { type: 1002 } }])
  await assert.rejects(postToVWorkApi(port, { type: 3001 }), { code: 'INVALID_API_PARAMS' })
  assert.equal(received.length, 1)
  await assert.rejects(postToVWorkApi(port, { type: 1003 }))
  assert.equal(received.length, 2)
  // 用户可以直接请求同一企微端口上的其他接口，框架不参与。
  await axios.post(`http://127.0.0.1:${port}/api`, { type: 3001 }, { proxy: false })
  assert.equal(received.at(-1).body.type, 3001)
})

test('按端口串行，前一次失败不影响后续，其他端口独立执行', async () => {
  const events = []
  let release
  const first = enqueuePortTask(8989, () => new Promise(resolve => { events.push('first'); release = resolve }))
  const second = enqueuePortTask(8989, () => { events.push('second'); throw Error('temporary') })
  const failed = assert.rejects(second, /temporary/)
  const third = enqueuePortTask(8989, () => events.push('third'))
  await enqueuePortTask(8990, () => events.push('other'))
  assert.deepEqual(events, ['first', 'other'])
  release()
  await Promise.all([first, failed, third])
  assert.deepEqual(events, ['first', 'other', 'second', 'third'])
})

test('界面调用只传企微实例端口及固定操作，关闭自动更新不再读取框架地址', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/utils/api.js'), 'utf8')
    .replace(/^import .*$/gm, '').replace('export class VWorkApi', 'class VWorkApi')
  const calls = []
  const context = vm.createContext({
    window: { electronAPI: { callFrameworkWecom: async input => { calls.push(JSON.parse(JSON.stringify(input))); return { success: true, data: { errno: 0 } } } } },
    createFeedback: () => ({}), AUTH_REASON: {}
  })
  vm.runInContext(source + '\nthis.api = VWorkApi', context)
  await context.api.getLoginStatus(8989, 9000)
  await context.api.getPersonalInfo(8989)
  await context.api.logout(8990)
  await context.api.disableAutoUpdate(8990)
  await context.api.sendTestText(8989, '123', 'hello')
  assert.deepEqual(calls, [
    { port: 8989, type: 1000 }, { port: 8989, type: 1002 }, { port: 8990, type: 1003 },
    { port: 8990, type: 7000, state: 0 }, { port: 8989, type: 3000, user_id: '123', msg: 'hello' }
  ])
  const page = fs.readFileSync(path.resolve(__dirname, '../../src/pages/VWorkManagerPage.vue'), 'utf8')
  const start = page.indexOf('const autoUpdateOffRequestedPorts =')
  const end = page.indexOf('// 从配置加载并合并表格', start)
  context.VWorkApi = context.api
  context.isWecomHookBodyOk = body => body.errno === 0
  context.diagnostics = { info() {}, warn() {} }
  vm.runInContext(page.slice(start, end) + '\nthis.disable = invokeDefaultAutoUpdateOff', context)
  await context.disable(8991)
  await context.disable(8991)
  assert.equal(calls.length, 6)
  assert.deepEqual(calls.at(-1), { port: 8991, type: 7000, state: 0 })
})

test('框架 HTTP 服务器不再提供任何 /api 转发，消息接收仍保留', async t => {
  const filename = path.resolve(__dirname, '../express_server.js')
  const localRequire = createRequire(filename)
  const module = { exports: {} }
  const messages = []
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, process, console,
    require(name) {
      if (name === './commons/common') return { readIni: () => ({ login_info: [], open_log: true }), checkAuthByUserId: () => ({ valid: true }) }
      if (name === 'axios') return { post: async (...args) => messages.push(args) }
      return localRequire(name)
    }
  }, { filename })
  const { app } = module.exports
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const client = axios.create({ baseURL: `http://127.0.0.1:${server.address().port}`, proxy: false, validateStatus: () => true })
  for (const endpoint of ['/api', '/api/call', '/api/message/image-cdn', '/api/settings/auto-update', '/updatesettings', '/polarBear/card/bind']) {
    assert.equal((await client.post(endpoint, { port: 8989, type: 1000 })).status, 404, endpoint)
  }
  assert.deepEqual((await client.get('/')).data.endpoints, { message: 'POST /msg - 接收企微消息推送' })
  assert.equal((await client.post('/msg', { type: 1001, content: 'test' })).data.message, 'success')
  assert.equal(messages.length, 1)
})

test('固定 IPC 拒绝框架端口、旧通用 URL 参数及其他窗口', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8')
  const start = source.indexOf("ipcMain.handle('call-framework-wecom'")
  const end = source.indexOf('// 检查端口是否在使用', start)
  let handler
  const calls = []
  const mainWindow = { isDestroyed: () => false, webContents: {} }
  vm.runInNewContext(source.slice(start, end), {
    ipcMain: { handle: (_name, fn) => { handler = fn } }, mainWindow,
    assertMainWindow: require('../commons/ipcSecurity').assertMainWindow,
    readConfig: () => ({ sys: { server_port: 8002 } }), DEFAULT_SERVER_PORT: 8002,
    collectHookCompatListenPorts: () => [8003],
    callFrameworkWecomApi: async (...args) => { calls.push(args); return { errno: 0 } },
    readIni: () => ({ login_info: [], open_log: false }), validAuthDatetime: () => false,
    FRAMEWORK_API_NAMES, diagnostics: { error() {} }
  })
  const event = { sender: mainWindow.webContents }
  for (const input of [null, [], { port: 8002, type: 1000 }, { port: 8003, type: 1000 }, { port: 65536, type: 1000 }, { url: 'http://127.0.0.1:8989/api', data: { type: 1000 } }]) {
    assert.equal((await handler(event, input)).success, false)
  }
  assert.equal(calls.length, 0)
  await assert.rejects(handler({ sender: {} }, { port: 8989, type: 1000 }), { code: 'IPC_FORBIDDEN' })
  assert.equal((await handler(event, { port: 8989, type: 1000 })).success, true)
  assert.equal(calls[0][0], 8989)
  assert.doesNotMatch(source, /ipcMain\.handle\('call-api'/)
  assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, '../preload.js'), 'utf8'), /callAPI:|invoke\('call-api'/)
})
