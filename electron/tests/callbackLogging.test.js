const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { createInstanceCallbacks } = require('../services/instanceCallbacks')
const { encodeCallback, createCallbackForwarder } = require('../services/callbackForwarder')
const { decodeCallback } = require('../../scripts/callback_server')

const settings = { enabled: true, url: '', timeout_ms: 500, retries: 1, Message_Encryption: false, RSA_PublicKey: '' }
const message = { type: 100, msg_type: 2, content: '130', msg_id: '1007335', is_self_msg: 1,
  self_user_id: 'account-a', user_id: 'peer', time_stamp: 1794280647000 }

async function waitFor(check) {
  const deadline = Date.now() + 3000
  while (!check()) {
    if (Date.now() > deadline) throw Error('等待回调超时')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

async function receiver(t, handle) {
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => handle(JSON.parse(raw), res))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  return `http://127.0.0.1:${server.address().port}/msg`
}

async function deliver(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).errno, 0)
}

test('HTTP 回调进入本地日志并原样转发，更新外部地址与关闭推送都不切断日志', async t => {
  const a = [], b = [], local = [], configs = []
  const urlA = await receiver(t, (data, res) => { a.push(data); res.end('{}') })
  const urlB = await receiver(t, (data, res) => { b.push(data); res.end('{}') })
  const service = createInstanceCallbacks({ onMessage: (port, data) => local.push(data),
    post: async (port, body) => { configs.push(body); return { errno: 0 } } })
  t.after(() => service.close())
  await service.update(5065, { ...settings, url: urlA }, 'account-a')
  const internal = service.get(5065).callbackUrl
  await deliver(internal, message)
  await waitFor(() => a.length === 1)
  assert.deepEqual(local[0], message)
  assert.deepEqual(a[0], message)
  await service.update(5065, { ...settings, url: urlB }, 'account-a')
  const incoming = { ...message, is_self_msg: 0, msg_id: 'next', content: '收到消息' }
  await deliver(internal, incoming)
  await waitFor(() => b.length === 1)
  assert.deepEqual(local[1], incoming)
  assert.deepEqual(b[0], incoming)
  await service.update(5065, { ...settings, enabled: false, url: urlB }, 'account-a')
  await deliver(internal, message)
  assert.equal(local.length, 3)
  assert.equal(a.length, 1)
  assert.equal(b.length, 1)
  assert.ok(configs.every(c => c.url === internal && c.enabled && !c.Message_Encryption))
})

test('外部失败按配置重试并提示，本地消息立即可见', async t => {
  let calls = 0
  const local = []
  const url = await receiver(t, (data, res) => { calls++; res.writeHead(503); res.end('{}') })
  const service = createInstanceCallbacks({ onMessage: (port, data) => local.push(data), post: async () => ({ errno: 0 }) })
  t.after(() => service.close())
  await service.update(5065, { ...settings, url }, 'account-a')
  await deliver(service.get(5065).callbackUrl, message)
  assert.deepEqual(local[0], message)
  await waitFor(() => local.some(data => data.sys))
  assert.equal(calls, 2)
  assert.match(local.at(-1).content, /外部回调失败/)
})

test('加密外部回调与示例解密器兼容，本地仍接收明文，中文跨分段完整', async t => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 })
  const key = publicKey.export({ type: 'pkcs1', format: 'der' }).toString('base64')
  const long = { ...message, content: '中文测试🙂'.repeat(60) }
  const external = [], local = []
  const url = await receiver(t, (data, res) => { external.push(data); res.end('{}') })
  const service = createInstanceCallbacks({ onMessage: (port, data) => local.push(data), post: async () => ({ errno: 0 }) })
  t.after(() => service.close())
  await service.update(5065, { ...settings, url, Message_Encryption: true, RSA_PublicKey: key }, 'account-a')
  await deliver(service.get(5065).callbackUrl, long)
  await waitFor(() => external.length === 1)
  assert.equal(external[0].encrypted, true)
  assert.ok(external[0].data.length > 1)
  assert.ok(external[0].data.every(block => Buffer.from(block, 'base64').length === 128))
  let supportsPkcs1 = true
  try { crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(external[0].data[0], 'base64')) }
  catch { supportsPkcs1 = false }
  await t.test('示例接收器解密后与原始消息一致', { skip: supportsPkcs1 ? false : '当前 Node/OpenSSL 不支持 PKCS#1 私钥解密；使用 Node 24 验证' }, () => {
    assert.deepEqual(decodeCallback(external[0], privateKey), long)
  })
  assert.deepEqual(local[0], long)
  assert.equal(service.get(5065).settings.Message_Encryption, true)
  assert.throws(() => encodeCallback(long, { ...settings, Message_Encryption: true, RSA_PublicKey: 'bad' }))
})

test('禁止指向内部回调端口，避免循环推送', async t => {
  const service = createInstanceCallbacks({ post: async () => ({ errno: 0 }) })
  t.after(() => service.close())
  const url = await service.prepare(5065)
  await assert.rejects(service.update(5065, { ...settings, url }, 'account-a'), /内部/)
  await assert.rejects(service.update(5065, { ...settings, url: 'http://localhost:9999/message' }, 'account-a'), /内部/)
})

test('恢复未接管的旧实例只创建一个接收器，账号切回后恢复各自配置', async t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'callback-switch-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'callbackSetting.json')
  const a = { ...settings, url: 'http://127.0.0.1:8002/msg' }
  const b = { ...settings, url: 'http://127.0.0.1:8003/msg' }
  fs.writeFileSync(file, JSON.stringify({ version: 1, accounts: { a: { settings: a }, b: { settings: b } } }))
  let calls = 0
  const service = createInstanceCallbacks({ getSettingsFile: () => file, post: async () => { calls++; return { errno: 0 } } })
  t.after(() => service.close())
  await Promise.all([service.applySaved(5065, 'a'), service.applySaved(5065, 'a')])
  assert.equal(calls, 1)
  const internal = service.get(5065).callbackUrl
  await service.applySaved(5065, 'b')
  assert.deepEqual(service.get(5065).settings, b)
  await service.applySaved(5065, 'a')
  assert.deepEqual(service.get(5065).settings, a)
  assert.equal(service.get(5065).callbackUrl, internal)
})

test('关闭服务终止外部请求且不继续重试', async () => {
  let calls = 0, signal
  const forwarder = createCallbackForwarder({ send: async (url, body, options) => {
    calls++; signal = options.signal
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }))
  } })
  forwarder.enqueue(message, settings)
  forwarder.enqueue(message, settings)
  forwarder.close()
  await new Promise(setImmediate)
  assert.equal(signal.aborted, true)
  assert.equal(calls, 1)
})

test('截图明文显示类型和正文，前后端兼容秒/毫秒，密文明确提示且不泄漏密文', async () => {
  const parser = await import('data:text/javascript;base64,' + fs.readFileSync(require.resolve('../../src/utils/msgParser.js')).toString('base64'))
  const backend = require('../commons/msgParser.cjs')
  const { presentRunLog } = await import('../../src/utils/runLogPresentation.mjs')
  const display = data => presentRunLog({ type: parser.formatMessageTypeLabel(data), content: parser.formatMessageContent(data) })
  assert.equal(display(message).type, '发送-文本消息')
  assert.equal(display(message).message, '130')
  assert.equal(display({ ...message, is_self_msg: 0 }).type, '接收-文本消息')
  for (const p of [parser, backend]) {
    for (const time of [1794280647000, 1794280647, '1794280647000']) assert.equal(p.getLogTimestamp(time), 1794280647000)
    for (const time of [undefined, 0, -1, 'bad', Infinity, 1e25]) assert.equal(p.getLogTimestamp(time, 1234), 1234)
  }
  const encrypted = display({ encrypted: true, data: ['SECRET'] })
  assert.equal(encrypted.type, '加密消息')
  assert.match(encrypted.message, /更新当前企微/)
  assert.doesNotMatch(encrypted.message, /无文本内容|SECRET/)
})
