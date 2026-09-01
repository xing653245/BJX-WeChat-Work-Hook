const { randomUUID } = require('node:crypto')
const { mkdir, writeFile } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024
const DEFAULT_RETENTION_MS = 60 * 60 * 1000
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

function safeFileName(value) {
  const leaf = path.basename(String(value || '').trim())
  const sanitized = leaf.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_').slice(-160)
  return sanitized || 'remote-file.bin'
}

function decodeBase64(value, maxBytes) {
  const content = String(value || '').trim()
  if (!content || content.length % 4 !== 0 || !BASE64_PATTERN.test(content)) {
    throw new Error('文件内容不是有效的 Base64 数据')
  }
  const bytes = Buffer.from(content, 'base64')
  if (bytes.length === 0) throw new Error('远程文件内容为空')
  if (bytes.length > maxBytes) throw new Error(`远程文件过大，最大允许 ${maxBytes} 字节`)
  return bytes
}

async function stageRemoteFile({
  fileName,
  contentBase64,
  directory = path.join(os.tmpdir(), 'vwork-remote-files'),
  maxBytes = DEFAULT_MAX_BYTES
}) {
  const bytes = decodeBase64(contentBase64, maxBytes)
  await mkdir(directory, { recursive: true })
  const filePath = path.join(directory, `${Date.now()}-${randomUUID()}-${safeFileName(fileName)}`)
  await writeFile(filePath, bytes, { flag: 'wx' })
  return filePath
}

function scheduleRemoteFileCleanup(filePath, retentionMs = DEFAULT_RETENTION_MS) {
  const timer = setTimeout(() => {
    require('node:fs/promises').rm(filePath, { force: true }).catch(() => {})
  }, retentionMs)
  timer.unref?.()
}

module.exports = {
  DEFAULT_MAX_BYTES,
  stageRemoteFile,
  scheduleRemoteFileCleanup
}
