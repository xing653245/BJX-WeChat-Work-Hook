/**
 * 通过本地企微请求授权时的错误提示
 */
const { userMessage } = require('./diagnostics.cjs')

function normalizeAuthErrorMessage(error) {
  return String(error?.message || error || '').trim()
}

function pickAuthServiceMessage(data) {
  if (!data || typeof data !== 'object') return ''
  for (const key of ['msg', 'message', 'detail']) {
    if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim()
    if (Array.isArray(data[key]) && typeof data[key][0]?.msg === 'string') return data[key][0].msg.trim()
  }
  return ''
}

function formatAuthFetchError(error) {
  const msg = normalizeAuthErrorMessage(error)
  const code = String(error?.code || '')
  const lower = msg.toLowerCase()
  const has = token => code === token || lower.includes(token.toLowerCase())

  const status = Number(error?.response?.status)
  if (code === 'AUTH_RESPONSE_INVALID') return '企微授权接口没有返回有效的授权数据，请核对接口版本并导出故障报告'
  if (code === 'AUTH_BUSINESS_FAILED' || (status >= 400 && status <= 599)) {
    const serviceCode = error?.response?.data?.code
    const codeText = /^(?:[A-Z][A-Z0-9_.-]{0,63}|\d{1,10})$/.test(String(serviceCode ?? '')) ? String(serviceCode) : ''
    const serviceMessage = pickAuthServiceMessage(error?.response?.data)
    const detail = serviceMessage ? userMessage(`服务端说明：${serviceMessage}`, '') : ''
    const reason = code === 'AUTH_BUSINESS_FAILED' ? '企微授权请求被服务端拒绝'
      : status === 401 ? '企微授权接口认证未通过'
        : status === 403 ? '企微授权接口拒绝访问'
          : status === 404 ? '企微授权请求地址未找到' : '企微授权接口请求失败'
    const statusHint = code === 'AUTH_BUSINESS_FAILED' ? `HTTP 状态 ${status}，业务码 ${codeText || '未提供'}`
      : `状态码 ${status}${codeText ? `，服务端代码 ${codeText}` : ''}`
    const nextStep = status === 404 ? '请核对实例端口、接口路径和组件版本'
      : '请根据服务端说明处理；原因不明时请导出故障报告'
    return `${reason}（${statusHint}）${detail ? `：${detail}` : `，${nextStep}`}`
  }

  if (has('ECONNREFUSED')) return '企微授权接口拒绝连接，目标端口没有接受此次连接'
  if (has('ETIMEDOUT') || has('ERR_CONNECTION_TIMED_OUT') || lower.includes('timeout')) return '企微授权接口在超时时间内没有响应'
  if (has('ECONNABORTED')) return '企微授权请求在完成前被中止'
  if (has('EAI_AGAIN')) return '企微授权地址解析暂时失败'
  if (has('ENOTFOUND') || has('ERR_NAME_NOT_RESOLVED') || lower.includes('getaddrinfo')) return '企微授权地址无法解析'
  if (has('ECONNRESET') || has('ERR_CONNECTION_RESET')) return '企微授权连接被对方重置'
  if (lower.includes('socket hang up')) return '企微授权连接在收到完整响应前被关闭'
  if (has('ERR_INTERNET_DISCONNECTED')) return '本机网络已断开，无法查询企微授权'
  if (has('ENETUNREACH')) return '当前网络无法到达企微授权接口'
  if (has('EHOSTUNREACH')) return '企微授权接口所在主机不可达'
  if (has('ERR_NETWORK_CHANGED')) return '查询企微授权时网络发生了变化'
  if (lower.includes('network error')) return '企微授权请求没有得到响应'

  const translated = userMessage(error, '')
  return translated ? `企微授权请求失败：${translated}` : msg
    ? '获取授权信息失败，未能识别具体原因，请导出故障报告'
    : '获取授权信息失败，接口没有返回具体原因'
}

/** 查询失败时的占位 expire，区别于「未授权」 */
const AUTH_FETCH_FAILED_EXPIRE = '查询失败'

module.exports = {
  AUTH_FETCH_FAILED_EXPIRE,
  pickAuthServiceMessage,
  formatAuthFetchError
}
