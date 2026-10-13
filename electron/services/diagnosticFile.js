const fs = require('fs/promises')
const path = require('path')
const { safeDetail } = require('../commons/diagnostics.cjs')
const fsSync = require('fs')
const { sealReport } = require('../commons/reportEncryption.cjs')

// 串行异步写入，限制积压和文件大小，诊断本身不能拖慢界面。
function createDiagnosticWriter(directory, { maxBytes = 2 * 1024 * 1024, maxPending = 200, publicKey = null } = {}) {
  const file = path.join(directory, publicKey ? 'application.vdiag' : 'application.log')
  const crashFile = path.join(directory, 'crash.vdiag')
  const encode = text => publicKey ? JSON.stringify(sealReport(JSON.parse(text), publicKey)) + '\n' : text
  let tail = Promise.resolve(), pending = 0, size = null, dropped = 0
  let lastError = null
  function write(record) {
    if (pending >= maxPending) { dropped++; return }
    const safe = safeDetail(record)
    let line = JSON.stringify({ time: new Date().toISOString(), ...safe }) + '\n'
    if (Buffer.byteLength(line) > 64 * 1024) {
      line = JSON.stringify({ time: new Date().toISOString(), source: safe.source, code: safe.code, message: safe.message, details: '诊断详情过长，已省略' }) + '\n'
    }
    line = encode(line)
    pending++
    tail = tail.then(async () => {
      if (size === null) {
        await fs.mkdir(directory, { recursive: true })
        size = await fs.stat(file).then(s => s.size).catch(() => 0)
      }
      const warning = dropped ? encode(JSON.stringify({ message: `日志量过大，已省略 ${dropped} 条重复时段记录` }) + '\n') : ''
      dropped = 0
      const content = warning + line
      if (size + Buffer.byteLength(content) > maxBytes) {
        await fs.rm(file + '.1', { force: true })
        await fs.rename(file, file + '.1').catch(error => { if (error.code !== 'ENOENT') throw error })
        size = 0
      }
      await fs.appendFile(file, content, 'utf8')
      size += Buffer.byteLength(content)
      lastError = null
    }).catch(error => { size = null; lastError = error }).finally(() => { pending-- })
  }
  async function flush() { await tail; if (lastError) throw lastError }
  function writeCritical(record) {
    if (!publicKey) throw new Error('崩溃诊断必须使用公钥加密')
    const content = encode(JSON.stringify({ time: new Date().toISOString(), ...safeDetail(record) }))
    fsSync.mkdirSync(directory, { recursive: true })
    if (fsSync.existsSync(crashFile) && fsSync.statSync(crashFile).size + Buffer.byteLength(content) > maxBytes) {
      fsSync.rmSync(crashFile + '.1', { force: true })
      fsSync.renameSync(crashFile, crashFile + '.1')
    }
    fsSync.appendFileSync(crashFile, content, 'utf8')
  }
  function snapshot() {
    if (!publicKey) return Promise.reject(new Error('未启用报告加密'))
    const result = tail.then(async () => {
      if (lastError) throw lastError
      const logs = []
      for (const item of [file + '.1', file, crashFile + '.1', crashFile,
        ...['legacy-previous.vdiag', 'legacy-application.vdiag', 'legacy-crash.vdiag'].map(name => path.join(directory, name))]) {
        const text = await fs.readFile(item, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error })
        if (text) logs.push({ name: path.basename(item), records: text.trim().split('\n').map(line => JSON.parse(line)) })
      }
      return logs
    })
    tail = result.then(() => {}, () => {})
    return result
  }
  return { write, writeCritical, flush, snapshot, file }
}
module.exports = { createDiagnosticWriter }
