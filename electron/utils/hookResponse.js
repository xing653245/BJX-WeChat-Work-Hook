/**
 * 企微 Hook 响应归一化
 * 常见格式：{ errno, errmsg, data: { chat_room_id / user_id / open_id } }
 * 将内层 data 扁平化，避免调用方拿到 [object Object]
 */

const ID_CONVERT_TYPES = new Set([8000, 8001, 8002, 8003])

function normalizeHookResponse(hookData) {
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

function shouldNormalizeHookResponse(type) {
  return ID_CONVERT_TYPES.has(Number(type))
}

module.exports = {
  ID_CONVERT_TYPES,
  normalizeHookResponse,
  shouldNormalizeHookResponse
}
