import { ElMessage } from 'element-plus'
import { createDiagnostics, userMessage } from './diagnostics.mjs'

// 相同编号在不同页面可能对应不同操作，因此按来源和编号共同定位。
const actions = {
  'pages/VWorkManagerPage.vue': {
    U002: '添加企微', U003: '分配企微端口', U006: '添加企微', U007: '添加企微',
    U021: '授权绑定或取消', U022: '授权绑定或取消', U026: '授权迁移', U027: '迁移后解绑', U028: '授权迁移',
    U029: '读取授权信息', U033: '读取授权信息', U034: '读取授权信息', U035: '退出企微', U036: '检测企微'
  },
  'pages/SettingsPage.vue': {
    C002: '读取企微实例', C003: '更新实例设置', P001: '保存偏好', U001: '读取客户端路径',
    U003: '测试接口', U008: '测试接口', U009: '测试接口', U012: '检查更新', U013: '下载更新',
    U014: '下载更新', U015: '安装更新', U016: '安装更新', U017: '应用更新',
    U023: '保存客户端路径', U024: '查找客户端路径'
  },
  'pages/RunLogsPage.vue': {
    U003: '读取文件日志', U004: '读取文件日志', U006: '打开日志目录',
    U009: '导出故障报告', U010: '导出故障报告', U011: '复制日志', U012: '打开日志目录'
  },
  'utils/api.js': { U001: '读取接口授权', U002: '调用企微接口' }
}

export function createFeedback(source) {
  const diagnostics = createDiagnostics(source)
  const show = (level, code, input) => {
    const options = input instanceof Error ? { message: input.message } : input && typeof input === 'object' ? { ...input } : { message: input }
    const action = actions[source]?.[code]
    const fallback = '未能识别具体原因，请在运行日志中导出故障报告并联系技术支持'
    const reason = userMessage(input instanceof Error ? input : options, fallback)
    const original = typeof options.message === 'string' ? options.message.trim().replace(/^Error:\s*/, '') : ''
    // 原本清晰的业务说明直接保留，避免把“检测成功但尚未接入”等提醒说成检测失败。
    const message = action && reason !== original && !reason.startsWith(action) ? `${action}失败：${reason}` : reason
    diagnostics[level === 'warning' ? 'warn' : 'error'](code, message, input)
    return ElMessage[level]({ ...options, message, dangerouslyUseHTMLString: false, grouping: true })
  }
  return { error: (code, input) => show('error', code, input), warning: (code, input) => show('warning', code, input) }
}
