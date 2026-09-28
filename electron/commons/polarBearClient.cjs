/**
 * 北极熊授权后端 HTTP 客户端（主进程）
 */
const axios = require('axios')
const { formatAuthFetchError } = require('./authFetchError')
const { getPolarBearBaseUrl, buildPolarBearAuthHeaders } = require('../configs/polarBearBackend')

function pickBackendMessage(data) {
  if (!data) return ''
  if (typeof data === 'string') return data.trim()
  if (typeof data !== 'object') return ''
  const msg = data.msg ?? data.message ?? data.detail
  if (typeof msg === 'string') return msg.trim()
  if (Array.isArray(msg) && msg.length && typeof msg[0]?.msg === 'string') {
    return msg[0].msg.trim()
  }
  return ''
}

function unwrapPolarBusinessData(data) {
  let cur = data
  // 兼容 { success, code, data: { ...业务... } } 多包一层
  for (let i = 0; i < 3; i++) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) break
    const nested = cur.data
    if (
      nested &&
      typeof nested === 'object' &&
      !Array.isArray(nested) &&
      (cur.success === true || cur.code === 0 || cur.code === 200)
    ) {
      cur = nested
      continue
    }
    break
  }
  return cur
}

function isPolarSuccessCode(code) {
  return code === 0 || code === 200 || code === '0' || code === '200'
}

function normalizePolarBearResponse(responseData, fallbackSuccessMsg, fallbackFailMsg) {
  const backendMsg = pickBackendMessage(responseData)
  if (responseData && typeof responseData === 'object') {
    if (responseData.success === false) {
      return {
        success: false,
        msg: backendMsg || fallbackFailMsg,
        data: responseData.data ?? null
      }
    }
    const code = responseData.code
    const hasCode = code !== undefined && code !== null && code !== ''
    // 仅 success===true 或 code 为 0/200 视为成功；其余一律失败
    if (responseData.success === true || isPolarSuccessCode(code)) {
      return {
        success: true,
        msg: backendMsg || fallbackSuccessMsg,
        data: unwrapPolarBusinessData(responseData.data ?? responseData)
      }
    }
    if (hasCode || backendMsg) {
      return {
        success: false,
        msg: backendMsg || fallbackFailMsg,
        data: responseData.data ?? null
      }
    }
  }
  return {
    success: false,
    msg: backendMsg || fallbackFailMsg,
    data: responseData ?? null
  }
}

async function getAuthInfo(wxid) {
  const url = `${getPolarBearBaseUrl()}/polarBear/getAuthInfo?wxid=${encodeURIComponent(wxid)}`
  const response = await axios.get(url, {
    timeout: 10000,
    headers: buildPolarBearAuthHeaders()
  })
  return response.data
}

async function postPolarBear(path, body) {
  const url = `${getPolarBearBaseUrl()}${path}`
  const response = await axios.post(url, body, {
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      ...buildPolarBearAuthHeaders()
    }
  })
  return response.data
}

/**
 * @param {{ wxid: string, card_key: string }} payload
 */
async function bindCard(payload) {
  const wxid = String(payload?.wxid || '').trim()
  const card_key = String(payload?.card_key || '').trim()
  if (!wxid) return { success: false, msg: '缺少 wxid，无法绑定卡密' }
  if (!card_key) return { success: false, msg: '请输入卡密' }

  try {
    const data = await postPolarBear('/polarBear/card/bind', { wxid, card_key })
    return normalizePolarBearResponse(data, '卡密绑定成功', '卡密绑定失败')
  } catch (error) {
    return { success: false, msg: formatAuthFetchError(error) }
  }
}

/**
 * @param {{ wxid: string, card_key: string }} payload
 */
async function unbindCard(payload) {
  const wxid = String(payload?.wxid || '').trim()
  const card_key = String(payload?.card_key || '').trim()
  if (!wxid) return { success: false, msg: '缺少 wxid，无法解绑卡密' }
  if (!card_key) return { success: false, msg: '请输入卡密' }

  try {
    const data = await postPolarBear('/polarBear/card/unbind', { wxid, card_key })
    return normalizePolarBearResponse(data, '卡密解绑成功', '卡密解绑失败')
  } catch (error) {
    return { success: false, msg: formatAuthFetchError(error) }
  }
}

/**
 * 利用 wxid 授权生成新卡密；新卡密继承到期时间，原 wxid 授权置为过期
 * @param {{ wxid: string }} payload
 */
async function convertCardByWxid(payload) {
  const wxid = String(payload?.wxid || '').trim()
  if (!wxid) return { success: false, msg: '缺少 wxid，无法迁移授权' }

  try {
    const data = await postPolarBear('/polarBear/card/convertByWxid', { wxid })
    const result = normalizePolarBearResponse(data, '授权迁移成功', '授权迁移失败')
    // 迁移成功必须能拿到新卡密，否则按失败处理，避免把「无授权」文案当成成功
    if (result.success) {
      const business = result.data
      const cardKey =
        (business &&
          typeof business === 'object' &&
          (business.card?.card_key || business.card_key)) ||
        ''
      const key = typeof cardKey === 'string' ? cardKey.trim() : ''
      if (!key) {
        return {
          success: false,
          msg: result.msg && result.msg !== '授权迁移成功'
            ? result.msg
            : '授权迁移未返回新卡密',
          data: result.data
        }
      }
    }
    return result
  } catch (error) {
    return { success: false, msg: formatAuthFetchError(error) }
  }
}

module.exports = {
  getAuthInfo,
  bindCard,
  unbindCard,
  convertCardByWxid
}
