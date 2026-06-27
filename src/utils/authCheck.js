/**
 * 前端 ESM 封装：Vite 无法对 shared 下的 CJS 做命名导出，在此统一 re-export
 */
import authCheck from '../../electron/commons/authCheck.cjs'

export const AUTH_REASON = authCheck.AUTH_REASON
export const checkAuthExpire = authCheck.checkAuthExpire
export const checkAuthByPort = authCheck.checkAuthByPort
export const checkAuthByUserId = authCheck.checkAuthByUserId
export const isValidAuthDatetime = authCheck.validAuthDatetime
