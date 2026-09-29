/**
 * 企微 Hook 响应归一化（用于页面兼容显示）
 */

const ID_CONVERT_TYPES = new Set([8000, 8001, 8002, 8003])

export function normalizeHookResponse(hookData) {
  if (!hookData || typeof hookData !== 'object' || Array.isArray(hookData)) {
    return hookData
  }

  const inner = hookData.data
  if (inner == null || typeof inner !== 'object' || Array.isArray(inner)) {
    return hookData
  }

  const { data: _nested, ...rest } = hookData
  return { ...rest, ...inner }
}

export function shouldNormalizeHookResponse(type) {
  return ID_CONVERT_TYPES.has(Number(type))
}
