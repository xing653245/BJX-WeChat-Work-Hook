const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { once } = require('node:events')
const { getPolarBearBaseUrl } = require('../configs/polarBearBackend')
const { getAuthInfo, bindCard, unbindCard, convertCardByWxid } = require('../commons/polarBearClient.cjs')
const { formatAuthFetchError } = require('../commons/authFetchError')
const { setDiagnosticSink, setConsoleDiagnosticsEnabled, userMessage } = require('../commons/diagnostics.cjs')

async function hookServer(t, reply) {
  const calls = []
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString()
    calls.push({ method: req.method, url: req.url, headers: req.headers, body: text ? JSON.parse(text) : null })
    res.setHeader('Content-Type', 'application/json')
    if (reply) reply(req, res)
    else res.end(JSON.stringify({ code: 0, data: { active: true, card_key: 'new-card' } }))
  })
  server.listen(0, '127.0.0.1')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  await once(server, 'listening')
  return { port: server.address().port, calls }
}

test('授权地址只使用显式企微端口，缺失或无效时禁止回退', () => {
  assert.equal(getPolarBearBaseUrl('6272'), 'http://127.0.0.1:6272')
  for (const port of [undefined, null, '', true, 0, -1, 65536, '6272/path', '1e3', 1.5, {}, []]) {
    assert.throws(() => getPolarBearBaseUrl(port), /企微端口/)
  }
})

test('四个授权接口按指定方法、路径和企微端口调用，端口不混入业务参数', async t => {
  const first = await hookServer(t)
  const second = await hookServer(t)
  const wxid = 'wxid &中文'
  const auth = await getAuthInfo(wxid, first.port)
  assert.equal(auth.data.active, true)
  assert.equal((await bindCard({ port: first.port, wxid, card_key: 'card-1' })).success, true)
  assert.equal((await unbindCard({ port: second.port, wxid, card_key: 'card-2' })).success, true)
  const converted = await convertCardByWxid({ port: second.port, wxid })
  assert.equal(converted.success, true)
  assert.equal(converted.data.card_key, 'new-card')
  assert.deepEqual(first.calls.map(({ method, url, body }) => ({ method, url, body })), [
    { method: 'GET', url: '/polarBear/getAuthInfo?wxid=' + encodeURIComponent(wxid), body: null },
    { method: 'POST', url: '/polarBear/card/bind', body: { wxid, card_key: 'card-1' } }
  ])
  assert.deepEqual(second.calls.map(({ method, url, body }) => ({ method, url, body })), [
    { method: 'POST', url: '/polarBear/card/unbind', body: { wxid, card_key: 'card-2' } },
    { method: 'POST', url: '/polarBear/card/convertBywxid', body: { wxid } }
  ])
  for (const call of [...first.calls, ...second.calls]) assert.equal(call.headers['x-sign'], undefined)
})

test('无端口或参数错误时失败；企微业务失败不会变成绑定或迁移成功', async t => {
  await assert.rejects(getAuthInfo('wxid'), /企微端口/)
  await assert.rejects(getAuthInfo('', 6272), /wxid/)
  for (const call of [bindCard, unbindCard, convertCardByWxid]) {
    const result = await call({ wxid: 'wxid', card_key: 'card' })
    assert.equal(result.success, false)
    assert.match(result.msg, /企微端口/)
  }
  const denied = await hookServer(t, (_req, res) => res.end(JSON.stringify({ success: false, msg: '卡密无效' })))
  const result = await bindCard({ port: denied.port, wxid: 'wxid', card_key: 'bad' })
  assert.equal(result.success, false)
  assert.match(result.msg, /服务端说明：卡密无效/)
  const missingKey = await hookServer(t, (_req, res) => res.end(JSON.stringify({ success: true, data: {} })))
  assert.equal((await convertCardByWxid({ port: missingKey.port, wxid: 'wxid' })).success, false)
})

test('不跟随企微接口重定向，不访问其他后端', async t => {
  const destination = await hookServer(t)
  const redirect = await hookServer(t, (_req, res) => {
    res.writeHead(302, { Location: `http://127.0.0.1:${destination.port}/backend` })
    res.end()
  })
  await assert.rejects(getAuthInfo('wxid', redirect.port))
  assert.equal((await bindCard({ port: redirect.port, wxid: 'wxid', card_key: 'card' })).success, false)
  assert.equal(destination.calls.length, 0)
})

test('授权认证失败保留请求上下文和服务端说明，界面提示不被通用 HTTP 翻译覆盖', async t => {
  const records = []
  setDiagnosticSink(record => records.push(record))
  setConsoleDiagnosticsEnabled(false)
  t.after(() => { setDiagnosticSink(null); setConsoleDiagnosticsEnabled(true) })
  const browser = await import('../../src/utils/diagnostics.mjs')
  for (const status of [401, 403]) {
    const hook = await hookServer(t, (_req, res) => {
      res.statusCode = status
      res.end(JSON.stringify({
        code: 'AUTH_DENIED', message: 'signature rejected; token=secret-token',
        card_key: 'secret-response-card', data: { card_key: 'secret-nested-card' }
      }))
    })
    let original
    await assert.rejects(getAuthInfo('private-wxid', hook.port), error => {
      original = error
      return error.response.status === status
    })
    const message = formatAuthFetchError(original)
    assert.match(message, new RegExp(`企微授权接口.*状态码 ${status}`))
    assert.match(message, /AUTH_DENIED.*服务端说明：signature rejected/)
    assert.equal(userMessage(message), message)
    assert.equal(browser.userMessage(message), message)
    assert.doesNotMatch(message, /认证配置|secret-token|授权到期|账号被封/)
    for (const call of [bindCard, unbindCard, convertCardByWxid]) {
      const result = await call({ port: hook.port, wxid: 'private-wxid', card_key: 'secret-request-card' })
      assert.equal(result.success, false)
      assert.equal(result.msg, message)
    }
    const failures = records.filter(record => record.details[0].port === hook.port)
    assert.equal(failures.length, 4)
    assert.deepEqual(failures.map(record => record.details[0].endpoint), [
      '/polarBear/getAuthInfo', '/polarBear/card/bind', '/polarBear/card/unbind', '/polarBear/card/convertBywxid'
    ])
    for (const record of failures) {
      assert.equal(record.details[0].status, status)
      assert.equal(record.details[0].serviceCode, 'AUTH_DENIED')
      assert.match(record.details[0].serviceMessage, /signature rejected/)
    }
  }
  assert.doesNotMatch(JSON.stringify(records), /private-wxid|secret-token|secret-response-card|secret-nested-card|secret-request-card/)
})

test('渲染层卡密服务传递行端口，预加载桥接传递查询端口', async () => {
  const calls = []
  const electronAPI = Object.fromEntries(['bindCard', 'unbindCard', 'convertCardByWxid'].map(name => [name, async payload => { calls.push({ name, payload }); return { success: true } }]))
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/services/authBindingService.js'), 'utf8')
    .replace(/export async function/g, 'async function').replace(/export \{[^}]+\}/g, '')
  const context = { window: { electronAPI } }
  vm.createContext(context)
  vm.runInContext(source, context)
  const payload = { wxid: 'wxid', cardKey: 'card', port: 6272 }
  await context.bindAuthorization(payload)
  await context.unbindAuthorization(payload)
  await context.convertAuthorizationByWxid(payload)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { name: 'bindCard', payload: { wxid: 'wxid', port: 6272, card_key: 'card' } },
    { name: 'unbindCard', payload: { wxid: 'wxid', port: 6272, card_key: 'card' } },
    { name: 'convertCardByWxid', payload: { wxid: 'wxid', port: 6272 } }
  ])
  let exposed
  const invocations = []
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../preload.js'), 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_name, api) => { exposed = api } }, ipcRenderer: { invoke: (...args) => invocations.push(args), on() {} } }),
    console
  })
  exposed.getAuthInfo('wxid', 6272)
  assert.deepEqual(invocations, [['get-auth-info', 'wxid', 6272]])
})

test('HTTP 200 的业务拒绝经过 IPC 仍是失败，保留授权且不误报停用', async t => {
  const records = []
  setDiagnosticSink(record => records.push(record))
  setConsoleDiagnosticsEnabled(false)
  t.after(() => { setDiagnosticSink(null); setConsoleDiagnosticsEnabled(true) })
  const authFields = await import('data:text/javascript;base64,' + Buffer.from(
    fs.readFileSync(path.resolve(__dirname, '../../src/utils/authExpire.js'), 'utf8')
  ).toString('base64'))
  const main = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8')
  const handlerSource = main.slice(main.indexOf("ipcMain.handle('get-auth-info'"), main.indexOf("ipcMain.handle('card-bind'"))
  let handler
  vm.runInNewContext(handlerSource, {
    ipcMain: { handle: (_channel, fn) => { handler = fn } }, getAuthInfo, formatAuthFetchError,
    readConfig: () => ({ sys: {} })
  })
  const previous = { expire: '2099-01-01 00:00:00', auth_active: true, card_key: 'private-saved-card' }
  for (const body of [
    { success: false, code: 'SIGNATURE_EXPIRED', msg: '请求签名已过期，请校准系统时间', data: null },
    { success: false, code: 503, msg: '授权服务维护中', data: {} },
    { success: true, code: 401, message: '认证未通过', data: { active: false } },
    { code: 0, data: { success: false, code: 403, detail: '拒绝访问', data: {} } }
  ]) {
    const hook = await hookServer(t, (_req, res) => res.end(JSON.stringify(body)))
    const result = await handler({}, 'private-wxid', hook.port)
    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'AUTH_FETCH_FAILED')
    assert.match(result.msg, /被服务端拒绝.*HTTP 状态 200/)
    assert.deepEqual(authFields.resolveAuthFieldsAfterAuthFetch(result, previous), previous)
    assert.equal(authFields.resolveAuthFieldsAfterAuthFetch(result, {}).expire, '查询失败')
    const record = records.find(record => record.details[0].port === hook.port)
    assert.equal(record.details[0].status, 200)
    assert.equal(record.details[0].failureKind, 'business')
    assert.match(record.details[0].serviceMessage, /过期|维护|认证|拒绝/)
  }
  assert.doesNotMatch(JSON.stringify(records), /private-wxid|private-saved-card/)
})

test('授权响应格式错误与无授权业务数据区分，401 的已知原因能定位', async t => {
  for (const body of [null, {}, { code: 0, data: null }, { code: 0, data: [] }]) {
    const hook = await hookServer(t, (_req, res) => res.end(JSON.stringify(body)))
    await assert.rejects(getAuthInfo('wxid', hook.port), { code: 'AUTH_RESPONSE_INVALID' })
  }
  const emptyAuth = await hookServer(t, (_req, res) => res.end(JSON.stringify({ code: 0, data: {} })))
  assert.deepEqual(await getAuthInfo('wxid', emptyAuth.port), { code: 0, data: {} })
  const reason = formatAuthFetchError({ response: { status: 401, data: {
    code: 'SIGNATURE_EXPIRED', message: '签名已过期，请校准系统时间'
  } } })
  assert.match(reason, /状态码 401.*SIGNATURE_EXPIRED.*校准系统时间/)
  assert.equal(userMessage(reason), reason)
  assert.doesNotMatch(reason, /企微已登录|卡密过期/)
  assert.match(formatAuthFetchError(Object.assign(new Error('getaddrinfo EAI_AGAIN example'), { code: 'EAI_AGAIN' })), /解析暂时失败/)
  assert.doesNotMatch(formatAuthFetchError({ response: { status: 404 } }), /当前注入没有提供/)
})
