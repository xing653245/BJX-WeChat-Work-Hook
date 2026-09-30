const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { readInjectSettings, saveInjectSettings } = require('../services/injectSettings')

function fixture(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-settings-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const host = path.join(dir, 'WXWork.exe')
  fs.writeFileSync(host, '')
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({
    enabled: true,
    url: 'http://localhost:8002/msg',
    timeout_ms: 2000,
    retries: 2,
    host,
    port: '8989',
    logs: 'keep',
    automatic_startup: '0',
    startup_mode: 'start_and_load',
    Message_Encryption: false,
    RSA_PublicKey: '',
    IsDebug: false,
    extra: 'keep',
    ...extra
  }))
  return { dir, host }
}

test('配置字段正确读写，保留未编辑字段，支持恢复原始文件内容', (t) => {
  const { dir } = fixture(t)
  const before = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')
  const original = readInjectSettings(dir)
  const rollback = saveInjectSettings(dir, { ...original, port: 4567, enabled: false, timeout_ms: 3000, retries: 0 })
  assert.deepEqual(readInjectSettings(dir), { ...original, enabled: false, timeout_ms: 3000, retries: 0 })
  const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json')))
  assert.equal(settings.port, '8989')
  assert.equal(settings.logs, 'keep')
  assert.equal(settings.startup_mode, 'start_and_load')
  assert.equal(settings.automatic_startup, '0')
  assert.equal(settings.extra, 'keep')
  assert.equal(settings.enabled, false)
  assert.equal(settings.timeout_ms, 3000)
  assert.equal(settings.retries, 0)
  rollback()
  assert.equal(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'), before)
})

test('消息加密与公钥写入 Message_Encryption / RSA_PublicKey，并保留其它字段', (t) => {
  const { dir } = fixture(t)
  const original = readInjectSettings(dir)
  const public_key = require('node:crypto').generateKeyPairSync('rsa', {
    modulusLength: 1024,
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  }).publicKey.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '')
  saveInjectSettings(dir, { ...original, encrypt: true, public_key, is_debug: true })
  const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json')))
  assert.equal(settings.Message_Encryption, true)
  assert.equal(settings.RSA_PublicKey, public_key)
  assert.doesNotMatch(settings.RSA_PublicKey, /BEGIN PUBLIC KEY|END PUBLIC KEY/)
  assert.equal(settings.IsDebug, true)
  assert.equal(settings.encrypt, undefined)
  assert.equal(settings.public_key, undefined)
  assert.equal(settings.logs, 'keep')
  assert.equal(settings.startup_mode, 'start_and_load')
  assert.deepEqual(readInjectSettings(dir), { ...original, encrypt: true, public_key, is_debug: true })
})

test('保存时未传 is_debug 则保留文件中的 IsDebug', (t) => {
  const { dir } = fixture(t, { IsDebug: true })
  const original = readInjectSettings(dir)
  const { is_debug: _ignored, ...withoutDebug } = original
  saveInjectSettings(dir, withoutDebug)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'))).IsDebug, true)
})

test('开启加密时拒绝带头尾或不合法的公钥', (t) => {
  const { dir } = fixture(t)
  const original = readInjectSettings(dir)
  assert.throws(
    () => saveInjectSettings(dir, { ...original, encrypt: true, public_key: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----' }),
    /BEGIN\/END PUBLIC KEY/
  )
  assert.throws(
    () => saveInjectSettings(dir, { ...original, encrypt: true, public_key: 'not-a-key' }),
    /Base64|PKCS#1|公钥/
  )
  assert.deepEqual(readInjectSettings(dir), original)
})

test('无效路径、回调参数和损坏 JSON 均不覆盖已有文件', (t) => {
  const { dir } = fixture(t)
  const original = readInjectSettings(dir)
  for (const invalid of [{ host: 'missing.exe' }, { timeout_ms: 0 }, { retries: -1 }, { enabled: 'false' }, { url: 'file:///tmp/a' }]) {
    assert.throws(() => saveInjectSettings(dir, { ...original, ...invalid }))
    assert.deepEqual(readInjectSettings(dir), original)
  }
  const settings = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')
  fs.writeFileSync(path.join(dir, 'settings.json'), 'broken')
  assert.throws(() => saveInjectSettings(dir, { ...original, port: 4567 }))
  fs.writeFileSync(path.join(dir, 'settings.json'), settings)
  assert.equal(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'), settings)
})

test('保存只更新 settings.json，不删除同目录的其它文件', (t) => {
  const { dir } = fixture(t)
  fs.writeFileSync(path.join(dir, 'push.json'), JSON.stringify({
    enabled: false, url: 'http://127.0.0.1:8002/mess', timeout_ms: 3000, retries: 5
  }))
  const original = readInjectSettings(dir)
  saveInjectSettings(dir, original)
  assert.equal(fs.existsSync(path.join(dir, 'push.json')), true)
  const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json')))
  assert.equal(settings.url, original.url)
  assert.equal(settings.enabled, original.enabled)
})
