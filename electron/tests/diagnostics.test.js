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

test('两端区分网络、HTTP、进程、权限及内部错误，同时隐藏敏感原始信息', async () => {
  const browser = await import('../../src/utils/diagnostics.mjs')
  const samples = [
    ['connect ECONNREFUSED 127.0.0.1:5529', /本地端口 5529.*连接被拒绝/],
    ['EADDRINUSE 127.0.0.1:6272', /端口已被占用/],
    ['ETIMEDOUT', /请求超时/], ['getaddrinfo ENOTFOUND host', /无法解析/],
    ['ECONNRESET', /中断或重置/], ['Network Error', /网络请求失败/],
    ['CERT_HAS_EXPIRED', /证书校验失败/], ['ENOSPC', /磁盘空间不足/],
    ['EACCES E:\\private\\file', /没有操作权限/], ['EBUSY', /资源被占用/], ['EROFS', /只读/],
    ['ENOENT E:\\private\\file', /所需文件不存在/], ['Cannot find module hidden', /运行组件缺失/],
    ['注入工具不存在: E:\\private\\it.exe', /启动组件缺失/],
    ['宿主文件校验失败: E:\\private\\WXWork.exe', /客户端文件校验失败/],
    ['设置目标环境失败', /启动环境设置失败/], ['加载日志 DLL 失败', /组件加载失败/],
    ['unsupported client version', /版本不兼容/], ['Hook type=1002 failed', /企微接入失败/],
    ['exitCode=34', /进程异常退出/],
    ['Error invoking remote method run-inject: TypeError: broken', /类型异常/],
    ['ReferenceError: secret is not defined', /内部引用异常/],
    ['SyntaxError: Unexpected token secret', /数据格式无效/],
    ['No handler registered for hidden', /界面与后台通信失败/],
    [Object.assign(new Error('request failed'), { code: 'ECONNREFUSED' }), /连接被拒绝/],
    [{ message: 'request failed', response: { status: 403 } }, /HTTP 403.*拒绝访问/]
  ]
  for (const [raw, expected] of samples) {
    const result = userMessage(raw)
    assert.match(result, expected)
    assert.equal(browser.userMessage(raw), result)
    assert.doesNotMatch(result, /E:\\private|secret|hidden|TypeError|Hook|exitCode/)
  }
  for (const [status, expected] of [[400, /参数无效/], [401, /认证未通过/], [404, /接口不存在/], [408, /超时/], [409, /状态冲突/], [413, /数据过大/], [422, /校验/], [429, /过于频繁/], [500, /内部处理异常/], [502, /上游/], [503, /暂时不可用/], [504, /上游.*超时/], [418, /拒绝了请求/], [507, /处理请求失败/]]) {
    const raw = 'Request failed with status code ' + status
    assert.match(userMessage(raw), new RegExp('HTTP ' + status))
    assert.match(userMessage(raw), expected)
    assert.equal(browser.userMessage(raw), userMessage(raw))
  }
  assert.doesNotMatch(userMessage('Request failed with status code 401'), /卡密过期|账号被封/)
  assert.match(userMessage('unrecognized native error'), /未能识别具体原因/)
  const exportError = '故障报告导出失败：报告不是完整的 JSON，可能被截断、损坏或并非原始报告文件'
  assert.equal(userMessage(exportError), exportError)
  assert.equal(userMessage("Error invoking remote method 'save-settings': Error: 客户端路径不存在"), '客户端路径不存在')
  assert.match(userMessage("Error invoking remote method 'run-inject': unexpected native failure"), /未能识别具体原因/)
  assert.match(userMessage("Error invoking remote method 'run-inject': 宿主文件校验失败 E:\\private\\WXWork.exe"), /客户端文件校验失败/)
})

test('用户提示保留操作建议，隐藏文件路径、调用栈及内部编号', () => {
  for (const raw of ['读取失败 E:\\app\\electron\\main.js:42', '错误位置 pages/SettingsPage.vue#U023', '{"errno":-1,"stack":"trace"}']) {
    assert.equal(userMessage(raw, '请稍后重试'), '请稍后重试')
  }
  assert.equal(userMessage('请输入卡密'), '请输入卡密')
  assert.match(userMessage('ECONNREFUSED 127.0.0.1:6272'), /确认对应企微或回调服务已启动/)
  assert.match(userMessage('TypeError: cannot read property'), /类型异常/)
  assert.match(userMessage('Hook type=1002 failed'), /企微接入失败/)
  assert.match(userMessage('Request failed with status code 500'), /HTTP 500.*服务内部/)
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
  vm.runInContext('this.manager = createFeedback("pages/VWorkManagerPage.vue"); this.settings = createFeedback("pages/SettingsPage.vue")', context)
  context.manager.error('U007', 'unknown failure')
  assert.match(shown.at(-1).message, /添加企微失败.*未能识别具体原因/)
  context.settings.error('U014', 'unknown failure')
  assert.match(shown.at(-1).message, /下载更新失败.*未能识别具体原因/)
  context.manager.error('U007', Object.assign(new Error('native request failed'), { code: 'ECONNREFUSED' }))
  assert.match(shown.at(-1).message, /添加企微失败.*连接被拒绝/)
  context.manager.error('U036', '已检测到企微，请完全退出后再从框架添加')
  assert.equal(shown.at(-1).message, '已检测到企微，请完全退出后再从框架添加')
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
