import { ElMessage } from 'element-plus'
import { createDiagnostics, userMessage } from './diagnostics.mjs'

export function createFeedback(source) {
  const diagnostics = createDiagnostics(source)
  const show = (level, code, input) => {
    const options = input instanceof Error ? { message: input.message } : input && typeof input === 'object' ? { ...input } : { message: input }
    const message = userMessage(options.message)
    diagnostics[level === 'warning' ? 'warn' : 'error'](code, message, input)
    return ElMessage[level]({ ...options, message, dangerouslyUseHTMLString: false, grouping: true })
  }
  return { error: (code, input) => show('error', code, input), warning: (code, input) => show('warning', code, input) }
}
