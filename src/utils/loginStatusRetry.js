/**
 * 切换企业等场景下，企微 1000 接口可能短暂返回非已登录，需重试后再判定。
 * @param {() => Promise<{ data?: { status?: number } }>} fetchStatus
 * @param {{ attempts?: number, intervalMs?: number }} [options]
 * @returns {Promise<boolean>} 是否在重试窗口内出现过 status === 1
 */
export async function confirmLoggedIn(fetchStatus, options = {}) {
  const attempts = options.attempts ?? 5
  const intervalMs = options.intervalMs ?? 2000
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fetchStatus()
      if (result?.data?.status === 1) return true
    } catch {
      /* 瞬时不可用 */
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  return false
}
