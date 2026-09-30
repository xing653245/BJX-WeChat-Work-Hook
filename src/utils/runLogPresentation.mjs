import { userMessage } from './diagnostics.mjs'

// 仅用于用户日志展示；不改变业务消息和诊断记录。
export function presentRunLog({ content, type, system = false, apiName = '' }) {
  if (apiName) {
    const failed = /^(调用|操作)失败/.test(content)
    const succeeded = /^(调用|操作)成功$/.test(content.trim())
    const result = failed
      ? `操作失败：${userMessage(content.replace(/^(调用|操作)失败[:：]?\s*/, ''), '请稍后重试；如问题持续，请联系技术支持')}`
      : succeeded ? '操作成功' : userMessage(content, '操作结果暂未确认，请检查账号状态')
    return { type: '账号操作', message: `${apiName}：${result}`, level: failed ? 'error' : succeeded ? 'success' : 'info' }
  }
  if (system) {
    return { type: '系统提示', message: userMessage(content, '操作未完成，请稍后重试；如问题持续，请联系技术支持'),
      level: /失败|异常|错误|超时|ECONN|EACCES|EPERM|ENOENT|Error/.test(content) ? 'error'
        : /未授权|到期|暂停|占用/.test(content) ? 'warning' : 'info' }
  }
  // 用户实际聊天内容不做错误翻译，避免把消息正文误判成系统故障。
  return { type: type.replace(/未知消息(?:\([^)]*\))?/g, '其他消息'), message: content || '（无文本内容）', level: 'message' }
}
