const fs = require('fs')
const path = require('path')
const { writeTextAtomic } = require('../commons/atomicFile')

function normalizeAccountId(value) {
  // 账号 ID 必须保留字符串，避免长整数精度丢失。
  if (typeof value !== 'string' || !value.trim() || value.trim() === '-') throw new Error('尚未取得企微账号 ID，请登录企微并刷新列表后重试')
  return value.trim()
}

function invalidSettings(file) {
  const error = new Error('callbackSetting.json 格式损坏')
  error.code = 'CALLBACK_SETTINGS_INVALID'
  error.path = file
  return error
}

function formatStorageWarning(error) {
  const reason = {
    EPERM: '保存位置不可写，系统拒绝写入',
    EACCES: '保存位置不可写，没有写入权限',
    ENOSPC: '磁盘空间不足',
    EBUSY: '配置文件正被占用',
    ENOTDIR: '保存路径无效，其中一级不是目录',
    EISDIR: '配置文件路径指向了文件夹',
    EROFS: '保存位置只读',
    EIO: '配置文件读写发生磁盘错误',
    CALLBACK_SETTINGS_INVALID: 'callbackSetting.json 格式损坏'
  }[error?.code] || '未能确认原因，请导出故障报告'
  return `企微已更新，但 callbackSetting.json 保存失败：${reason}。本次设置仍已生效`
}

function readAccounts(file) {
  let text
  try { text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim() }
  catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  if (!text) return {}
  let data
  try { data = JSON.parse(text) }
  catch { throw invalidSettings(file) }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1 || !data.accounts || typeof data.accounts !== 'object' || Array.isArray(data.accounts)) {
    throw invalidSettings(file)
  }
  return data.accounts
}

function createCallbackSettingStore(getFile, { getLegacyFile } = {}) {
  let memory = {}
  function load() {
    if (!getFile) return memory
    const file = getFile()
    const current = readAccounts(file)
    if (current) return current
    const legacyFile = typeof getLegacyFile === 'function' ? getLegacyFile() : ''
    if (!legacyFile || path.resolve(legacyFile) === path.resolve(file)) return {}
    return readAccounts(legacyFile) || {}
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

module.exports = { createCallbackSettingStore, normalizeAccountId, formatStorageWarning }
