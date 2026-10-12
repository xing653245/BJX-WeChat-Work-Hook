import { createFeedback } from './feedback.mjs'
import { AUTH_REASON } from './authCheck.js'

const feedback = createFeedback('utils/api.js')

// 只调用框架界面固定使用的操作；用户程序直接调用企微实例端口。
async function callFrameworkWecom(port, data) {
  if (!window.electronAPI?.callFrameworkWecom) throw new Error('Electron API不可用')
  const result = await window.electronAPI.callFrameworkWecom({ port, ...data })
  if (!result?.success) {
    const error = Object.assign(new Error(result?.msg || '企微调用失败'), { code: result?.code, reason: result?.reason })
    if (error.code === 'NO_AUTH') {
      if (error.reason === AUTH_REASON.AUTH_FETCH_FAILED) feedback.warning('U001', error.message)
      else feedback.error('U002', error.message)
    }
    throw error
  }
  return result.data
}

export class VWorkApi {
  static getLoginStatus(port) { return callFrameworkWecom(port, { type: 1000 }) }
  static getPersonalInfo(port) { return callFrameworkWecom(port, { type: 1002 }) }
  static logout(port) { return callFrameworkWecom(port, { type: 1003 }) }
  static disableAutoUpdate(port) { return callFrameworkWecom(port, { type: 7000, state: 0 }) }
  static sendTestText(port, user_id, msg) { return callFrameworkWecom(port, { type: 3000, user_id, msg }) }
}
