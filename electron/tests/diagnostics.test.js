const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createDiagnostics, friendlyMessage, userMessage, safeDetail } = require('../commons/diagnostics.cjs')
const { createDiagnosticWriter } = require('../services/diagnosticFile')

test('诊断包含模块和定位编号，保留错误栈且隐藏密钥及请求配置', () => {
  const calls = []
  const log = createDiagnostics('test/module.js', { error: (...args) => calls.push(args) })
  const error = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED', config: { password: 'secret-value' } })
  log.error('L001', '连接失败', error, { card_key: 'card-value', RSA_PublicKey: 'public-value', port: 6272 })
  const output = JSON.stringify(calls)
  assert.match(output, /test\/module.js#L001/)
  assert.match(output, /ECONNREFUSED/)
  assert.match(output, /stack/)
  assert.doesNotMatch(output, /secret-value|card-value|public-value/)
  assert.doesNotMatch(safeDetail('{"token":"secret-value"}'), /secret-value/)
  assert.match(friendlyMessage(error), /服务已启动/)
  const cyclic = {}; cyclic.self = cyclic
  assert.equal(safeDetail(cyclic).self, '[循环引用]')
})

test('前端 ESM 与主进程使用一致的提示和脱敏规则', async () => {
  const browser = await import('../../src/utils/diagnostics.mjs')
  assert.equal(browser.friendlyMessage('EADDRINUSE'), friendlyMessage('EADDRINUSE'))
  assert.deepEqual(browser.safeDetail({ token: 'abc', port: 6272 }), safeDetail({ token: 'abc', port: 6272 }))
  assert.equal(browser.userMessage('TypeError: x'), userMessage('TypeError: x'))
})

test('用户提示保留操作建议，隐藏文件路径、调用栈及内部编号', () => {
  for (const raw of ['TypeError: cannot read property', '读取失败 E:\\app\\electron\\main.js:42', '错误位置 pages/SettingsPage.vue#U023', 'Hook type=1002 failed', '{"errno":-1,"stack":"trace"}']) {
    assert.equal(userMessage(raw, '请稍后重试'), '请稍后重试')
  }
  assert.equal(userMessage('请输入卡密'), '请输入卡密')
  assert.match(userMessage('ECONNREFUSED 127.0.0.1:6272'), /确认对应企微或回调服务已启动/)
  assert.doesNotMatch(userMessage('Request failed with status code 500'), /500|诊断/)
})

test('提示组件对用户只显示处理建议，诊断保留来源及原始错误', async () => {
  const vm = require('node:vm')
  const source = (await fs.readFile(path.resolve(__dirname, '../../src/utils/feedback.mjs'), 'utf8'))
    .replace(/^import .*$/gm, '').replace('export function', 'function')
  const shown = [], details = []
  const context = {
    userMessage, Error,
    createDiagnostics: source => ({ error: (...args) => details.push({ source, args }) }),
    ElMessage: { error: options => shown.push(options) }
  }
  vm.createContext(context)
  vm.runInContext(source + '\nthis.feedback = createFeedback("SettingsPage.vue")', context)
  context.feedback.error('U023', new Error('TypeError: broken at main.js:42'))
  assert.doesNotMatch(shown[0].message, /TypeError|main.js|U023|SettingsPage|定位/)
  assert.equal(details[0].source, 'SettingsPage.vue')
  assert.equal(details[0].args[0], 'U023')
  assert.match(details[0].args[2].message, /TypeError/)
})

test('诊断文件异步写入并轮转，不写入完整私钥', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vwork-diagnostics-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const writer = createDiagnosticWriter(root, { maxBytes: 350 })
  for (let i = 0; i < 8; i++) writer.write({ source: 'test', code: `L${i}`, level: 'warn', message: '模拟诊断', private_key: 'must-not-leak' })
  await writer.flush()
  const current = await fs.readFile(writer.file, 'utf8')
  const previous = await fs.readFile(writer.file + '.1', 'utf8')
  assert.match(current, /L7/)
  assert.doesNotMatch(current + previous, /must-not-leak/)
  assert.ok(Buffer.byteLength(current) <= 350)
})
