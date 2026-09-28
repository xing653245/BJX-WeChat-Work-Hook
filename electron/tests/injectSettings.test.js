const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { readInjectSettings, saveInjectSettings } = require('../services/injectSettings')

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-settings-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const host = path.join(dir, 'WXWork.exe')
  fs.writeFileSync(host, '')
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({
    host, port: '8989', logs: 'keep', automatic_startup: '0', startup_mode: 'start_and_load'
  }))
  fs.writeFileSync(path.join(dir, 'push.json'), JSON.stringify({
    enabled: true, url: 'http://localhost:8002/msg', timeout_ms: 2000, retries: 2, extra: 'keep'
  }))
  return dir
}

test('配置字段正确读写，保留未编辑字段，支持恢复原始文件内容', (t) => {
  const dir = fixture(t)
  const before = ['settings.json', 'push.json'].map(name => fs.readFileSync(path.join(dir, name), 'utf8'))
  const original = readInjectSettings(dir)
  const rollback = saveInjectSettings(dir, { ...original, port: 4567, enabled: false, timeout_ms: 3000, retries: 0 })
  assert.deepEqual(readInjectSettings(dir), { ...original, port: '4567', enabled: false, timeout_ms: 3000, retries: 0 })
  const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json')))
  assert.equal(settings.logs, 'keep')
  assert.equal(settings.startup_mode, 'start_and_load')
  assert.equal(settings.automatic_startup, '0')
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'push.json'))).extra, 'keep')
  rollback()
  assert.deepEqual(['settings.json', 'push.json'].map(name => fs.readFileSync(path.join(dir, name), 'utf8')), before)
})

test('消息加密与公钥写入 settings.json，并保留其它字段', (t) => {
  const dir = fixture(t)
  const original = readInjectSettings(dir)
  const pem = '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----'
  saveInjectSettings(dir, { ...original, encrypt: true, public_key: pem })
  const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json')))
  assert.equal(settings.encrypt, true)
  assert.equal(settings.public_key, pem)
  assert.equal(settings.logs, 'keep')
  assert.equal(settings.startup_mode, 'start_and_load')
  assert.deepEqual(readInjectSettings(dir), { ...original, encrypt: true, public_key: pem })
})

test('无效路径、端口、回调参数和损坏 JSON 均不覆盖已有文件', (t) => {
  const dir = fixture(t)
  const original = readInjectSettings(dir)
  for (const invalid of [{ host: 'missing.exe' }, { port: 0 }, { timeout_ms: 0 }, { retries: -1 }, { enabled: 'false' }, { url: 'file:///tmp/a' }]) {
    assert.throws(() => saveInjectSettings(dir, { ...original, ...invalid }))
    assert.deepEqual(readInjectSettings(dir), original)
  }
  const settings = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')
  fs.writeFileSync(path.join(dir, 'push.json'), 'broken')
  assert.throws(() => saveInjectSettings(dir, { ...original, port: 4567 }))
  assert.equal(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'), settings)
})
