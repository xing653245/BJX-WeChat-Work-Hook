const test = require('node:test')
const assert = require('node:assert/strict')
const { createInstanceCallbacks } = require('../services/instanceCallbacks')
const settings = { enabled: true, url: 'http://127.0.0.1:8002/msg', timeout_ms: 2000, retries: 2, Message_Encryption: false, RSA_PublicKey: '' }

function cacheFixture(t) {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'callback-cache-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return { fs, file: path.join(directory, 'callbackSetting.json') }
}

test('同一账号重新添加并变更端口后按 ID 回显，不自动更新企微', async t => {
  const { file, fs } = cacheFixture(t)
  fs.writeFileSync(file, '') // 兼容用户已创建的空配置文件
  const id = '16888556558029781234'
  const first = createInstanceCallbacks({ getSettingsFile: () => file, post: async () => ({ errno: 0 }) })
  t.after(() => first.close())
  await first.prepare(2709)
  await first.update(2709, { ...settings, retries: 7 }, id)
  await first.remove(2709)
  await first.close()
  const second = createInstanceCallbacks({ getSettingsFile: () => file, post: () => { throw Error('回显时不得更新企微') } })
  t.after(() => second.close())
  await second.prepare(3740)
  const restored = second.get(3740, id)
  assert.equal(restored.restored, true)
  assert.equal(restored.confirmed, false)
  assert.equal(restored.settings.url, settings.url)
  assert.equal(restored.settings.retries, 7)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.deepEqual(Object.keys(data.accounts), [id])
  assert.equal(data.accounts[id].settings.retries, 7)
})

test('多个账号独立保存，失败更新不覆盖记录，同端口切换账号不串配置', async t => {
  const { file } = cacheFixture(t)
  let fail = false
  const first = createInstanceCallbacks({ getSettingsFile: () => file, post: async () => ({ errno: fail ? -1 : 0 }) })
  t.after(() => first.close())
  await first.update(2709, settings, 'account-a')
  await first.update(3740, { ...settings, retries: 4 }, 'account-b')
  fail = true
  await assert.rejects(first.update(2709, { ...settings, retries: 99 }, 'account-a'))
  assert.equal(first.get(2709, 'account-b').settings.retries, 4)
  assert.equal(first.get(2709, 'new-account'), null)
  const second = createInstanceCallbacks({ getSettingsFile: () => file })
  t.after(() => second.close())
  assert.equal(second.get(8888, 'account-a').settings.retries, 2)
  assert.equal(second.get(9999, 'account-b').settings.retries, 4)
  assert.equal(second.get(2709, 'new-account'), null)
})

test('缺少有效账号 ID 时禁止提交和保存', async t => {
  const { file, fs } = cacheFixture(t)
  let calls = 0
  const service = createInstanceCallbacks({ getSettingsFile: () => file, post: () => { calls++; return { errno: 0 } } })
  t.after(() => service.close())
  for (const id of [undefined, '', '  ', '-', 1688855655802978]) {
    await assert.rejects(service.update(2709, settings, id), /账号 ID/)
  }
  assert.equal(calls, 0)
  assert.equal(fs.existsSync(file), false)
})

test('配置文件损坏时不覆盖原内容；更新成功但写盘失败时提示用户', async t => {
  const { file, fs } = cacheFixture(t)
  fs.writeFileSync(file, '{invalid-json')
  const service = createInstanceCallbacks({ getSettingsFile: () => file, post: async () => ({ errno: 0 }) })
  t.after(() => service.close())
  assert.throws(() => service.get(2709, 'account-a'))
  await service.update(2709, settings, 'account-a')
  assert.match(service.get(2709).storageWarning, /保存失败/)
  assert.equal(fs.readFileSync(file, 'utf8'), '{invalid-json')
})

test('真实 HTTP 更新使用实例端口和 /updatesettings，接收 errno 成功响应', async t => {
  const http = require('node:http')
  const { findAvailablePort } = require('../services/wecomInject')
  const { port } = await findAvailablePort(9200, 9900)
  let received
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      received = { method: req.method, url: req.url, body: JSON.parse(body) }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ errno: 0, msg: 'OK' }))
    })
  })
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const service = createInstanceCallbacks()
  t.after(() => service.close())
  await service.update(port, settings, 'account-a')
  assert.deepEqual(received, { method: 'POST', url: '/updatesettings', body: settings })
})

test('不同企微分配不同随机接收端口，原生回调按实例进入框架', async t => {
  const received = []
  const service = createInstanceCallbacks({ onMessage: (port, data) => received.push({ port, data }) })
  t.after(() => service.close())
  const a = await service.prepare(2709), b = await service.prepare(3740)
  assert.notEqual(a, b)
  for (const url of [a, b]) {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/msg$/)
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 3000 }) })
    assert.equal((await response.json()).errno, 0)
  }
  assert.deepEqual(received.map(item => item.port), [2709, 3740])
  assert.equal((await fetch(a.replace('/msg', '/other'))).status, 404)
})

test('实例更新严格发送六字段且互不影响；errno -1 或无 errno 不提交成功状态', async t => {
  const calls = []; let result = { msg: 'OK', errno: 0 }
  const service = createInstanceCallbacks({ post: async (port, body) => { calls.push({ port, body }); return result } })
  t.after(() => service.close())
  await service.prepare(2709); await service.prepare(3740)
  const previous = service.get(3740)
  await service.update(2709, { ...settings, host: 'ignored', port: 9999, Update: true }, 'account-a')
  assert.deepEqual(calls[0], { port: 2709, body: settings })
  assert.deepEqual(service.get(3740), previous)
  result = { errno: -1, msg: '失败' }
  await assert.rejects(service.update(2709, { ...settings, retries: 9 }, 'account-a'), /失败/)
  assert.equal(service.get(2709).settings.retries, 2)
  result = { msg: 'OK' }
  await assert.rejects(service.update(2709, settings, 'account-a'), /未确认/)
  await assert.rejects(service.update(2709, { ...settings, Message_Encryption: true }, 'account-a'), /公钥/)
})
