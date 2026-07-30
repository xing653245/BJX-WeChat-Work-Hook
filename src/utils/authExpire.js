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

/** 从授权/卡密响应中提取 card_key（有则返回，无则空串） */
export function pickCardKeyFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return ''

  const readKey = (value) =>
    typeof value === 'string' && value.trim() ? value.trim() : ''

  // getAuthInfo: data.data.card.card_key
  const fromCard = readKey(payload.card?.card_key)
  if (fromCard) return fromCard

  const fromTop = readKey(payload.card_key)
  if (fromTop) return fromTop

  const inner = payload.data
  if (inner && typeof inner === 'object') {
    const fromInnerCard = readKey(inner.card?.card_key)
    if (fromInnerCard) return fromInnerCard
    const fromInner = readKey(inner.card_key)
    if (fromInner) return fromInner
  }

  return ''
}

/**
 * 根据授权服务器响应决定写入配置的 expire / auth_active / card_key
 * 网络失败时保留上次有效授权，避免误判为「未授权」
 */
export function resolveAuthFieldsAfterAuthFetch(result, prev = {}) {
  const payload = parseAuthPayloadFromFetchResult(result)
  if (payload) {
    const auth_active = isAuthActiveFromPayload(payload)
    const rawExpire = payload.expire || '未授权'
    const expire = isAuthorizedAuthState(rawExpire, auth_active) ? rawExpire : '未授权'
    const fromServer = pickCardKeyFromPayload(payload)
    const card_key = fromServer || (typeof prev.card_key === 'string' ? prev.card_key : '') || ''
    return { expire, auth_active, card_key }
  }

  const previous = prev.expire || ''
  const prevCardKey = typeof prev.card_key === 'string' ? prev.card_key : ''
  if (
    previous &&
    previous !== '未授权' &&
    previous !== AUTH_FETCH_FAILED_EXPIRE
  ) {
    const auth_active = prev.auth_active === true
    return {
      expire: isAuthorizedAuthState(previous, auth_active) ? previous : '未授权',
      auth_active,
      card_key: prevCardKey
    }
  }

  return {
    expire: AUTH_FETCH_FAILED_EXPIRE,
    auth_active: prev.auth_active === true,
    card_key: prevCardKey
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
