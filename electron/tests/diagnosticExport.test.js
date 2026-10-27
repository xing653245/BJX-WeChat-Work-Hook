const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { exportDiagnosticReport, exportFailureMessage } = require('../services/diagnosticExport')
const { parseReportBytes, MAX_REPORT_BYTES } = require('../commons/reportValidation.cjs')
const { sealReport } = require('../commons/reportEncryption.cjs')
const { decryptFile, decryptReport } = require('../../scripts/decrypt-diagnostic')
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 })

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vwork-report-check-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
function reportBytes() { return Buffer.from(JSON.stringify(sealReport({ kind: 'report', logs: [] }, pair.publicKey))) }

test('导出回读校验完整报告，可正常解密，返回长度与摘要，不包含明文', t => {
  const file = path.join(temporary(t), 'report.vdiag')
  const payload = { kind: 'report', logs: [], note: '不能出现在磁盘中的明文' }
  const result = exportDiagnosticReport(file, payload, pair.publicKey)
  const bytes = fs.readFileSync(file)
  assert.equal(result.bytes, bytes.length)
  assert.equal(result.sha256, crypto.createHash('sha256').update(bytes).digest('hex'))
  assert.doesNotMatch(bytes.toString(), /不能出现在磁盘中的明文/)
  assert.deepEqual(decryptReport(parseReportBytes(bytes), pair.privateKey), payload)
})

test('临时文件回读为全零时拒绝导出，保留原报告并清理临时文件', t => {
  const root = temporary(t), file = path.join(root, 'report.vdiag')
  const original = reportBytes()
  fs.writeFileSync(file, original)
  const read = fs.readFileSync
  t.mock.method(fs, 'readFileSync', function (target, ...args) {
    const bytes = read.call(this, target, ...args)
    return String(target).endsWith('.tmp') ? Buffer.alloc(bytes.length) : bytes
  })
  assert.throws(() => exportDiagnosticReport(file, { kind: 'report', logs: [] }, pair.publicKey), { code: 'REPORT_ZERO_FILLED' })
  assert.deepEqual(fs.readFileSync(file), original)
  assert.deepEqual(fs.readdirSync(root), ['report.vdiag'])
})

test('最终文件被写为全零时拒绝成功并移除无效报告', t => {
  const root = temporary(t), file = path.join(root, 'report.vdiag')
  const rename = fs.renameSync
  t.mock.method(fs, 'renameSync', function (from, to) {
    rename.call(this, from, to)
    fs.writeFileSync(to, Buffer.alloc(fs.statSync(to).size))
  })
  assert.throws(() => exportDiagnosticReport(file, { kind: 'report', logs: [] }, pair.publicKey), { code: 'REPORT_ZERO_FILLED' })
  assert.deepEqual(fs.readdirSync(root), [])
})

test('结构仍有效但密文发生变化时，逐字节校验能发现损坏', t => {
  const file = path.join(temporary(t), 'report.vdiag')
  const read = fs.readFileSync
  t.mock.method(fs, 'readFileSync', function (target, ...args) {
    const bytes = read.call(this, target, ...args)
    if (!String(target).endsWith('.tmp')) return bytes
    const envelope = JSON.parse(bytes)
    const data = Buffer.from(envelope.ciphertext, 'base64'); data[0] ^= 1
    envelope.ciphertext = data.toString('base64')
    return Buffer.from(JSON.stringify(envelope))
  })
  assert.throws(() => exportDiagnosticReport(file, { kind: 'report', logs: [] }, pair.publicKey), { code: 'REPORT_WRITE_MISMATCH' })
  assert.equal(fs.existsSync(file), false)
})

test('解密明确区分空文件、全零、截断、格式、版本和字段错误', () => {
  const valid = JSON.parse(reportBytes())
  const cases = [
    [Buffer.alloc(0), 'REPORT_EMPTY'], [Buffer.alloc(36878), 'REPORT_ZERO_FILLED'],
    [Buffer.from('{"format":'), 'REPORT_JSON_INVALID'], [Buffer.from('{}'), 'REPORT_FORMAT_INVALID'],
    [Buffer.from(JSON.stringify({ ...valid, version: 2 })), 'REPORT_VERSION_UNSUPPORTED'],
    [Buffer.from(JSON.stringify({ ...valid, algorithm: 'invalid' })), 'REPORT_ALGORITHM_UNSUPPORTED'],
    [Buffer.from(JSON.stringify({ ...valid, tag: '!' })), 'REPORT_FIELD_INVALID'],
    [Buffer.alloc(MAX_REPORT_BYTES + 1), 'REPORT_TOO_LARGE']
  ]
  for (const [bytes, code] of cases) assert.throws(() => parseReportBytes(bytes), { code })
  assert.deepEqual(parseReportBytes(Buffer.from('\uFEFF' + JSON.stringify(valid))), valid)
})

test('解密脚本区分路径、私钥、输出覆盖和内容认证错误，不泄漏密钥', t => {
  const root = temporary(t), input = path.join(root, 'report.vdiag'), key = path.join(root, 'key.pem'), output = path.join(root, 'out.json')
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' })
  fs.writeFileSync(input, reportBytes()); fs.writeFileSync(key, privatePem)
  assert.throws(() => decryptFile(path.join(root, 'missing'), key, output), /ENOENT.*读取报告/)
  assert.throws(() => decryptFile(input, path.join(root, 'missing.pem'), output), /ENOENT.*读取私钥/)
  fs.writeFileSync(key, 'not a private key')
  assert.throws(() => decryptFile(input, key, output), /KEY_INVALID.*私钥文件无法解析/)
  fs.writeFileSync(key, crypto.generateKeyPairSync('rsa', { modulusLength: 3072 }).privateKey.export({ type: 'pkcs8', format: 'pem' }))
  assert.throws(() => decryptFile(input, key, output), /KEY_MISMATCH.*不匹配/)
  fs.writeFileSync(key, privatePem)
  const envelope = JSON.parse(fs.readFileSync(input)), ciphertext = Buffer.from(envelope.ciphertext, 'base64')
  ciphertext[0] ^= 1; envelope.ciphertext = ciphertext.toString('base64')
  fs.writeFileSync(input, JSON.stringify(envelope))
  assert.throws(() => decryptFile(input, key, output), /REPORT_AUTH_FAILED.*完整性认证失败/)
  assert.equal(fs.existsSync(output), false)
  fs.writeFileSync(input, reportBytes())
  assert.deepEqual(decryptFile(input, key, output), { kind: 'report', logs: [] })
  assert.throws(() => decryptFile(input, key, output), /EEXIST.*输出文件已存在/)
  assert.deepEqual(JSON.parse(fs.readFileSync(output)), { kind: 'report', logs: [] })
  assert.throws(() => decryptFile(input, key, path.join(root, 'missing', 'out.json')), /ENOENT.*写入解密结果/)
})

test('CLI 对全零报告输出具体原因及失败退出码，而非误报私钥不匹配', t => {
  const root = temporary(t), input = path.join(root, 'zero.vdiag'), output = path.join(root, 'out.json')
  fs.writeFileSync(input, Buffer.alloc(36878))
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/decrypt-diagnostic.js'), input, path.join(root, 'missing.pem'), output], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /REPORT_ZERO_FILLED.*0x00.*36878/)
  assert.doesNotMatch(result.stderr, /私钥不匹配|BEGIN.*PRIVATE KEY/)
  assert.equal(fs.existsSync(output), false)
})

test('嵌套日志损坏时提示具体文件序号和记录序号', () => {
  const record = sealReport({ message: 'test' }, pair.publicKey)
  record.tag = Buffer.alloc(16).toString('base64')
  const report = sealReport({ kind: 'report', logs: [{ name: 'application.vdiag', records: [record] }] }, pair.publicKey)
  assert.throws(() => decryptReport(report, pair.privateKey), /第 1 个日志文件、第 1 条记录.*完整性认证失败/)
})

test('导出失败提示区分磁盘空间、访问权限及本地源日志损坏', () => {
  assert.match(exportFailureMessage({ code: 'ENOSPC' }), /磁盘空间不足/)
  assert.match(exportFailureMessage({ code: 'EACCES' }), /无权限或文件被占用/)
  assert.match(exportFailureMessage(new SyntaxError('raw file details')), /本地诊断记录格式损坏/)
})
