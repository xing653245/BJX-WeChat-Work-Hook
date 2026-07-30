/**
 * 企微授权绑定 / 取消（预留后端对接）
 * 后续可在主进程 IPC 或此处直连北极熊接口。
 */

function validateCardKey(cardKey) {
  const key = cardKey?.trim()
  if (!key) {
    return { ok: false, msg: '请输入卡密' }
  }
  return { ok: true, key }
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

  // TODO: 对接后端，例如 ipcRenderer.invoke('auth-bind', { wxid, cardKey: card.key, ... })
  return { success: false, msg: '授权绑定接口尚未对接' }
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

  // TODO: 对接后端，例如 ipcRenderer.invoke('auth-unbind', { wxid, cardKey: card.key, ... })
  return { success: false, msg: '授权取消接口尚未对接' }
}
