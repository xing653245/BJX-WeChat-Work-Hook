const crypto = require('crypto')
const axios = require('axios')

// 与回调示例的 RSA 1024 / PKCS#1 v1.5 分段协议一致，只需要用户公钥。
function encodeCallback(data, settings) {
  if (!settings.Message_Encryption) return data
  const der = Buffer.from(settings.RSA_PublicKey, 'base64')
  let key
  try { key = crypto.createPublicKey({ key: der, format: 'der', type: 'pkcs1' }) }
  catch { key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' }) }
  const bytes = Buffer.from(JSON.stringify(data), 'utf8'), blocks = []
  for (let i = 0; i < bytes.length; i += 117) {
    blocks.push(crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, bytes.subarray(i, i + 117)).toString('base64'))
  }
  return { encrypted: true, data: blocks }
}

function createCallbackForwarder({ send = (url, body, options) => axios.post(url, body, options), onError = () => {} } = {}) {
  const queue = []
  const controller = new AbortController()
  let running = false, queuedBytes = 0
  async function drain() {
    if (running) return
    running = true
    try {
      while (queue.length && !controller.signal.aborted) {
        const entry = queue.shift()
        try {
          const body = encodeCallback(entry.data, entry.settings)
          for (let attempt = 0; ; attempt++) {
            try {
              await send(entry.settings.url, body, { timeout: entry.settings.timeout_ms,
                proxy: false, maxRedirects: 0, signal: controller.signal })
              break
            } catch (error) {
              if (controller.signal.aborted) break
              if (attempt >= entry.settings.retries) throw error
            }
          }
        } catch (error) { if (!controller.signal.aborted) onError(error) }
        finally { queuedBytes -= entry.bytes }
      }
    } finally { running = false }
  }
  return {
    enqueue(data, settings) {
      if (!settings.enabled || controller.signal.aborted || data.encrypted === true) return
      const bytes = Buffer.byteLength(JSON.stringify(data))
      if (queue.length >= 256 || queuedBytes + bytes > 32 * 1024 * 1024) {
        onError(new Error('外部回调积压已达上限，本条未转发；请检查接收服务'))
        return
      }
      queuedBytes += bytes
      queue.push({ data, settings: { ...settings }, bytes })
      void drain()
    },
    close() { controller.abort(); queue.length = 0 }
  }
}

module.exports = { createCallbackForwarder, encodeCallback }
