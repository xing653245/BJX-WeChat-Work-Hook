const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const examples = require('./fixtures/vworkApiExamples.json')
const { validateVworkRequest } = require('../utils/vworkApiContract')
const { createDocumentedApi } = require('../middleware/documentedApi')
const { resolveApiTypeForLog } = require('../configs/apiLogResolve')

test('集合中的 84 个请求均符合协议，合法的 0 和数组不被丢弃', () => {
  assert.equal(examples.length, 84)
  for (const { name, body } of examples) {
    const result = validateVworkRequest(body)
    assert.equal(result.valid, true, `${name}: ${result.message}`)
    assert.deepEqual(result.params, body, name)
  }
})

test('拒绝缺失的 CDN 字段、小程序 app_id、错误数组和非法开关', () => {
  for (const type of [3013, 3014, 3015, 9005, 9006, 3006]) {
    const body = { ...examples.find(x => x.body.type === type).body }
    delete body[type === 3006 ? 'app_id' : type >= 9005 ? 'path' : 'cdn_key']
    assert.equal(validateVworkRequest(body).valid, false)
  }
  assert.equal(validateVworkRequest({ type: 7000, state: 2 }).valid, false)
  assert.equal(validateVworkRequest({ type: 7000, state: false }).params.state, 0)
  assert.equal(validateVworkRequest({ type: 6004, user_id: '1', label_id_list: '1,2' }).valid, false)
})

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}

test('文档入口使用默认或显式企微端口，原样返回响应，不将 port 发给 Hook', async () => {
  const raw = { errno: 0, errmsg: 'OK', data: { open_id: 'wm123' } }
  const calls = []
  const handler = createDocumentedApi({ getPort: () => 8989, call: async (...args) => { calls.push(args); return raw } })
  for (const port of [undefined, 8990]) {
    const res = response()
    await handler({ body: { port, type: 8000, user_id: '123' }, socket: { localPort: 8868 } }, res)
    assert.deepEqual(res.body, raw)
    assert.deepEqual(calls.at(-1), [port ?? 8989, 8000, { user_id: '123' }])
  }
  const res = response()
  await handler({ body: { port: 8868, type: 1000 }, socket: { localPort: 8868 } }, res)
  assert.equal(res.statusCode, 400)
  assert.equal(calls.length, 2)
})

test('文档入口保留授权失败和参数错误状态', async () => {
  for (const [code, status] of [['NO_AUTH', 403], ['INVALID_API_PARAMS', 400]]) {
    const handler = createDocumentedApi({ getPort: () => 8989, call: async () => { throw Object.assign(new Error('test'), { code }) } })
    const res = response()
    await handler({ body: { type: 3000 } }, res)
    assert.equal(res.statusCode, status)
    assert.deepEqual(res.body, { errno: -1, errmsg: 'test', data: null })
  }
})

test('HTTP 仅提供 POST /api，84 个 type 原样分发，旧分类路径不再提供接口', async (t) => {
  const express = require('express')
  const axios = require('axios')
  const calls = []
  const handler = createDocumentedApi({
    getPort: () => 8989,
    call: async (port, type, params) => {
      const checked = validateVworkRequest({ ...params, type })
      if (!checked.valid) throw Object.assign(new Error(checked.message), { code: 'INVALID_API_PARAMS' })
      calls.push({ port, ...checked.params })
      return { errno: 0, errmsg: 'OK', data: checked.params }
    }
  })
  const filename = path.resolve(__dirname, '../routes/index.js')
  const localRequire = createRequire(filename)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    require(name) {
      return name === '../middleware/documentedApi' ? { createDocumentedApi: () => handler } : localRequire(name)
    }
  }, { filename })
  const app = express()
  app.use(express.json())
  app.use('/api', module.exports)
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const client = axios.create({ baseURL: `http://127.0.0.1:${server.address().port}`, proxy: false, validateStatus: () => true })
  for (const { body } of examples) {
    const response = await client.post('/api', { ...body, port: 8989 })
    assert.equal(response.status, 200)
    assert.deepEqual(response.data, { errno: 0, errmsg: 'OK', data: body })
    assert.deepEqual(calls.at(-1), { port: 8989, ...body })
  }
  for (const endpoint of ['/api/message/image-cdn', '/api/settings/auto-update', '/api/call', '/api/other/start-wecom']) {
    assert.equal((await client.post(endpoint, { type: 1000 })).status, 404)
  }
  assert.equal((await client.post('/api', { port: 8989 })).status, 400)
  assert.equal(calls.length, 84)
})

test('日志仅使用请求体 type，不再按路径推断', () => {
  assert.equal(resolveApiTypeForLog({ type: 3013 }), 3013)
  assert.equal(resolveApiTypeForLog({ type: '7000' }), 7000)
  assert.equal(resolveApiTypeForLog({}), 'unknown')
  assert.equal(resolveApiTypeForLog({ type: false }), 'unknown')
})
