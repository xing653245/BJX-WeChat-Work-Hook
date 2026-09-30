const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { parseJsonDocument, readInjectSettings, saveInjectSettings } = require('../services/injectSettings')
const { writeTextAtomic } = require('../commons/atomicFile')
const { preparePackageConfig } = require('../../scripts/reset-pack-conf-login')

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vwork-integrity-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('JSON 注释解析保留 URL、双斜线和转义引号', () => {
  const body = { url: 'http://host/a//b', logs: 'C:\\logs\\', text: 'hello "//"' }
  assert.deepEqual(parseJsonDocument('\uFEFF' + JSON.stringify(body).replace('{', '{/* note */') + '// end'), body)
  assert.throws(() => parseJsonDocument('{/* missing'), /未闭合/)
})

test('原子替换失败时不残留临时文件或破坏目标', t => {
  const root = temporary(t)
  const target = path.join(root, 'settings.json')
  fs.mkdirSync(target)
  assert.throws(() => writeTextAtomic(target, '{}'))
  assert.deepEqual(fs.readdirSync(root), ['settings.json'])
  assert.ok(fs.statSync(target).isDirectory())
})

test('打包只清理副本中的账号与 IsDebug，源配置字节保持不变', t => {
  const root = temporary(t)
  fs.mkdirSync(path.join(root, 'conf'))
  fs.mkdirSync(path.join(root, 'bin'))
  const conf = '[sys]\nserver_port=8868\n[custom]\nlogin_info=[{"user_id":"123"}]\n'
  const settings = '{"port":"8989","IsDebug":true,"host":"WXWork.exe"}'
  fs.writeFileSync(path.join(root, 'conf/conf.ini'), conf)
  fs.writeFileSync(path.join(root, 'bin/settings.json'), settings)
  const output = preparePackageConfig(root)
  assert.equal(fs.readFileSync(path.join(root, 'conf/conf.ini'), 'utf8'), conf)
  assert.equal(fs.readFileSync(path.join(root, 'bin/settings.json'), 'utf8'), settings)
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'bin/settings.json'))).IsDebug, false)
  assert.equal(require('ini').parse(fs.readFileSync(path.join(output, 'conf/conf.ini'), 'utf8')).custom.login_info, '[]')
})

test('注入配置回滚可重复调用，恢复原始格式', t => {
  const root = temporary(t)
  const file = path.join(root, 'settings.json')
  const host = path.join(root, 'WXWork.exe')
  fs.writeFileSync(host, '')
  const original = JSON.stringify({ host, port: '8989', enabled: false, url: '', timeout_ms: 2000, retries: 0 })
  fs.writeFileSync(file, original)
  const rollback = saveInjectSettings(root, { ...readInjectSettings(root), retries: 3 })
  assert.equal(readInjectSettings(root).retries, 3)
  rollback()
  rollback()
  assert.equal(fs.readFileSync(file, 'utf8'), original)
  assert.deepEqual(fs.readdirSync(root).sort(), ['WXWork.exe', 'settings.json'])
})
