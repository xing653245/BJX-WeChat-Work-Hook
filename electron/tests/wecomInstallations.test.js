const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { classifyInstallations } = require('../services/wecomInstallations')
const { autoSaveWecomInstallation } = require('../services/wecomInstallations')
const os = require('node:os')

test('打包后读取 asar 内脚本，向 PowerShell 传递内容而非虚拟文件路径', async () => {
  const service = fs.readFileSync(path.resolve(__dirname, '../services/wecomInstallations.js'), 'utf8')
  const script = '# 中文路径测试\nWrite-Output "[]"'
  const module = { exports: {} }
  let invoked = false
  vm.runInNewContext(service, {
    module, Buffer, __dirname: 'C:\\安装目录\\resources\\app.asar\\electron\\services',
    process: { platform: 'win32', env: {} },
    require(name) {
      if (name === 'path') return path.win32
      if (name === 'fs') return { readFileSync: file => file.endsWith('versions.json')
        ? JSON.stringify({ profiles: [{ version: '5.0.3.6005' }] }) : script }
      if (name === 'child_process') return { execFile(file, args, options, callback) {
        invoked = true
        assert.equal(file, 'powershell.exe')
        assert.ok(!args.includes('-File'))
        assert.equal(Buffer.from(args[args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le'), script)
        assert.equal(options.windowsHide, true)
        assert.equal(options.env.VWORK_CURRENT_HOST, 'D:\\企微\\WXWork.exe')
        callback(null, '[]')
      } }
      throw Error(name)
    }
  })
  assert.equal((await module.exports.findWecomInstallations('C:\\bin', 'D:\\企微\\WXWork.exe')).length, 0)
  assert.equal(invoked, true)
})

test('启动自动保存唯一路径，保留其他配置；无匹配或多义时不改写', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wecom-autopath-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const host = path.join(dir, 'WXWork.exe')
  fs.writeFileSync(host, '')
  const settings = path.join(dir, 'settings.json')
  const original = { host: 'missing', IsDebug: false, enabled: true, timeout_ms: 3000 }
  fs.writeFileSync(settings, JSON.stringify(original))
  const find = async () => [{ path: host, supported: true }]
  assert.equal((await autoSaveWecomInstallation(dir, { find })).status, 'saved')
  assert.deepEqual(JSON.parse(fs.readFileSync(settings)), { ...original, host })
  assert.equal((await autoSaveWecomInstallation(dir, { find })).status, 'unchanged')
  assert.equal((await autoSaveWecomInstallation(dir, { find: async () => [
    { path: host, supported: true }, { path: 'other', supported: true }
  ] })).status, 'unchanged')
  fs.writeFileSync(settings, JSON.stringify(original))
  for (const candidates of [[], [{ path: host, supported: false }], [
    { path: host, supported: true }, { path: 'other', supported: true }
  ]]) {
    await autoSaveWecomInstallation(dir, { find: async () => candidates })
    assert.deepEqual(JSON.parse(fs.readFileSync(settings)), original)
  }
  await assert.rejects(autoSaveWecomInstallation(dir, { find: async () => { throw Error('scan failed') } }), /scan failed/)
  assert.deepEqual(JSON.parse(fs.readFileSync(settings)), original)
})

test('安装位置去重并按配套版本标注兼容性，不接受其他可执行文件', () => {
  const rows = classifyInstallations([
    { path: 'D:\\企微\\WXWork.exe', version: '5.0.3.6005' },
    { path: 'd:\\企微\\wxwork.exe', version: '5.0.3.6005' },
    { path: 'C:\\WXWork.exe', version: '4.1.0.1' },
    { path: 'C:\\Other.exe', version: '5.0.3.6005' }
  ], ['5.0.3.6005'])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].supported, true)
  assert.equal(rows[1].supported, false)
})

test('唯一兼容安装自动保存，多个安装等待选择，查找失败或不兼容保留原值', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/pages/SettingsPage.vue'), 'utf8')
  for (const [candidates, saves] of [
    [[], 0], [[{ path: 'bad', supported: false, version: '4' }], 0],
    [[{ path: 'one', supported: true, version: '5' }], 1],
    [[{ path: 'one', supported: true }, { path: 'two', supported: true }], 0], [null, 0]
  ]) {
    let saved = 0
    const context = vm.createContext({
      ref: value => ({ value }), saving: { value: false }, formData: { wecom_exe_path_v5: 'original' },
      nextTick: async () => {}, handleSave: async () => { saved++; return true },
      feedback: { error() {} },
      window: { electronAPI: { findWecomInstallations: async () => ({ success: candidates !== null, candidates }) } }
    })
    vm.runInContext(source.slice(source.indexOf('const findingInstallations ='), source.indexOf('const applyInjectSettings =')) + '\nthis.find = autoFindWecom', context)
    await context.find()
    assert.equal(saved, saves)
    assert.equal(context.formData.wecom_exe_path_v5, saves ? 'one' : 'original')
  }
})
