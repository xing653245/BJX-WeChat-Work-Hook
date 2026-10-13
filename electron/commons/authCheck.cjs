/**
 * 授权校验（前后端共用，CommonJS）
 * 返回具体失败原因，便于向用户展示可操作的提示
 */

const AUTH_REASON = {
  OK: 'OK',
  PORT_NOT_FOUND: 'PORT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  DEACTIVATED: 'DEACTIVATED',
  AUTH_FETCH_FAILED: 'AUTH_FETCH_FAILED',
  EXPIRED: 'EXPIRED',
  INVALID_DATE: 'INVALID_DATE'
}

const { AUTH_FETCH_FAILED_EXPIRE } = require('./authFetchError')

function parseExpireDate(expire) {
  if (!expire || expire === '未授权' || expire === AUTH_FETCH_FAILED_EXPIRE) {
    return null
  }
  const dt = new Date(String(expire).replace(/-/g, '/'))
  return Number.isNaN(dt.getTime()) ? null : dt
}

function isExpireNotExpired(expire) {
  const dt = parseExpireDate(expire)
  if (!dt) return false
  return new Date() <= dt
}

/** 仅有 active===true 且 expire 未到期时才算有授权 */
function isAuthorizedAuthState(expire, authActive) {
  return authActive === true && isExpireNotExpired(expire)
}

/**
 * @param {string} expire - 授权到期时间或「未授权」
 * @param {{ port?: string|number, userId?: string, nickName?: string, auth_active?: boolean }} [ctx]
 */
function checkAuthExpire(expire, ctx = {}) {
  const accountHint = buildAccountHint(ctx)

  if (expire === AUTH_FETCH_FAILED_EXPIRE) {
    return {
      valid: false,
      reason: AUTH_REASON.AUTH_FETCH_FAILED,
      message: `${accountHint}授权状态未能确认（网络或代理异常），请关闭 VPN/代理 或检查网络后右键「刷新授权」`
    }
  }

  if (isAuthorizedAuthState(expire, ctx.auth_active)) {
    return {
      valid: true,
      reason: AUTH_REASON.OK,
      message: '',
      expire
    }
  }

  if (ctx.auth_active === false) {
    return {
      valid: false,
      reason: AUTH_REASON.DEACTIVATED,
      message: `${accountHint}授权已被管理员停用，请联系管理员在后台开启激活后右键「刷新授权」`
    }
  }

  if (!expire || expire === '未授权') {
    return {
      valid: false,
      reason: AUTH_REASON.NOT_AUTHORIZED,
      message: `${accountHint}尚未写入授权信息，请在「企微管理」中右键企微ID选择「刷新授权」`
    }
  }

  const dt = new Date(String(expire).replace(/-/g, '/'))
  if (Number.isNaN(dt.getTime())) {
    return {
      valid: false,
      reason: AUTH_REASON.INVALID_DATE,
      message: `${accountHint}授权时间格式异常（${expire}），请右键「刷新授权」`
    }
  }

  const now = new Date()
  if (now > dt) {
    return {
      valid: false,
      reason: AUTH_REASON.EXPIRED,
      message: `${accountHint}授权已于 ${expire} 到期，请购买/续费后右键「刷新授权」`
    }
  }

  return {
    valid: false,
    reason: AUTH_REASON.NOT_AUTHORIZED,
    message: `${accountHint}授权未激活或状态未确认，请在「企微管理」中右键「刷新授权」`
  }
}

/**
 * @param {string|number} port
 * @param {Array} loginInfoList
 */
function checkAuthByPort(port, loginInfoList) {
  if (!port && port !== 0) {
    return {
      valid: false,
      reason: AUTH_REASON.PORT_NOT_FOUND,
      message: '未指定企微端口，无法校验授权'
    }
  }

  const list = Array.isArray(loginInfoList) ? loginInfoList : []
  const target = list.find((item) => String(item.port) === String(port))

  if (!target) {
    return {
      valid: false,
      reason: AUTH_REASON.PORT_NOT_FOUND,
      message: `端口 ${port} 未在本地配置中找到对应账号，请在「企微管理」中重新添加或右键「刷新授权」`
    }
  }

  return checkAuthExpire(target.expire, {
    port,
    userId: target.user_id,
    nickName: target.nick_name,
    auth_active: target.auth_active
  })
}

/**
 * @param {string} userId
 * @param {Array} loginInfoList
 */
function checkAuthByUserId(userId, loginInfoList) {
  if (!userId || userId === 'unknown') {
    return { valid: true, reason: AUTH_REASON.OK, message: '' }
  }

  const list = Array.isArray(loginInfoList) ? loginInfoList : []
  const target = list.find((item) => item.user_id === userId)

  if (!target) {
    return {
      valid: false,
      reason: AUTH_REASON.USER_NOT_FOUND,
      message: `账号 ${userId} 未在本地配置中找到，请在「企微管理」中右键「刷新授权」`
    }
  }

  return checkAuthExpire(target.expire, {
    port: target.port,
    userId: target.user_id,
    nickName: target.nick_name,
    auth_active: target.auth_active
  })
}

function buildAccountHint(ctx) {
  const { nickName, userId, port } = ctx
  if (nickName && nickName !== '-') {
    return `账号「${nickName}」`
  }
  if (userId && userId !== '-') {
    return `账号(${userId})`
  }
  if (port) {
    return `端口 ${port} 对应账号`
  }
  return '当前账号'
}

function validAuthDatetime(dateStr, authActive) {
  return checkAuthExpire(dateStr, { auth_active: authActive }).valid
}

module.exports = {
  checkAuthByPort,
  checkAuthByUserId,
  validAuthDatetime,
  isAuthorizedAuthState
}
