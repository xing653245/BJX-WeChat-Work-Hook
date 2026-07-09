/**
 * 网络好友接口（4008/4009）前置校验与查询结果缓存
 * 未登录、Hook 不可用或参数错误时直接拒绝，避免请求挂起 30s 超时或导致企微崩溃
 */
const axios = require('axios')
const { getProtectionUntil } = require('./wecomStability')

const QUERY_CACHE_TTL_MS = 5 * 60 * 1000
const HOOK_PROBE_TIMEOUT_MS = 4000
const queryCacheByPort = new Map()

function unwrapHookData(raw) {
  if (!raw || typeof raw !== 'object') {
    return raw
  }
  if (Array.isArray(raw.data)) {
    return raw.data
  }
  if (raw.data != null && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
    const inner = raw.data
    if (Array.isArray(inner.data)) {
      return inner.data
    }
    if (inner.data != null && typeof inner.data === 'object' && !Array.isArray(inner.data)) {
      return inner.data
    }
    return inner
  }
  if (Array.isArray(raw)) {
    return raw
  }
  return raw
}

function pickString(...values) {
  for (const value of values) {
    if (value != null && value !== '') {
      return String(value)
    }
  }
  return ''
}

function extractContactList(raw) {
  const data = unwrapHookData(raw)
  if (Array.isArray(data)) {
    return data
  }
  if (data && typeof data === 'object') {
    const list = data.datalist ?? data.data_list ?? data.dataList ?? data.list
    if (Array.isArray(list)) {
      return list
    }
  }
  return []
}

function extractNetworkContacts(raw) {
  const contacts = []

  for (const item of extractContactList(raw)) {
    const wxInfo = item?.contact_info_wx ?? item?.contactInfoWx
    const wwInfo = item?.contact_info ?? item?.contactInfo
    const unifiedTicket = pickString(item?.openid_or_ticket)
    const userId = pickString(
      item?.user_id,
      item?.userId,
      wxInfo?.uin,
      wxInfo?.user_id,
      wwInfo?.uin,
      wwInfo?.user_id
    )
    const corpId = pickString(item?.corpid, item?.corp_id, wwInfo?.corpid, wwInfo?.corp_id)

    if (!userId) {
      continue
    }

    contacts.push({
      user_id: userId,
      corp_id: corpId,
      openid_or_ticket: unifiedTicket,
      item_type: item?.item_type != null ? Number(item.item_type) : null,
      nick_name: pickString(item?.nick_name, item?.nickName)
    })
  }

  return contacts
}

function resolveMatchedContact(cache, userId) {
  return cache.contacts.find((contact) => String(contact.user_id) === String(userId)) || null
}

function normalizeAddNetworkParams(params, matched) {
  const addType = Number(params.add_type)
  return {
    add_type: addType,
    corp_id: pickString(params.corp_id, matched?.corp_id),
    user_id: String(params.user_id),
    msg: params.msg,
    openid_or_ticket: pickString(params.openid_or_ticket, matched?.openid_or_ticket)
  }
}

function buildAddNetworkHookPayload(params) {
  const addType = Number(params.add_type)
  return {
    type: 4009,
    add_type: addType,
    corp_id: params.corp_id ?? '',
    user_id: params.user_id,
    msg: params.msg,
    openid_or_ticket: params.openid_or_ticket
  }
}

async function probeHookAlive(port) {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return false
  try {
    await axios.post(`http://127.0.0.1:${p}/api`, { type: 1000 }, { timeout: HOOK_PROBE_TIMEOUT_MS })
    return true
  } catch {
    return false
  }
}

async function probeLoggedIn(port) {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return false
  try {
    const res = await axios.post(`http://127.0.0.1:${p}/api`, { type: 1000 }, { timeout: HOOK_PROBE_TIMEOUT_MS })
    const status = res.data?.data?.status
    return status === 1 || status === true
  } catch {
    return false
  }
}

async function assertFriendNetworkReady(port) {
  const until = getProtectionUntil(port)
  const waitMs = until - Date.now()
  if (waitMs > 0) {
    const err = new Error(
      `企微仍在初始化或登录保护期（约 ${Math.ceil(waitMs / 1000)}s），请稍后再调用网络好友接口`
    )
    err.code = 'WECOM_NOT_READY'
    throw err
  }

  const hookAlive = await probeHookAlive(port)
  if (!hookAlive) {
    const err = new Error(
      `无法连接企微 Hook（端口 ${port}）。企微可能已崩溃或未启动，请重新打开企微并确认注入成功后再试`
    )
    err.code = 'WECOM_HOOK_UNREACHABLE'
    throw err
  }

  const loggedIn = await probeLoggedIn(port)
  if (!loggedIn) {
    const err = new Error('企微尚未登录完成，请先扫码登录后再调用网络好友接口')
    err.code = 'WECOM_NOT_LOGGED_IN'
    throw err
  }
}

function recordNetworkQuery(port, key, raw) {
  const contacts = extractNetworkContacts(raw)
  queryCacheByPort.set(String(port), {
    key: key != null ? String(key) : '',
    contacts,
    queriedAt: Date.now(),
    raw
  })
}

function validateAddNetworkParams(port, params) {
  const addType = Number(params.add_type)
  if (![1, 2].includes(addType)) {
    return { valid: false, message: 'add_type 无效，仅支持 1（企微）或 2（个微）' }
  }

  const cache = queryCacheByPort.get(String(port))
  if (!cache) {
    return {
      valid: false,
      message: '请先调用 /api/friend/query-network 搜索用户，再使用其返回结果调用 add-network'
    }
  }
  if (Date.now() - cache.queriedAt > QUERY_CACHE_TTL_MS) {
    return {
      valid: false,
      message: '网络查询结果已过期（超过 5 分钟），请重新调用 /api/friend/query-network'
    }
  }
  if (cache.contacts.length === 0) {
    return {
      valid: false,
      message: '最近一次 query-network 未解析到联系人，请确认搜索关键字正确后重试'
    }
  }

  const matched = resolveMatchedContact(cache, params.user_id)
  if (!matched) {
    return {
      valid: false,
      message: `user_id(${params.user_id}) 与最近一次 query-network 结果不匹配，请使用查询返回的 user_id`
    }
  }

  const normalized = normalizeAddNetworkParams(params, matched)

  if (matched.item_type != null && matched.item_type !== addType) {
    return {
      valid: false,
      message: `add_type=${addType} 与 query-network 返回的 item_type=${matched.item_type} 不一致，请改为 add_type=${matched.item_type}`
    }
  }

  if (!normalized.openid_or_ticket) {
    return {
      valid: false,
      message: '缺少 openid_or_ticket，请原样使用 query-network 返回的 openid_or_ticket 字段'
    }
  }

  if (matched.openid_or_ticket && normalized.openid_or_ticket !== matched.openid_or_ticket) {
    return {
      valid: false,
      message: 'openid_or_ticket 与 query-network 结果不一致，请原样复制查询返回的 openid_or_ticket'
    }
  }

  if (params.corp_id === undefined || params.corp_id === null) {
    return { valid: false, message: '缺少参数: corp_id (企业ID，无企业ID时传空字符串 "")' }
  }

  if (normalized.corp_id !== pickString(matched.corp_id)) {
    return {
      valid: false,
      message: 'corp_id 与 query-network 结果不一致，请使用查询返回的 corp_id（个微无企业ID时传 ""）'
    }
  }

  return { valid: true, params: normalized }
}

module.exports = {
  assertFriendNetworkReady,
  recordNetworkQuery,
  validateAddNetworkParams,
  buildAddNetworkHookPayload,
  extractNetworkContacts
}
