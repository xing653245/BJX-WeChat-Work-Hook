/**
 * 通过本地企微请求授权时的错误提示
 */

function normalizeAuthErrorMessage(error) {
  return String(error?.message || error || '').trim()
}

function isAuthNetworkError(message) {
  const lower = normalizeAuthErrorMessage(message).toLowerCase()
  if (!lower) return true
  return (
    lower.includes('enotfound') ||
    lower.includes('getaddrinfo') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('enetunreach') ||
    lower.includes('ehostunreach') ||
    lower.includes('network error') ||
    lower.includes('socket hang up') ||
    lower.includes('net::err_connection_timed_out') ||
    lower.includes('net::err_connection_reset') ||
    lower.includes('net::err_name_not_resolved') ||
    lower.includes('net::err_internet_disconnected') ||
    lower.includes('net::err_network_changed')
  )
}

function formatAuthFetchError(error) {
  const msg = normalizeAuthErrorMessage(error)
  const code = error?.code || ''

  if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
    return '无法连接企微授权接口，请确认对应企微实例已启动、注入成功且端口正确'
  }

  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED' ||
    msg.toLowerCase().includes('timeout') ||
    msg.includes('ERR_CONNECTION_TIMED_OUT')
  ) {
    return '企微授权接口响应超时，请检查对应企微实例及其网络连接后重试'
  }

  if (code === 'ENOTFOUND' || msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
    return '企微授权请求地址解析失败，请检查企微接口配置'
  }

  if (error?.response?.data?.msg) {
    return error.response.data.msg
  }
  if (error?.response?.status === 404) {
    return '企微授权接口未找到，请确认当前注入工具支持 /polarBear 接口'
  }

  if (isAuthNetworkError(msg)) {
    return '企微授权接口连接异常，请检查企微实例状态后右键「刷新授权」'
  }

  return msg ? `获取授权信息失败：${msg}` : '获取授权信息失败，请稍后重试'
}

/** 查询失败时的占位 expire，区别于「未授权」 */
const AUTH_FETCH_FAILED_EXPIRE = '查询失败'

module.exports = {
  AUTH_FETCH_FAILED_EXPIRE,
  formatAuthFetchError,
  isAuthNetworkError
}
