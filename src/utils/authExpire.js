/** 授权到期时间特殊状态（与后端 authFetchError 保持一致） */
export const AUTH_FETCH_FAILED_EXPIRE = '查询失败'

/**
 * 根据授权服务器响应决定写入配置的 expire
 * 网络失败时保留上次有效授权，避免误判为「未授权」
 */
export function resolveExpireAfterAuthFetch(result, prevExpire) {
  if (result?.success && result.data?.data) {
    return result.data.data.expire || '未授权'
  }

  const previous = prevExpire || ''
  if (
    previous &&
    previous !== '未授权' &&
    previous !== AUTH_FETCH_FAILED_EXPIRE
  ) {
    return previous
  }

  return AUTH_FETCH_FAILED_EXPIRE
}

export function isAuthFetchFailedExpire(expire) {
  return expire === AUTH_FETCH_FAILED_EXPIRE
}
