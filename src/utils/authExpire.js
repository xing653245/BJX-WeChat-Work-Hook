/** 授权到期时间特殊状态（与后端 authFetchError 保持一致） */
export const AUTH_FETCH_FAILED_EXPIRE = '查询失败'

export function parseAuthPayloadFromFetchResult(result) {
  if (result?.success && result.data?.data) {
    return result.data.data
  }
  return null
}

export function parseExpireDate(expire) {
  if (!expire || expire === '未授权' || expire === AUTH_FETCH_FAILED_EXPIRE) {
    return null
  }
  const dt = new Date(String(expire).replace(/-/g, '/'))
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function isExpireNotExpired(expire) {
  const dt = parseExpireDate(expire)
  if (!dt) return false
  return new Date() <= dt
}

/** 仅有 active===true 且 expire 未到期时才算有授权 */
export function isAuthorizedAuthState(expire, authActive) {
  return authActive === true && isExpireNotExpired(expire)
}

/** 北极熊 getAuthInfo：仅 active===true 视为已激活 */
export function isAuthActiveFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return false
  return payload.active === true
}

/**
 * 根据授权服务器响应决定写入配置的 expire / auth_active
 * 网络失败时保留上次有效授权，避免误判为「未授权」
 */
export function resolveAuthFieldsAfterAuthFetch(result, prev = {}) {
  const payload = parseAuthPayloadFromFetchResult(result)
  if (payload) {
    const auth_active = isAuthActiveFromPayload(payload)
    const rawExpire = payload.expire || '未授权'
    const expire = isAuthorizedAuthState(rawExpire, auth_active) ? rawExpire : '未授权'
    return { expire, auth_active }
  }

  const previous = prev.expire || ''
  if (
    previous &&
    previous !== '未授权' &&
    previous !== AUTH_FETCH_FAILED_EXPIRE
  ) {
    const auth_active = prev.auth_active === true
    return {
      expire: isAuthorizedAuthState(previous, auth_active) ? previous : '未授权',
      auth_active
    }
  }

  return {
    expire: AUTH_FETCH_FAILED_EXPIRE,
    auth_active: prev.auth_active === true
  }
}

/**
 * @param {string} [prevExpire]
 */
export function resolveExpireAfterAuthFetch(result, prevExpire) {
  return resolveAuthFieldsAfterAuthFetch(result, { expire: prevExpire }).expire
}

export function isAuthFetchFailedExpire(expire) {
  return expire === AUTH_FETCH_FAILED_EXPIRE
}
