const fs = require('fs')
const path = require('path')
const { writeTextAtomic } = require('../commons/atomicFile')

function normalizeAccountId(value) {
  // 账号 ID 必须保留字符串，避免长整数精度丢失。
  if (typeof value !== 'string' || !value.trim() || value.trim() === '-') throw new Error('尚未取得企微账号 ID，请登录企微并刷新列表后重试')
  return value.trim()
}

function createCallbackSettingStore(getFile) {
  let memory = {}
  function load() {
    if (!getFile) return memory
    try {
      const text = fs.readFileSync(getFile(), 'utf8').replace(/^\uFEFF/, '').trim()
      if (!text) return {}
      const data = JSON.parse(text)
      if (data.version !== 1 || !data.accounts || typeof data.accounts !== 'object' || Array.isArray(data.accounts)) throw new Error('callbackSetting.json 格式无效，请检查配置文件')
      return data.accounts
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      return {}
    }
  }
  return {
    get(userId) {
      const id = normalizeAccountId(userId), records = load()
      return Object.hasOwn(records, id) ? records[id] : null
    },
    put(userId, value) {
      const id = normalizeAccountId(userId)
      const accounts = { ...load(), [id]: value }
      if (getFile) {
        const file = getFile()
        fs.mkdirSync(path.dirname(file), { recursive: true })
        writeTextAtomic(file, JSON.stringify({ version: 1, accounts }, null, 2))
      }
      memory = accounts
    }
  }
}
module.exports = { createCallbackSettingStore, normalizeAccountId }
