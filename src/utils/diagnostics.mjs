/** 应用诊断输出：来源编号 + 可读说明，错误对象只保留排错所需信息。 */
let diagnosticSink = null
let consoleDiagnosticsEnabled = import.meta.env?.DEV ?? false
function setConsoleDiagnosticsEnabled(enabled) { consoleDiagnosticsEnabled = enabled }
function setDiagnosticSink(sink) { diagnosticSink = sink }
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

// 两端保持相同的错误分类；不能从错误文本确认的原因不作推断。
function classifyError(value) {
  const raw = value?.message ?? value?.msg ?? value
  const text = typeof raw === 'string' ? raw.trim() : ''
  const evidence = [value?.code, value?.name, text].filter(item => typeof item === 'string').join(' ')
  const localPort = text.match(/(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})\b/)?.[1]
  const portHint = localPort && Number(localPort) <= 65535 ? '（本地端口 ' + localPort + '）' : ''
  if (/EADDRINUSE|address already in use/i.test(evidence)) return '监听端口已被占用，请关闭重复运行的服务或更换端口'
  if (/ECONNREFUSED/i.test(evidence)) return '无法连接目标服务' + portHint + '，连接被拒绝；请确认对应企微或回调服务已启动、接口已就绪，并检查端口'
  if (/ETIMEDOUT|ECONNABORTED|ERR_CONNECTION_TIMED_OUT|timed?\s*out|timeout/i.test(evidence)) return '请求超时，目标服务未在规定时间内响应；请检查服务状态和网络连接后重试'
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|ERR_NAME_NOT_RESOLVED/i.test(evidence)) return '无法解析服务地址，请检查地址和网络设置'
  if (/ECONNRESET|EPIPE|socket hang up|ERR_CONNECTION_RESET/i.test(evidence)) return '连接被中断或重置，请检查目标服务是否退出或重启，并检查网络连接'
  if (/ERR_NETWORK|Network Error|Failed to fetch|ERR_INTERNET_DISCONNECTED|ENETUNREACH|EHOSTUNREACH/i.test(evidence)) return '网络请求失败或目标地址不可达，请检查网络、代理和目标服务状态'
  if (/CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|ERR_TLS|ERR_CERT_/i.test(evidence)) return '安全连接证书校验失败，请检查系统时间及服务证书配置'
  if (/ENOSPC/i.test(evidence)) return '磁盘空间不足，请清理空间或更换保存位置'
  if (/EACCES|EPERM|access is denied|permission denied/i.test(evidence)) return '没有操作权限，请检查文件访问权限或目标进程状态'
  if (/EBUSY|resource busy/i.test(evidence)) return '文件或资源被占用，请关闭占用程序后重试'
  if (/EROFS/i.test(evidence)) return '保存位置为只读，请更换可写入的目录'
  if (/EIO\b/i.test(evidence)) return '磁盘读写失败，请检查磁盘状态或更换保存位置'
  if (/注入工具不存在|spawn\s+.*ENOENT|(?:it\.exe|BJX(?:Bridge)?\.dll).*not found/i.test(evidence)) return '启动组件缺失或路径无效，请检查框架安装是否完整及客户端路径设置'
  if (/ENOENT/i.test(evidence)) return '所需文件不存在，请检查配置路径或重新安装应用'
  if (/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/i.test(evidence)) return '应用运行组件缺失，请重新安装完整框架后重试'
  const statusValue = value?.response?.status ?? value?.status
  const status = Number(statusValue || text.match(/(?:status(?:\s+code)?|HTTP)[\s:：=（(]*(\d{3})\b/i)?.[1])
  if (status >= 400 && status <= 599) {
    const advice = {
      400: '请求参数无效，请检查填写内容',
      401: '请求认证未通过，请检查当前登录状态和认证配置',
      403: '服务拒绝访问，请确认当前账号及接口的访问权限',
      404: '目标接口不存在，请检查服务地址、端口及客户端版本',
      408: '服务处理请求超时，请稍后重试',
      409: '请求与服务当前状态冲突，请刷新状态后重试',
      413: '提交的数据过大，请缩小内容后重试',
      422: '请求内容未通过校验，请检查必填字段及格式',
      429: '请求过于频繁，请稍候再试',
      500: '服务内部处理异常，请稍后重试；持续出现请联系技术支持',
      502: '网关无法取得上游服务的有效响应，请检查上游服务状态',
      503: '服务暂时不可用，请确认服务已启动或稍后重试',
      504: '网关等待上游服务响应超时，请检查上游服务状态'
    }[status] || (status < 500 ? '服务拒绝了请求，请检查请求内容和访问权限' : '服务处理请求失败，请稍后重试或联系技术支持')
    return '服务返回 HTTP ' + status + '：' + advice
  }
  if (/TypeError\b|Cannot read propert|is not a function/i.test(evidence)) return '应用处理数据时发生类型异常，请重新执行当前操作；持续出现请导出故障报告'
  if (/ReferenceError\b|is not defined/i.test(evidence)) return '应用内部引用异常，请重启框架；持续出现请导出故障报告'
  if (/SyntaxError\b|Unexpected token|Unexpected end of JSON|JSON\s*(?:格式|解析).*(?:失败|错误|无效)|JSON.*(?:parse|invalid)/i.test(evidence)) return '配置或服务返回的数据格式无效，请检查配置；持续出现请导出故障报告'
  if (/宿主文件校验失败/i.test(evidence)) return '企微客户端文件校验失败，请确认配置的客户端路径和版本正确、安装文件完整'
  if (/设置目标环境失败/i.test(evidence)) return '企微启动环境设置失败，请检查客户端路径和文件访问权限'
  if (/加载日志 DLL 失败/i.test(evidence)) return '企微启动组件加载失败，请检查框架安装文件是否完整'
  if (/不支持.*(?:客户端|企微).*版本|(?:客户端|企微).*版本.*不支持|unsupported.*version/i.test(evidence)) return '客户端版本不兼容，请使用框架支持的企微版本'
  if (/注入失败|\bHook\b.*(?:fail|error)|inject(?:ion)?\s+failed/i.test(evidence)) return '企微接入失败，请完全退出企微后从框架重新添加；持续失败请导出故障报告检查接入过程'
  if (/exitCode\s*[=:]\s*-?\d+|process exited|注入进程退出码/i.test(evidence)) return '启动进程异常退出，请检查客户端路径和安装文件；持续失败请导出故障报告'
  if (/Electron\s*API\s*不可用|无法调用 Electron 接口|No handler registered|\bIPC\b/i.test(evidence)) return '界面与后台通信失败，请重启框架后重试；持续出现请导出故障报告'
  return ''
}

function friendlyMessage(value, fallback = '操作未完成，请稍后重试') {
  const reason = classifyError(value)
  if (reason) return reason
  const raw = value?.message ?? value?.msg ?? value
  const text = typeof raw === 'string' ? raw.trim().replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/, '').replace(/^Error:\s*/, '') : ''
  return text ? redactText(text).slice(0, 500) : fallback
}

function createDiagnostics(source, output = console) {
  const write = (level, code, message, ...details) => {
    const prefix = `[${new Date().toISOString()}][${source}#${code}]`
    const summary = level === 'error' || level === 'warn' ? friendlyMessage(message) : redactText(message)
    const extra = summary !== String(message) ? [message, ...details] : details
    const method = output[level] || output.log
    if (consoleDiagnosticsEnabled) method.call(output, `${prefix} ${summary}`, ...extra.map(value => safeDetail(value)))
    if (level === 'warn' || level === 'error') {
      const record = { source, code, level, message: summary, details: extra.map(value => safeDetail(value)) }
      try {
        if (diagnosticSink) diagnosticSink(record)
        else if (typeof window !== 'undefined') window.electronAPI?.writeDiagnostic?.(record)
      } catch { /* 诊断记录失败不影响业务 */ }
    }
  }
  return Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, (...args) => write(level, ...args)]))
}

/** 用户界面显示可确认的原因和建议，不回显路径、堆栈及密钥。 */
function userMessage(value, fallback = '操作失败，未能识别具体原因；请在运行日志中导出故障报告并联系技术支持') {
  const text = friendlyMessage(value, fallback)
  if (/(?:[A-Za-z]:[\\/]|file:\/\/|\bat\s+\S+\s*\(|\.(?:vue|cjs|mjs|js):\d|\b(?:TypeError|ReferenceError|SyntaxError|IPC|stack|errno|exitCode)\b|#(?:L|U)\d{3}|\btype\s*[=:]\s*\d|\b(?:src|electron|node_modules)[\\/]|\{\s*"|\bHook\b)/i.test(text)) return fallback
  if (/^(?:操作未完成|操作失败|启动失败|更新失败|读取失败|failure|failed|unknown error)(?:[，,；;].*)?$/i.test(text)) return fallback
  if (!/[\u3400-\u9fff]/.test(text)) return fallback
  return text
}

export { createDiagnostics, friendlyMessage, userMessage, safeDetail, redactText, setDiagnosticSink, setConsoleDiagnosticsEnabled }
