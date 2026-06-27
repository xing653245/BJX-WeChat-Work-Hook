/**
 * 授权服务器请求错误提示（国内服务器，全局 VPN 可能导致不可达）
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
    return '无法连接授权服务器，请检查网络；若开启了全局 VPN/代理，请尝试关闭后重试'
  }

  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED' ||
    msg.toLowerCase().includes('timeout') ||
    msg.includes('ERR_CONNECTION_TIMED_OUT')
  ) {
    return '连接授权服务器超时，请检查网络；全局 VPN/代理 可能导致国内授权服务器不可达，请关闭代理后重试'
  }

  if (code === 'ENOTFOUND' || msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
    return '无法解析授权服务器地址，请检查网络或 DNS；若使用 VPN，请尝试切换节点或关闭代理'
  }

  if (error?.response?.status === 404) {
    return `账号在授权服务器上未找到，请确认已购买授权`
  }

  if (error?.response?.data?.msg) {
    return error.response.data.msg
  }

  if (isAuthNetworkError(msg)) {
    return '授权服务器网络不可达，请检查网络；若开启了 VPN/代理，请关闭后右键「刷新授权」'
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
