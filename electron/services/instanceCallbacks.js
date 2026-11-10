const http = require('http')
const diagnostics = require('../commons/diagnostics.cjs').createDiagnostics('services/instanceCallbacks.js')
const axios = require('axios')
const { enqueuePortTask } = require('./wecomApiClient')
const { validatePkcs1Rsa1024PublicKey } = require('../commons/pkcs1PublicKey.cjs')
const { createCallbackForwarder } = require('./callbackForwarder')

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

function createInstanceCallbacks({ getSettingsFile, getInitialSettings = () => ({}), onMessage = () => {}, forward, post = (port, body) => enqueuePortTask(port, async () => {
  const response = await axios.post(`http://127.0.0.1:${port}/updatesettings`, body, { timeout: 10000, proxy: false, maxRedirects: 0 })
  return response.data
}) } = {}) {
  const instances = new Map()
  const preparations = new Map()
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
          if (!data || typeof data !== 'object' || Array.isArray(data)) { res.writeHead(400); res.end(); return }
          try { onMessage(port, data) } catch (error) { diagnostics.warn('C004', '显示回调日志失败', error) }
          const item = instances.get(port)
          if (!item?.userId || !data.self_user_id || String(data.self_user_id) === item.userId) item?.forwarder.enqueue(data, item.settings)
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ errno: 0, msg: 'OK' }))
        } catch { res.writeHead(400); res.end() }
      })
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(listenPort, '127.0.0.1', resolve) })
    server.unref()
    return server
  }
  async function prepare(port, initial = getInitialSettings()) {
    port = Number(port)
    if (!Number.isInteger(port) || port <= 1024 || port > 10000) throw new Error('企微端口无效')
    if (instances.has(port)) await remove(port)
    const server = await startReceiver(port)
    const callbackUrl = `http://127.0.0.1:${server.address().port}/msg`
    const forwarder = createCallbackForwarder({ send: forward, onError: error => {
      diagnostics.warn('C005', `企微 ${port} 外部回调失败`, error)
      onMessage(port, { sys: true, content: `外部回调失败（企微端口 ${port}），请检查回调接收服务；本地消息已接收。` })
    } })
    const settings = {
      enabled: initial.enabled === true, url: initial.url || '', timeout_ms: initial.timeout_ms || 2000,
      retries: initial.retries ?? 2, Message_Encryption: initial.encrypt === true, RSA_PublicKey: initial.public_key || ''
    }
    instances.set(port, { server, callbackUrl, forwarder, confirmed: false, settings, defaults: { ...settings } })
    return callbackUrl
  }
  function ensureReceiver(port) {
    if (instances.get(port)?.server) return Promise.resolve()
    if (!preparations.has(port)) preparations.set(port, prepare(port).finally(() => preparations.delete(port)))
    return preparations.get(port)
  }
  async function connect(port) {
    port = Number(port)
    await ensureReceiver(port)
    const item = instances.get(port)
    if (item.connected) return
    if (item.connectTask) return item.connectTask
    item.connectTask = (async () => {
      // 内部日志始终走本机明文；外部开关、公钥及目标地址由转发器独立应用。
      const result = await post(port, { enabled: true, url: item.callbackUrl, timeout_ms: 2000,
        retries: 2, Message_Encryption: false, RSA_PublicKey: '' })
      if (result?.errno !== 0) throw new Error(result?.errno === -1 ? (result.msg || '企微拒绝更新配置') : '企微未确认本地消息接收配置更新成功（返回缺少有效 errno）')
      if (instances.get(port) === item) item.connected = true
    })().finally(() => { item.connectTask = null })
    return item.connectTask
  }
  function assertExternalUrl(settings) {
    if (!settings.url) return
    const target = new URL(settings.url)
    if (['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) &&
      (target.port === '9999' || [...instances.values()].some(item => item.callbackUrl && new URL(item.callbackUrl).port === target.port))) {
      throw new Error('外部回调地址不能指向框架内部消息接收端口')
    }
  }
  async function detach(port) {
    const item = instances.get(Number(port))
    if (!item) return
    instances.delete(Number(port))
    item.forwarder?.close()
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
    userId = normalizeAccountId(userId)
    if (!instances.get(port)?.server) return ensureReceiver(port).then(() => applySaved(port, userId))
    const item = instances.get(port)
    if (item.userId === userId && item.confirmed) return Promise.resolve({ applied: false })
    if (!item.restoreTasks) item.restoreTasks = new Map()
    if (item.restoreTasks.has(userId)) return item.restoreTasks.get(userId)
    const task = Promise.resolve().then(async () => {
      const saved = store.get(userId)
      if (!saved) {
        await connect(port)
        if (instances.get(port) !== item) return { applied: false }
        item.settings = { ...item.defaults }
        item.userId = userId
        item.confirmed = true
        diagnostics.important('C001', `[回调] 企微 ${port} 使用默认地址 ${item.settings.url}${item.settings.enabled ? '' : '（推送关闭）'}`)
        return { applied: true }
      }
      const settings = validateSettings(saved.settings)
      assertExternalUrl(settings)
      if (instances.get(port) !== item) return { applied: false }
      await connect(port)
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
    // 已成功的账号由 confirmed 去重；切换回旧账号时必须重新取其配置。
    void task.then(result => { if (result.applied) item.restoreTasks.delete(userId) })
    return task
  }
  async function update(port, input, userId) {
    port = Number(port)
    if (!Number.isInteger(port) || port <= 1024 || port > 10000) throw new Error('企微端口无效')
    userId = normalizeAccountId(userId)
    const settings = validateSettings(input)
    assertExternalUrl(settings)
    // 手动更新排在正在进行的自动恢复之后，确保用户最新修改最终生效。
    await Promise.all(instances.get(port)?.restoreTasks?.values() || [])
    // 手动更新也重申内部地址，恢复被旧版本或其他程序改走的回调。
    if (instances.has(port)) instances.get(port).connected = false
    await connect(port)
    const item = instances.get(port)
    if (!item?.server || !item.connected) throw new Error('企微实例已关闭，请刷新列表后重试')
    Object.assign(item, { settings, confirmed: true, restoreWarning: '' })
    const updated = item
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
  return { prepare, connect, remove, get, update, applySaved, ports: () => [...instances.keys()], close: () => Promise.all([...instances.keys()].map(detach)) }
}
module.exports = { createInstanceCallbacks }
