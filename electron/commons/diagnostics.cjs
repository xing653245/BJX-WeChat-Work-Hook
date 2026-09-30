/** 应用诊断输出：来源编号 + 可读说明，错误对象只保留排错所需信息。 */
let diagnosticSink = null
let consoleDiagnosticsEnabled = true
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

function friendlyMessage(value, fallback = '操作未完成，请稍后重试') {
  const raw = value?.message ?? value
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return fallback
  if (/EADDRINUSE|address already in use/i.test(text)) return '监听端口已被占用，请关闭重复运行的服务或更换端口'
  if (/ECONNREFUSED/i.test(text)) return '无法连接目标服务，请确认对应企微或回调服务已启动，并检查端口'
  if (/ETIMEDOUT|ECONNABORTED|timeout/i.test(text)) return '请求超时，请检查服务状态和网络连接后重试'
  if (/ENOTFOUND|getaddrinfo/i.test(text)) return '无法解析服务地址，请检查地址和网络设置'
  if (/EACCES|EPERM/i.test(text)) return '没有操作权限，请检查文件访问权限或目标进程状态'
  if (/ENOENT/i.test(text)) return '所需文件不存在，请检查配置路径或重新安装应用'
  if (/Request failed with status code/i.test(text)) return `服务返回异常状态（${text.match(/\d{3}/)?.[0] || '未知'}），请查看诊断记录`
  if (/Electron API不可用|Electron API 不可用/.test(text)) return '应用通信尚未就绪，请重启框架后重试'
  if (/^Error:|TypeError:|SyntaxError:/.test(text)) return fallback
  return redactText(text).slice(0, 500)
}

function createDiagnostics(source, output = console) {
  const write = (level, code, message, ...details) => {
    const prefix = `[${source}#${code}]`
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

/** 用户界面只展示处理建议，不回显开发诊断、路径和堆栈。 */
function userMessage(value, fallback = '操作未完成，请稍后重试；如问题持续出现，请联系技术支持') {
  const text = friendlyMessage(value, fallback)
  if (/请查看诊断记录/.test(text)) return '服务暂时无法完成请求，请稍后重试；如问题持续出现，请联系技术支持'
  if (/(?:[A-Za-z]:[\\/]|file:\/\/|\bat\s+\S+\s*\(|\.(?:vue|cjs|mjs|js):\d|\b(?:TypeError|ReferenceError|SyntaxError|IPC|stack|errno|exitCode)\b|#(?:L|U)\d{3}|\btype\s*[=:]\s*\d|\b(?:src|electron|node_modules)[\\/]|\{\s*"|\bHook\b)/i.test(text)) return fallback
  if (!/[\u3400-\u9fff]/.test(text)) return fallback
  return text
}

module.exports = { createDiagnostics, friendlyMessage, userMessage, safeDetail, redactText, setDiagnosticSink, setConsoleDiagnosticsEnabled }
