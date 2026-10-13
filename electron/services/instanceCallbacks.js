const http = require('http')
const diagnostics = require('../commons/diagnostics.cjs').createDiagnostics('services/instanceCallbacks.js')
const axios = require('axios')
const { enqueuePortTask } = require('./wecomApiClient')
const { validatePkcs1Rsa1024PublicKey } = require('../commons/pkcs1PublicKey.cjs')

function validateSettings(input) {
  if (typeof input?.enabled !== 'boolean' || typeof input.Message_Encryption !== 'boolean') throw new Error('回调和加密开关必须为布尔值')
  const url = String(input.url || '').trim()
  if (url || input.enabled) {
    let parsed
    try { parsed = new URL(url) } catch { throw new Error('请输入有效的回调地址') }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('回调地址必须使用 HTTP 或 HTTPS')
  }
  const timeout = Number(input.timeout_ms), retries = Number(input.retries)
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647 || !Number.isInteger(retries) || retries < 0 || retries > 2147483647) throw new Error('超时时间或重试次数无效')
  let key = String(input.RSA_PublicKey || '').trim()
  if (key || input.Message_Encryption) {
    const check = validatePkcs1Rsa1024PublicKey(key)
    if (!check.ok) throw new Error(check.message)
    key = check.body
  }
  return { enabled: input.enabled, url, timeout_ms: timeout, retries, Message_Encryption: input.Message_Encryption, RSA_PublicKey: key }
}

function createInstanceCallbacks({ getSettingsFile, onMessage = () => {}, post = (port, body) => enqueuePortTask(port, async () => {
  const response = await axios.post(`http://127.0.0.1:${port}/updatesettings`, body, { timeout: 10000, proxy: false, maxRedirects: 0 })
  return response.data
}) } = {}) {
  const instances = new Map()
  const { createCallbackSettingStore, normalizeAccountId } = require('./callbackSettingStore')
  const store = createCallbackSettingStore(getSettingsFile)
  async function startReceiver(port, listenPort = 0) {
    const server = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/msg') { res.writeHead(404); res.end(); return }
      const chunks = []; let size = 0
      req.on('data', chunk => {
        size += chunk.length
        if (size > 8 * 1024 * 1024) { res.writeHead(413); res.end(); req.destroy(); return }
        chunks.push(chunk)
      })
      req.on('error', () => {})
      req.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          onMessage(port, data)
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ errno: 0, msg: 'OK' }))
        } catch { res.writeHead(400); res.end() }
      })
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(listenPort, '127.0.0.1', resolve) })
    server.unref()
    return server
  }
  async function prepare(port, initial = {}) {
    port = Number(port)
    if (!Number.isInteger(port) || port <= 1024 || port > 10000) throw new Error('企微端口无效')
    if (instances.has(port)) await remove(port)
    const server = await startReceiver(port)
    const callbackUrl = `http://127.0.0.1:${server.address().port}/msg`
    instances.set(port, { server, callbackUrl, confirmed: false, settings: {
      enabled: initial.enabled === true, url: callbackUrl, timeout_ms: initial.timeout_ms || 2000,
      retries: initial.retries ?? 2, Message_Encryption: initial.encrypt === true, RSA_PublicKey: initial.public_key || ''
    } })
    return callbackUrl
  }
  async function detach(port) {
    const item = instances.get(Number(port))
    if (!item) return
    instances.delete(Number(port))
    if (item.server) {
      item.server.closeAllConnections?.()
      await new Promise(resolve => item.server.close(resolve))
    }
  }
  async function remove(port) {
    await detach(port)
  }
  function get(port, userId) {
    const item = instances.get(Number(port))
    if (userId && item?.userId !== userId) {
      const saved = store.get(userId)
      if (saved) return { settings: validateSettings(saved.settings), savedAt: saved.savedAt, restored: true, confirmed: false, storageWarning: item?.restoreWarning || '' }
      // 切换到其他账号时，不沿用上一个账号的运行配置。
      if (item?.userId) return null
    }
    return item ? { settings: { ...item.settings }, confirmed: item.confirmed, callbackUrl: item.callbackUrl, restored: false, savedAt: item.savedAt, storageWarning: item.storageWarning } : null
  }
  // 同一次注入、同一账号仅自动应用一次；并发登录通知和列表刷新共用结果。
  function applySaved(port, userId) {
    port = Number(port)
    const item = instances.get(port)
    if (!item?.server) return Promise.resolve({ applied: false })
    userId = normalizeAccountId(userId)
    if (item.userId === userId && item.confirmed) return Promise.resolve({ applied: false })
    if (!item.restoreTasks) item.restoreTasks = new Map()
    if (item.restoreTasks.has(userId)) return item.restoreTasks.get(userId)
    const task = Promise.resolve().then(async () => {
      const saved = store.get(userId)
      if (!saved) {
        diagnostics.important('C001', `[回调] 企微 ${port} 使用默认地址 ${item.settings.url}${item.settings.enabled ? '' : '（推送关闭）'}`)
        return { applied: false }
      }
      const settings = validateSettings(saved.settings)
      if (instances.get(port) !== item) return { applied: false }
      const result = await post(port, settings)
      if (result?.errno !== 0) throw new Error('企微未确认回调配置更新成功')
      if (instances.get(port) !== item) return { applied: false }
      Object.assign(item, { settings, userId, confirmed: true, savedAt: saved.savedAt, restoreWarning: '' })
      diagnostics.important('C002', `[回调] 企微 ${port} 已更新为 ${settings.url}${settings.enabled ? '' : '（推送关闭）'}`)
      return { applied: true }
    }).catch(error => {
      diagnostics.warn('C003', `[回调配置] 自动更新失败，尚未确认生效\n  企微端口：${port}\n  处理方式：请在设置中点击“更新当前企微”重试`, error)
      const warning = '自动应用已保存的回调配置失败，尚未确认生效，请点击更新当前企微重试'
      if (instances.get(port) === item) item.restoreWarning = warning
      return { applied: false, warning }
    })
    item.restoreTasks.set(userId, task)
    return task
  }
  async function update(port, input, userId) {
    port = Number(port)
    if (!Number.isInteger(port) || port <= 1024 || port > 10000) throw new Error('企微端口无效')
    userId = normalizeAccountId(userId)
    const settings = validateSettings(input)
    // 手动更新排在正在进行的自动恢复之后，确保用户最新修改最终生效。
    await Promise.all(instances.get(port)?.restoreTasks?.values() || [])
    const result = await post(port, settings)
    if (result?.errno !== 0) throw new Error(result?.errno === -1 ? (result.msg || '企微拒绝更新配置') : '企微未确认更新成功（返回缺少有效 errno）')
    const item = instances.get(port)
    if (item) { item.settings = settings; item.confirmed = true; item.restoreWarning = '' }
    else instances.set(port, { server: null, settings, confirmed: true })
    const updated = instances.get(port)
    updated.userId = userId
    updated.restored = false
    updated.savedAt = new Date().toISOString()
    try {
      store.put(userId, { settings, savedAt: updated.savedAt })
      updated.storageWarning = ''
    } catch {
      updated.storageWarning = '企微已更新，但 callbackSetting.json 保存失败；下次无法回显本次设置，请检查文件格式或写入权限后重试'
    }
    return settings
  }
  return { prepare, remove, get, update, applySaved, ports: () => [...instances.keys()], close: () => Promise.all([...instances.keys()].map(detach)) }
}
module.exports = { createInstanceCallbacks }
