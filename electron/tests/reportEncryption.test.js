const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { sealReport, loadReportPublicKey } = require('../commons/reportEncryption.cjs')
const { decryptReport, openEnvelope } = require('../../scripts/decrypt-diagnostic')
const { createDiagnosticWriter } = require('../services/diagnosticFile')
const { createDiagnostics, setDiagnosticSink, setConsoleDiagnosticsEnabled } = require('../commons/diagnostics.cjs')
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 })

test('混合加密可还原中文报告，每次使用独立密钥和随机数', () => {
  const data = { message: '模拟故障😀', detail: '中文'.repeat(10000) }
  const first = sealReport(data, pair.publicKey)
  const second = sealReport(data, pair.publicKey)
  assert.deepEqual(openEnvelope(first, pair.privateKey), data)
  assert.notEqual(first.nonce, second.nonce)
  assert.notEqual(first.wrappedKey, second.wrappedKey)
  assert.notEqual(first.ciphertext, second.ciphertext)
  assert.doesNotMatch(JSON.stringify(first), /模拟故障|中文/)
  assert.equal(loadReportPublicKey().asymmetricKeyDetails.modulusLength, 3072)
})

test('错误私钥和被改动的密文、认证标签、随机数及元信息都无法解密', () => {
  const original = sealReport({ message: 'test' }, pair.publicKey)
  const wrong = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 })
  assert.throws(() => openEnvelope(original, wrong.privateKey))
  assert.throws(() => openEnvelope(original, pair.publicKey))
  for (const field of ['ciphertext', 'tag', 'nonce', 'wrappedKey']) {
    const bytes = Buffer.from(original[field], 'base64'); bytes[0] ^= 1
    assert.throws(() => openEnvelope({ ...original, [field]: bytes.toString('base64') }, pair.privateKey))
  }
  for (const field of ['version', 'algorithm', 'keyId']) {
    assert.throws(() => openEnvelope({ ...original, [field]: 'invalid' }, pair.privateKey))
  }
})

test('诊断及崩溃直接加密落盘，导出快照只含加密记录，私钥可还原完整报告', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vwork-encrypted-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const writer = createDiagnosticWriter(dir, { publicKey: pair.publicKey, maxBytes: 3000 })
  writer.write({ source: 'test', message: '诊断明文标记', token: '不要记录的口令' })
  writer.writeCritical({ source: 'crash', message: '崩溃明文标记' })
  await writer.flush()
  for (const file of await fs.readdir(dir)) {
    assert.match(file, /\.vdiag(?:\.1)?$/)
    assert.doesNotMatch(await fs.readFile(path.join(dir, file), 'utf8'), /诊断明文标记|崩溃明文标记|不要记录的口令/)
  }
  const exported = sealReport({ kind: 'report', logs: await writer.snapshot() }, pair.publicKey)
  const result = decryptReport(exported, pair.privateKey)
  assert.equal(result.logs.length, 2)
  assert.equal(result.logs[0].records[0].message, '诊断明文标记')
  assert.equal(result.logs[0].records[0].token, '[已隐藏]')
  assert.equal(result.logs[1].records[0].message, '崩溃明文标记')
})

test('关闭生产控制台输出后仍写入诊断接收器', () => {
  const recorded = [], output = []
  setDiagnosticSink(record => recorded.push(record))
  setConsoleDiagnosticsEnabled(false)
  try {
    createDiagnostics('test', { error: (...args) => output.push(args) }).error('E001', '故障信息')
    assert.equal(output.length, 0)
    assert.equal(recorded.length, 1)
  } finally { setConsoleDiagnosticsEnabled(true); setDiagnosticSink(null) }
})

test('旧明文诊断成功迁移为密文后才移除原件，保留长日志内容', async t => {
  const { migrateLegacyDiagnostics } = require('../services/legacyDiagnostics')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vwork-legacy-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  await fs.mkdir(path.join(dir, 'diagnostics'))
  const text = '旧版排错记录\n'.repeat(2000)
  await fs.writeFile(path.join(dir, 'diagnostics/application.log'), text)
  await migrateLegacyDiagnostics(dir, pair.publicKey)
  await assert.rejects(fs.access(path.join(dir, 'diagnostics/application.log')))
  const encrypted = JSON.parse(await fs.readFile(path.join(dir, 'diagnostics/legacy-application.vdiag'), 'utf8'))
  assert.equal(openEnvelope(encrypted, pair.privateKey).content, text)
  await migrateLegacyDiagnostics(dir, pair.publicKey)
})
