const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { once } = require('node:events')
const { getPolarBearBaseUrl } = require('../configs/polarBearBackend')
const { getAuthInfo, bindCard, unbindCard, convertCardByWxid } = require('../commons/polarBearClient.cjs')
const { postToWecomPath } = require('../services/wecomApiClient')

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
  assert.equal(result.msg, '卡密无效')
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
  await assert.rejects(postToWecomPath(redirect.port, '/updatesettings', { Update: true }))
  assert.equal(destination.calls.length, 0)
})

test('保存设置的通知向各企微端口 POST /updatesettings，Update 为布尔 true', async t => {
  const first = await hookServer(t)
  const second = await hookServer(t)
  const mainSource = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8')
  const start = mainSource.indexOf('async function notifyWecomSettingsUpdated(ports)')
  const end = mainSource.indexOf("ipcMain.handle('read-inject-settings'", start)
  assert.ok(start >= 0 && end > start)
  const context = { postToWecomPath }
  vm.createContext(context)
  vm.runInContext(mainSource.slice(start, end), context)
  assert.equal((await context.notifyWecomSettingsUpdated([first.port, second.port])).ok, true)
  for (const instance of [first, second]) {
    assert.equal(instance.calls.length, 1)
    assert.equal(instance.calls[0].method, 'POST')
    assert.equal(instance.calls[0].url, '/updatesettings')
    assert.deepEqual(instance.calls[0].body, { Update: true })
  }
  await assert.rejects(postToWecomPath('bad', '/updatesettings', { Update: true }), /企微端口/)
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
