/**
 * 企微卡密绑定 / 解绑（经主进程调用北极熊后端）
 */

function validateCardKey(cardKey) {
  const key = cardKey?.trim()
  if (!key) {
    return { ok: false, msg: '请输入卡密' }
  }
  return { ok: true, key }
}

function ensureElectronCardApi(method) {
  if (!window.electronAPI?.[method]) {
    return { ok: false, msg: 'Electron API 不可用' }
  }
  return { ok: true }
}

/**
 * @param {{ wxid: string, cardKey: string, port?: string|number, nickName?: string }} payload
 * @returns {Promise<{ success: boolean, msg?: string, data?: unknown }>}
 */
export async function bindAuthorization(payload) {
  const wxid = payload?.wxid?.trim()
  if (!wxid) {
    return { success: false, msg: '缺少 wxid，无法绑定授权' }
  }

  const card = validateCardKey(payload?.cardKey)
  if (!card.ok) {
    return { success: false, msg: card.msg }
  }

  const api = ensureElectronCardApi('bindCard')
  if (!api.ok) {
    return { success: false, msg: api.msg }
  }

  return window.electronAPI.bindCard({
    wxid,
    card_key: card.key
  })
}

/**
 * @param {{ wxid: string, cardKey: string, port?: string|number, nickName?: string }} payload
 * @returns {Promise<{ success: boolean, msg?: string, data?: unknown }>}
 */
export async function unbindAuthorization(payload) {
  const wxid = payload?.wxid?.trim()
  if (!wxid) {
    return { success: false, msg: '缺少 wxid，无法取消授权' }
  }

  const card = validateCardKey(payload?.cardKey)
  if (!card.ok) {
    return { success: false, msg: card.msg }
  }

  const api = ensureElectronCardApi('unbindCard')
  if (!api.ok) {
    return { success: false, msg: api.msg }
  }

  return window.electronAPI.unbindCard({
    wxid,
    card_key: card.key
  })
}

/**
 * 授权迁移：wxid 授权转为新卡密
 * @param {{ wxid: string }} payload
 * @returns {Promise<{ success: boolean, msg?: string, data?: unknown }>}
 */
export async function convertAuthorizationByWxid(payload) {
  const wxid = payload?.wxid?.trim()
  if (!wxid) {
    return { success: false, msg: '缺少 wxid，无法迁移授权' }
  }

  const api = ensureElectronCardApi('convertCardByWxid')
  if (!api.ok) {
    return { success: false, msg: api.msg }
  }

  return window.electronAPI.convertCardByWxid({ wxid })
}

/**
 * 从迁移响应中提取 card_key。
 * 适配：`{ card: { card_key } }`、`{ data: { card: { card_key } } }`、
 * `{ success, code, data: { card: { card_key } } }` 等嵌套。
 */
function pickCardKeyFromConvertResult(data) {
  if (!data || typeof data !== 'object') return ''

  const readKey = (value) =>
    typeof value === 'string' && value.trim() ? value.trim() : ''

  let cur = data
  for (let i = 0; i < 4 && cur && typeof cur === 'object'; i++) {
    const fromCard = readKey(cur.card?.card_key)
    if (fromCard) return fromCard
    const fromTop = readKey(cur.card_key)
    if (fromTop) return fromTop
    if (cur.data && typeof cur.data === 'object') {
      cur = cur.data
      continue
    }
    break
  }

  return ''
}

export { pickCardKeyFromConvertResult }
