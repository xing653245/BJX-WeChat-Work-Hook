/**
 * 兼容企微 1002 返回：可能是 { data: { … } } 或外层带 errno、内层再包一层 data
 */
export function pickPersonalRecord(personalInfo) {
  const root = personalInfo?.data
  if (!root || typeof root !== 'object') return null
  if (root.user_id != null || root.nick_name != null) return root
  if (root.data && typeof root.data === 'object') return root.data
  return root
}
