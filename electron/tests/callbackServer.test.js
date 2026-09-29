const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { once } = require('node:events')
const { readCallbackTarget, loadPrivateKey, decodeCallback, createCallbackApp } = require('../../scripts/callback_server')

const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 })
function encrypt(text) {
  const bytes = Buffer.isBuffer(text) ? text : Buffer.from(text)
  const data = []
  for (let i = 0; i < bytes.length; i += 117) {
    data.push(crypto.publicEncrypt({ key: pair.publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, bytes.subarray(i, i + 117)).toString('base64'))
  }
  return { data, encrypted: true }
}
let supportsPkcs1 = true
try {
  crypto.privateDecrypt({ key: pair.privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(encrypt('probe').data[0], 'base64'))
} catch { supportsPkcs1 = false }
const rsaTest = { skip: supportsPkcs1 ? false : '当前 Node/OpenSSL 不支持 PKCS#1 私钥解密；完整测试使用 Node 24' }
function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'callback-rsa-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('明文对象、字符串和未开启加密的消息保持原样', () => {
  for (const body of [{ msg_type: 1, data: ['hello'] }, { encrypted: false, data: ['hello'] }, '原文', null, 0]) {
    assert.equal(decodeCallback(body, null), body)
    assert.equal(decodeCallback(body, pair.privateKey), body)
  }
  assert.throws(() => decodeCallback(encrypt('hello'), null), error => error.status === 503)
})

test('读取带注释和 BOM 的 bin 配置，不写回文件', t => {
  const file = path.join(tempDir(t), 'settings.json')
  const text = '\uFEFF{\n// callback\n"url":"http://127.0.0.1:8002/msg"\n}'
  fs.writeFileSync(file, text)
  assert.deepEqual(readCallbackTarget(file), { url: 'http://127.0.0.1:8002/msg', host: '127.0.0.1', port: 8002, pathname: '/msg' })
  assert.equal(fs.readFileSync(file, 'utf8'), text)
})

test('私钥支持 PKCS#1/PKCS#8 PEM，拒绝公钥和错误位数，不支持算法时提前报错', t => {
  const file = path.join(tempDir(t), 'private.pem')
  assert.equal(loadPrivateKey(), null)
  assert.throws(() => loadPrivateKey(file), /无法读取 RSA 私钥/)
  for (const type of ['pkcs1', 'pkcs8']) {
    fs.writeFileSync(file, pair.privateKey.export({ type, format: 'pem' }))
    if (supportsPkcs1) assert.equal(loadPrivateKey(file).type, 'private')
    else assert.throws(() => loadPrivateKey(file), /implicit rejection/)
  }
  fs.writeFileSync(file, pair.publicKey.export({ type: 'spki', format: 'pem' }))
  assert.throws(() => loadPrivateKey(file), /无法读取 RSA 私钥/)
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  fs.writeFileSync(file, other.privateKey.export({ type: 'pkcs8', format: 'pem' }))
  assert.throws(() => loadPrivateKey(file), /1024 bits/)
})

test('按顺序解密 117 字节分段，中文跨块拼接无乱码，JSON 与纯文本均可恢复', rsaTest, () => {
  const original = { msg_type: 1, text: '企微消息😀'.repeat(80) }
  const envelope = encrypt(JSON.stringify(original))
  assert.ok(envelope.data.length > 3)
  assert.deepEqual(decodeCallback(envelope, pair.privateKey), original)
  const text = 'a'.repeat(116) + '中文😀'.repeat(60)
  assert.equal(decodeCallback(encrypt(text), pair.privateKey), text)
})

test('无效信封、密文、错误私钥和非法 UTF-8 均失败且不暴露加密库错误', rsaTest, () => {
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey
  const invalid = [
    { encrypted: true }, { encrypted: true, data: [] }, { encrypted: true, data: [123] },
    { encrypted: true, data: ['%%%'] }, { encrypted: true, data: [Buffer.alloc(128).toString('base64')] },
    { encrypted: true, data: [encrypt('hello').data[0] + '!'] }, encrypt(Buffer.from([0xff]))
  ]
  for (const body of invalid) {
    assert.throws(() => decodeCallback(body, pair.privateKey), error => error.status === 400 && error.message === '加密回调解密失败，请检查配对私钥和密文格式')
  }
  assert.throws(() => decodeCallback(encrypt('hello'), other), error => error.status === 400)
})

async function startApp(t, privateKey) {
  const logs = []
  const logger = { log: (...args) => logs.push(args.join(' ')), error: () => {} }
  const app = createCallbackApp({ pathname: '/msg', url: 'http://127.0.0.1/msg' }, { privateKey, logger })
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const post = body => fetch(`${base}/msg`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { logs, base, post }
}

test('HTTP 明文可用，未配置私钥的密文返回 503，健康检查与未知路径正常', async t => {
  const { logs, base, post } = await startApp(t, null)
  const plain = { msg_type: 1, text: '原样保留' }
  assert.equal((await post(plain)).status, 200)
  assert.ok(logs.includes(JSON.stringify(plain, null, 2)))
  const encrypted = await post(encrypt('hello'))
  assert.equal(encrypted.status, 503)
  assert.equal((await encrypted.json()).success, false)
  const text = await fetch(`${base}/msg`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '中文原文' })
  assert.equal(text.status, 200)
  assert.ok(logs.includes('中文原文'))
  assert.equal((await fetch(`${base}/health`)).status, 200)
  assert.equal((await fetch(`${base}/unknown`)).status, 404)
})

test('HTTP 密文输出还原后的 JSON，损坏密文返回失败且不记录部分明文', rsaTest, async t => {
  const { logs, post } = await startApp(t, pair.privateKey)
  const original = { msg_type: 1, text: '企微回调😀'.repeat(50) }
  assert.equal((await post(encrypt(JSON.stringify(original)))).status, 200)
  assert.ok(logs.includes(JSON.stringify(original, null, 2)))
  const before = logs.length
  const envelope = encrypt(JSON.stringify(original))
  envelope.data[1] = Buffer.alloc(128).toString('base64')
  const failed = await post(envelope)
  assert.equal(failed.status, 400)
  assert.equal((await failed.json()).success, false)
  assert.equal(logs.length, before)
})
