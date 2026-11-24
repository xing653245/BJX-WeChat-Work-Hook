/** 应用诊断输出：来源编号 + 可读说明，错误对象只保留排错所需信息。 */
let diagnosticSink = null
let consoleDiagnosticsEnabled = true
function setConsoleDiagnosticsEnabled(enabled) { consoleDiagnosticsEnabled = enabled }
function setDiagnosticSink(sink) { diagnosticSink = sink }
const internalDetails = /(?:[A-Za-z]:[\\/]|file:\/\/|\bat\s+\S+\s*\(|\.(?:vue|cjs|mjs|js):\d|\b(?:TypeError|ReferenceError|SyntaxError|IPC|stack|errno|exitCode)\b|#(?:L|U)\d{3}|\btype\s*[=:]\s*\d|\b(?:src|electron|node_modules)[\\/]|\{\s*"|\bHook\b)/i
const rawErrorCode = /\b(?:E[A-Z0-9_]{2,}|TypeError|ReferenceError|SyntaxError|Hook|IPC)\b/
function redactText(value, maxLength = 6000) {
  return String(value)
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, '[私钥已隐藏]')
    .replace(/((?:card_key|password|token|secret|authorization|private_key|public_key|RSA_PublicKey)["']?\s*[=:]\s*)(?:["'][^"']*["']|[^\s,;]+)/gi, '$1[已隐藏]')
    .slice(0, maxLength)
}

function safeDetail(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === 'string') return redactText(value)
  if (value == null || typeof value !== 'object') return value
  if (seen.has(value)) return '[循环引用]'
  if (depth > 4) return '[内容已省略]'
  seen.add(value)
  if (value instanceof Error) {
    return { name: value.name, code: value.code, message: redactText(value.message), stack: redactText(value.stack || '') }
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(item => safeDetail(item, seen, depth + 1))
  const result = {}
  for (const key of Object.keys(value).slice(0, 30)) {
    result[key] = /card.?key|password|token|secret|authorization|private.?key|public.?key|login_info|headers|request|config/i.test(key)
      ? '[已隐藏]' : safeDetail(value[key], seen, depth + 1)
  }
  return result
}

// 两端保持相同的错误分类。只陈述错误文本能够确认的事实，不把未确认的其他原因写进同一句。
function classifyError(value) {
  const raw = value?.message ?? value?.msg ?? value
  const text = typeof raw === 'string' ? raw.trim() : ''
  const evidence = [value?.code, value?.name, text].filter(item => typeof item === 'string').join(' ')
  const localPort = text.match(/(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})\b/)?.[1]
  const portHint = localPort && Number(localPort) <= 65535 ? '（本地端口 ' + localPort + '）' : ''
  if (/EADDRINUSE|address already in use/i.test(evidence)) return '监听端口已被占用' + portHint
  if (/ECONNREFUSED/i.test(evidence)) return '连接被拒绝' + portHint + '，目标没有接受连接'
  if (/ETIMEDOUT|ERR_(?:CONNECTION_)?TIMED_OUT|timeout of \d+\s*ms exceeded/i.test(evidence)) return '等待响应超时' + portHint + '，对方未在规定时间内返回'
  if (/timed?\s*out|\btimeout\b/i.test(evidence)) return '操作超时，未在规定时间内完成'
  if (/ECONNABORTED/i.test(evidence)) return '请求在完成前被中止'
  if (/ERR_CANCELED|AbortError/i.test(evidence)) return '请求已被取消'
  if (/ENOTFOUND|ERR_NAME_NOT_RESOLVED/i.test(evidence)) return '无法解析目标地址'
  if (/EAI_AGAIN/i.test(evidence)) return '域名解析暂时失败'
  if (/getaddrinfo/i.test(evidence)) return '地址解析失败'
  if (/ECONNRESET|ERR_CONNECTION_RESET/i.test(evidence)) return '连接被对方重置' + portHint
  if (/\bEPIPE\b/i.test(evidence)) return '连接已关闭，数据未能送出'
  if (/socket hang up/i.test(evidence)) return '连接在收到完整响应前被关闭'
  if (/ERR_CONNECTION_CLOSED/i.test(evidence)) return '连接在完成前被关闭'
  if (/ERR_NETWORK_CHANGED/i.test(evidence)) return '请求期间网络发生了变化'
  if (/ERR_INTERNET_DISCONNECTED/i.test(evidence)) return '本机网络已断开'
  if (/ENETUNREACH/i.test(evidence)) return '当前网络无法到达目标'
  if (/EHOSTUNREACH/i.test(evidence)) return '目标主机不可达'
  if (/ERR_PROXY_CONNECTION_FAILED/i.test(evidence)) return '无法连接代理服务器'
  if (/ERR_TUNNEL_CONNECTION_FAILED/i.test(evidence)) return '代理隧道建立失败'
  if (/ERR_PROXY_CERTIFICATE_INVALID/i.test(evidence)) return '代理服务器证书无效'
  if (/ERR_PROXY_AUTH_UNSUPPORTED/i.test(evidence)) return '代理服务器要求的认证方式不受支持'
  if (/ERR_NO_SUPPORTED_PROXIES/i.test(evidence)) return '没有可用的受支持代理'
  if (/ERR_PROXY_/i.test(evidence)) return '代理请求失败，请按故障报告中的具体代理错误码排查'
  if (/\bERR_NETWORK\b|Network Error|Failed to fetch/i.test(evidence)) return '网络请求没有得到响应'
  if (/CERT_HAS_EXPIRED/i.test(evidence)) return '安全证书已过期'
  if (/DEPTH_ZERO_SELF_SIGNED_CERT/i.test(evidence)) return '对方使用自签名证书，校验未通过'
  if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE/i.test(evidence)) return '无法验证对方证书'
  if (/ERR_TLS|ERR_CERT_/i.test(evidence)) return '安全连接的证书校验未通过'
  if (/ENOSPC/i.test(evidence)) return '磁盘空间不足，无法继续写入'
  if (/\bEACCES\b|access is denied/i.test(evidence)) return '没有访问权限'
  if (/\bEPERM\b|permission denied/i.test(evidence)) return '系统拒绝了该操作'
  if (/EBUSY|resource busy/i.test(evidence)) return '文件或资源正被其他程序占用'
  if (/EROFS/i.test(evidence)) return '目标位置只读，无法写入'
  if (/\bEIO\b/i.test(evidence)) return '读写时发生磁盘错误'
  if (/\bEISDIR\b/i.test(evidence)) return '指定的是文件夹，请选择完整的文件路径'
  if (/\bENOTDIR\b/i.test(evidence)) return '路径中的某一级不是文件夹'
  if (/\bEEXIST\b/i.test(evidence)) return '目标已存在，无法重复创建'
  if (/注入工具不存在/i.test(evidence)) return '注入工具文件不存在'
  if (/spawn\s+.*ENOENT/i.test(evidence)) return '要启动的程序不存在'
  if (/(?:it\.exe|BJX(?:Bridge)?\.dll).*not found/i.test(evidence)) return '启动所需组件文件不存在'
  if (/ENOENT/i.test(evidence)) return '所需路径不存在'
  if (/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/i.test(evidence)) return '应用运行所需模块缺失'
  const statusValue = value?.response?.status ?? value?.status
  const status = Number(statusValue || text.match(/(?:status(?:\s+code)?|HTTP)[\s:：=（(]*(\d{3})\b/i)?.[1])
  if (status >= 400 && status <= 599) {
    const advice = {
      400: '请求参数无效',
      401: '认证未通过',
      403: '拒绝访问',
      404: '目标接口不存在',
      408: '服务处理超时',
      409: '与服务当前状态冲突',
      413: '提交的数据过大',
      422: '请求内容未通过校验',
      429: '请求过于频繁',
      500: '服务内部处理出错',
      502: '网关没有收到上游的有效响应',
      503: '服务暂时不可用',
      504: '网关等待上游响应超时'
    }[status] || (status < 500 ? '请求被拒绝' : '处理失败')
    return '服务返回 HTTP ' + status + '：' + advice
  }
  if (/TypeError\b|Cannot read propert|is not a function/i.test(evidence)) return '程序处理数据时发生类型错误'
  if (/ReferenceError\b|is not defined/i.test(evidence)) return '程序引用了不存在的内容'
  if (/SyntaxError\b|Unexpected token|Unexpected end of JSON|JSON\s*(?:格式|解析).*(?:失败|错误|无效)|JSON.*(?:parse|invalid)/i.test(evidence)) return '收到的内容不是合法的数据格式'
  if (/宿主文件校验失败/i.test(evidence)) return '企微客户端文件校验未通过'
  if (/设置目标环境失败/i.test(evidence)) return '设置企微启动环境失败'
  if (/加载日志 DLL 失败/i.test(evidence)) return '加载企微日志组件失败'
  if (/不支持.*(?:客户端|企微).*版本|(?:客户端|企微).*版本.*不支持|unsupported.*version/i.test(evidence)) return '当前企微客户端版本不受支持'
  if (/注入失败|inject(?:ion)?\s+failed/i.test(evidence)) return '企微注入失败'
  if (/\bHook\b.*\btype\s*[=:]\s*\d+.*(?:fail|error)/i.test(evidence)) return '企微接口调用失败'
  if (/\bHook\b.*(?:fail|error)/i.test(evidence)) return '企微组件执行失败'
  if (/exitCode\s*[=:]\s*-?\d+|process exited|注入进程退出码/i.test(evidence)) return '启动进程异常退出'
  if (/Electron\s*API\s*不可用|无法调用 Electron 接口/i.test(evidence)) return '界面无法调用后台接口'
  if (/No handler registered/i.test(evidence)) return '没有对应的后台处理'
  return ''
}

function friendlyMessage(value, fallback = '操作未完成，请稍后重试') {
  const raw = value?.message ?? value?.msg ?? value
  const text = typeof raw === 'string' ? raw.trim().replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/, '').replace(/^Error:\s*/, '') : ''
  // 已有可读业务说明时保留具体原因和各分项，不从整段文字抽取第一个 HTTP 状态覆盖它。
  if (/[\u3400-\u9fff]/.test(text) && !internalDetails.test(text) &&
      !rawErrorCode.test([value?.code, value?.name, text].filter(Boolean).join(' '))) return redactText(text).slice(0, 2000)
  const reason = classifyError(value)
  if (reason) return reason
  return text ? redactText(text).slice(0, 500) : fallback
}

function createDiagnostics(source, output = console) {
  const write = (level, code, message, ...details) => {
    const important = level === 'important'
    if (important) level = 'info'
    const prefix = `[${source}#${code}]`
    const summary = level === 'error' || level === 'warn' ? friendlyMessage(message) : redactText(message)
    const extra = summary !== String(message) ? [message, ...details] : details
    const method = output[level] || output.log
    if (consoleDiagnosticsEnabled && (important || level === 'warn' || level === 'error')) {
      method.call(output, important ? summary : `${prefix} ${summary}`, ...extra.map(value => safeDetail(value)))
    }
    if (level === 'warn' || level === 'error') {
      const record = { source, code, level, message: summary, details: extra.map(value => safeDetail(value)) }
      try {
        if (diagnosticSink) diagnosticSink(record)
        else if (typeof window !== 'undefined') window.electronAPI?.writeDiagnostic?.(record)
      } catch { /* 诊断记录失败不影响业务 */ }
    }
  }
  return Object.fromEntries(['important', 'info', 'warn', 'error', 'debug'].map(level => [level, (...args) => write(level, ...args)]))
}

/** 用户界面显示可确认的原因和建议，不回显路径、堆栈及密钥。 */
function userMessage(value, fallback = '操作失败，未能识别具体原因；请在运行日志中导出故障报告并联系技术支持') {
  const text = friendlyMessage(value, fallback)
  if (internalDetails.test(text)) return fallback
  if (/^(?:操作未完成|操作失败|启动失败|更新失败|读取失败|failure|failed|unknown error)(?:[，,；;].*)?$/i.test(text)) return fallback
  if (!/[\u3400-\u9fff]/.test(text)) return fallback
  return text
}

module.exports = { createDiagnostics, friendlyMessage, userMessage, safeDetail, redactText, setDiagnosticSink, setConsoleDiagnosticsEnabled }
