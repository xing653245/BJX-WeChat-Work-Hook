/**
 * 北极熊授权后端 HTTP 客户端（主进程）
 */
const axios = require('axios')
const { formatAuthFetchError } = require('./authFetchError')
const { getPolarBearBaseUrl } = require('../configs/polarBearBackend')

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
    if (
      responseData.success === true ||
      responseData.code === 0 ||
      responseData.code === 200
    ) {
      return {
        success: true,
        msg: backendMsg || fallbackSuccessMsg,
        data: responseData.data ?? responseData
      }
    }
  }
  return {
    success: true,
    msg: backendMsg || fallbackSuccessMsg,
    data: responseData ?? null
  }
}

async function postPolarBear(path, body) {
  const url = `${getPolarBearBaseUrl()}${path}`
  const response = await axios.post(url, body, {
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' }
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
    return normalizePolarBearResponse(data, '授权迁移成功', '授权迁移失败')
  } catch (error) {
    return { success: false, msg: formatAuthFetchError(error) }
  }
}

module.exports = {
  bindCard,
  unbindCard,
  convertCardByWxid
}
