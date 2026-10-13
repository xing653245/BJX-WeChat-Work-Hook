const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const { createRequire } = require('node:module')

test('回调只读 bin 配置，禁用或缺失时不回退旧 INI，读取不触发迁移写入', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vwork-callback-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const iniPath = path.join(root, 'conf.ini')
  const original = '[sys]\nserver_port=8868\ncallback=http://old:8001/msg\n'
  fs.writeFileSync(iniPath, original)
  const filename = path.resolve(__dirname, '../commons/common.js')
  const localRequire = createRequire(filename)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, __dirname: path.dirname(filename), console, process, Buffer,
    require(name) { return name === './resourcePaths' ? { getInjectBinDir: () => root } : localRequire(name) }
  }, { filename })
  const { readIni, getBusinessCallbackUrl } = module.exports
  fs.writeFileSync(path.join(root, 'settings.json'), '{"enabled":true,"url":"http://new:9000/msg"}')
  assert.equal(readIni(iniPath).callback, 'http://new:9000/msg')
  fs.writeFileSync(path.join(root, 'settings.json'), '{"enabled":false,"url":"http://new:9000/msg"}')
  assert.equal(getBusinessCallbackUrl('http://old:8001/msg'), '')
  assert.equal(readIni(iniPath).callback, '')
  fs.unlinkSync(path.join(root, 'settings.json'))
  assert.equal(getBusinessCallbackUrl(), '')
  assert.equal(fs.readFileSync(iniPath, 'utf8'), original)
})
