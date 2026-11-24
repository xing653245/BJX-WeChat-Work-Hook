const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { createCallbackSettingStore, formatStorageWarning } = require('../services/callbackSettingStore')

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'callback-storage-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const legacy = path.join(root, 'install', 'bin', 'callbackSetting.json')
  const current = path.join(root, 'userData', 'callbackSetting.json')
  fs.mkdirSync(path.dirname(legacy), { recursive: true })
  return { root, legacy, current, store: createCallbackSettingStore(() => current, { getLegacyFile: () => legacy }) }
}

test('安装版配置写入 userData，开发版仍用项目 bin；获取路径失败时不得退回安装目录', () => {
  const filename = path.resolve(__dirname, '../commons/resourcePaths.js')
  const app = { isPackaged: true, getPath: name => { assert.equal(name, 'userData'); return 'C:/Users/test/AppData/Roaming/example' } }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, __dirname: path.dirname(filename), process: { resourcesPath: 'C:/Program Files/example/resources' },
    require: name => name === 'electron' ? { app } : require(name)
  })
  assert.equal(module.exports.getCallbackSettingsPath(), path.join(app.getPath('userData'), 'callbackSetting.json'))
  app.isPackaged = false
  assert.equal(module.exports.getCallbackSettingsPath(), path.resolve(__dirname, '../../bin/callbackSetting.json'))
  app.isPackaged = true
  app.getPath = () => { throw Error('userData unavailable') }
  assert.throws(() => module.exports.getCallbackSettingsPath(), /userData unavailable/)
})

test('读取兼容旧配置，首次保存迁移全部账号且保留旧文件，重启后从新位置恢复', t => {
  const { legacy, current, store } = fixture(t)
  const old = JSON.stringify({ version: 1, accounts: { a: { savedAt: 'old-a' }, b: { savedAt: 'old-b' } } })
  fs.writeFileSync(legacy, old)
  assert.deepEqual(store.get('a'), { savedAt: 'old-a' })
  assert.equal(fs.existsSync(current), false, '读取不写盘')
  store.put('a', { savedAt: 'new-a' })
  assert.equal(fs.readFileSync(legacy, 'utf8'), old)
  const reopened = createCallbackSettingStore(() => current, { getLegacyFile: () => legacy })
  assert.deepEqual(reopened.get('a'), { savedAt: 'new-a' })
  assert.deepEqual(reopened.get('b'), { savedAt: 'old-b' })
  fs.writeFileSync(legacy, '{broken old file')
  assert.deepEqual(reopened.get('b'), { savedAt: 'old-b' }, '新文件存在后不再读旧文件')
})

test('新文件为空或明确清空时不会重新导入旧账号', t => {
  const { legacy, current, store } = fixture(t)
  fs.writeFileSync(legacy, JSON.stringify({ version: 1, accounts: { old: {} } }))
  fs.mkdirSync(path.dirname(current), { recursive: true })
  for (const contents of ['', '{"version":1,"accounts":{}}']) {
    fs.writeFileSync(current, contents)
    assert.equal(store.get('old'), null)
    store.put('new', { savedAt: 'new' })
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(current, 'utf8')).accounts), ['new'])
  }
})

test('旧文件或当前文件损坏时不覆盖，错误包含路径但不泄漏配置正文', t => {
  const { legacy, current, store } = fixture(t)
  const bad = '{"private_value":"DO-NOT-LOG",broken'
  fs.writeFileSync(legacy, bad)
  assert.throws(() => store.put('a', {}), error => {
    assert.equal(error.code, 'CALLBACK_SETTINGS_INVALID')
    assert.equal(error.path, legacy)
    assert.doesNotMatch(error.message, /DO-NOT-LOG/)
    return true
  })
  assert.equal(fs.existsSync(current), false)
  assert.equal(fs.readFileSync(legacy, 'utf8'), bad)
  fs.mkdirSync(path.dirname(current), { recursive: true })
  for (const content of ['null', '[]', '{}', '{"version":1,"accounts":[]}']) {
    fs.writeFileSync(current, content)
    assert.throws(() => store.put('a', {}), { code: 'CALLBACK_SETTINGS_INVALID', path: current })
    assert.equal(fs.readFileSync(current, 'utf8'), content)
  }
})

test('新旧文件都不存在时可首次保存；开发模式相同路径正常保存', t => {
  const { current, store } = fixture(t)
  assert.equal(store.get('a'), null)
  store.put('a', { savedAt: 'a' })
  const same = createCallbackSettingStore(() => current, { getLegacyFile: () => current })
  same.put('b', { savedAt: 'b' })
  assert.deepEqual(same.get('a'), { savedAt: 'a' })
  assert.deepEqual(same.get('b'), { savedAt: 'b' })
})

test('保存错误提示按系统错误码区分原因，不把运行成功误报为更新失败', () => {
  for (const [code, expected] of [['EPERM', /不可写/], ['EACCES', /不可写/], ['ENOSPC', /空间/],
    ['EBUSY', /占用/], ['ENOTDIR', /路径/], ['CALLBACK_SETTINGS_INVALID', /格式损坏/], ['UNKNOWN', /故障报告/]]) {
    const message = formatStorageWarning({ code })
    assert.match(message, /^企微已更新/)
    assert.match(message, expected)
    assert.match(message, /本次设置仍已生效/)
  }
})
