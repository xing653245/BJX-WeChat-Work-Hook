// 前端授权校验工具：根据端口在配置中查找授权到期时间
import { useConfigStore } from '../stores/config'
import {
  AUTH_REASON,
  checkAuthByPort,
  checkAuthExpire,
  isValidAuthDatetime
} from './authCheck.js'

export { AUTH_REASON, isValidAuthDatetime, checkAuthExpire }
/**
 * 根据端口获取对应账号的授权到期时间
 */
export const getExpireByPort = (port) => {
  if (!port) return '未授权'
  const configStore = useConfigStore()
  const loginInfoList = configStore.getLoginInfo()
  const numericPort = Number(port)
  const item = loginInfoList.find((it) => Number(it.port) === numericPort)
  return item?.expire || '未授权'
}

/**
 * 通用授权校验：根据端口检查是否已授权
 * 未授权时抛出带具体原因的错误，由上层捕获并提示
 */
export const ensureAuthorizedByPort = (port) => {
  const configStore = useConfigStore()
  const loginInfoList = configStore.getLoginInfo()
  const authResult = checkAuthByPort(port, loginInfoList)

  if (!authResult.valid) {
    const error = new Error(authResult.message)
    error.code = 'NO_AUTH'
    error.reason = authResult.reason
    throw error
  }
}



