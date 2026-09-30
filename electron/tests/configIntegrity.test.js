const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { parseJsonDocument, readInjectSettings, saveInjectSettings } = require('../services/injectSettings')
const { writeTextAtomic } = require('../commons/atomicFile')
const { preparePackageConfig, disableDebug } = require('../../scripts/reset-pack-conf-login')

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

test('打包关闭源配置及副本调试，仅清理副本中的账号', t => {
  const root = temporary(t)
  fs.mkdirSync(path.join(root, 'conf'))
  fs.mkdirSync(path.join(root, 'bin'))
  const conf = '[sys]\nserver_port=8868\n[custom]\nlogin_info=[{"user_id":"123"}]\n'
  const settings = '{"port":"8989","IsDebug":true,"host":"WXWork.exe","login_info":[{"user_id":"123"}]}'
  fs.writeFileSync(path.join(root, 'conf/conf.ini'), conf)
  fs.writeFileSync(path.join(root, 'bin/settings.json'), settings)
  const output = preparePackageConfig(root)
  assert.equal(fs.readFileSync(path.join(root, 'conf/conf.ini'), 'utf8'), conf)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'bin/settings.json'))), { ...JSON.parse(settings), IsDebug: false })
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'bin/settings.json'))).IsDebug, false)
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'bin/settings.json'))).login_info, undefined)
  assert.equal(require('ini').parse(fs.readFileSync(path.join(output, 'conf/conf.ini'), 'utf8')).custom.login_info, '[]')
})

test('发布前关闭调试可重复执行，配置缺失或损坏时失败', t => {
  const root = temporary(t)
  fs.mkdirSync(path.join(root, 'bin'))
  const file = path.join(root, 'bin/settings.json')
  assert.throws(() => disableDebug(root), /ENOENT/)
  for (const invalid of ['{broken', 'null', '[]', 'true']) {
    fs.writeFileSync(file, invalid)
    assert.throws(() => disableDebug(root))
    assert.equal(fs.readFileSync(file, 'utf8'), invalid)
  }
  fs.writeFileSync(file, '{"host":"WXWork.exe"}')
  assert.equal(disableDebug(root).IsDebug, false)
  const first = fs.readFileSync(file, 'utf8')
  disableDebug(root)
  assert.equal(fs.readFileSync(file, 'utf8'), first)
})

test('直接 electron-builder 打包入口也刷新副本并关闭调试', t => {
  const root = temporary(t)
  fs.mkdirSync(path.join(root, 'bin'))
  fs.writeFileSync(path.join(root, 'bin/settings.json'), '{"IsDebug":true}')
  require('../../scripts/before-pack')({ packager: { projectDir: root } })
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'bin/settings.json'))).IsDebug, false)
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.cache/package-resources/bin/settings.json'))).IsDebug, false)
})

test('注入配置回滚可重复调用，恢复原始格式', t => {
  const root = temporary(t)
  const file = path.join(root, 'settings.json')
  const host = path.join(root, 'WXWork.exe')
  fs.writeFileSync(host, '')
  const original = JSON.stringify({ host, port: '8989', enabled: false, url: '', timeout_ms: 2000, retries: 0 })
  fs.writeFileSync(file, original)
  const newHost = path.join(root, 'new.exe')
  fs.writeFileSync(newHost, '')
  const rollback = saveInjectSettings(root, { host: newHost })
  assert.equal(readInjectSettings(root).host, newHost)
  rollback()
  rollback()
  assert.equal(fs.readFileSync(file, 'utf8'), original)
  assert.deepEqual(fs.readdirSync(root).sort(), ['WXWork.exe', 'new.exe', 'settings.json'])
})
