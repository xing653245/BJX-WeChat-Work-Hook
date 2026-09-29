/** 日志中的接口类型只读取请求体，不再从 URL 推断。 */
function resolveApiTypeForLog(data) {
  if (data?.type == null || data.type === '' || typeof data.type === 'boolean') return 'unknown'
  const type = Number(data.type)
  return Number.isInteger(type) ? type : 'unknown'
}
module.exports = { resolveApiTypeForLog }
