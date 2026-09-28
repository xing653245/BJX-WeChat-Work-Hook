function normalizeConversationId(value, defaultPrefix = 'S') {
  const text = String(value || '').trim()
  if (!text || text.startsWith('R:') || text.startsWith('S:')) return text
  return `${defaultPrefix}:${text}`
}

function createWecomAgentAdapter({ request }) {
  if (typeof request !== 'function') {
    throw new TypeError('request must be a function')
  }

  return {
    async call(payload) {
      const type = Number(payload?.type)
      if (type === 1000) {
        const response = await request({ method: 'GET', path: '/api/v1/status' })
        const data = response?.data || {}
        const account = data.account && typeof data.account === 'object' ? data.account : {}
        return {
          data: {
            ...account,
            status: data.connected === true || data.wx_connected === true ? 1 : 0
          }
        }
      }

      if (type === 1002) {
        const response = await request({ method: 'GET', path: '/api/v1/account' })
        const data = response?.data && typeof response.data === 'object' ? response.data : {}
        return {
          data: {
            ...data,
            real_name: data.real_name || data.username || '',
            nick_name: data.nick_name || data.nickname || data.username || '',
            alias: data.alias || data.acctid || ''
          }
        }
      }

      if (type === 1001) {
        return request({ method: 'POST', path: '/api/v1/login/refresh-qrcode', data: {} })
      }

      if (type === 1003) {
        return request({ method: 'POST', path: '/api/v1/logout', data: {} })
      }

      if (type === 1005) {
        return request({
          method: 'POST',
          path: '/api/v1/raw',
          data: { type: 1005, data: { code: payload.code } }
        })
      }

      if (type === 3000) {
        return request({
          method: 'POST',
          path: '/api/v1/messages/text',
          data: {
            conversation_id: normalizeConversationId(payload.user_id),
            content: payload.msg
          }
        })
      }

      if (type === 3001) {
        return request({
          method: 'POST',
          path: '/api/v1/messages/image',
          data: {
            conversation_id: normalizeConversationId(payload.user_id),
            local_path: payload.path
          }
        })
      }

      if (type === 3009) {
        return request({
          method: 'POST',
          path: '/api/v1/messages/at',
          data: {
            conversation_id: normalizeConversationId(payload.chat_room_id, 'R'),
            content: payload.msg,
            at_list: Array.isArray(payload.at_list) ? payload.at_list : [payload.at_list].filter(Boolean)
          }
        })
      }

      if (type === 3006) {
        const upload = await request({
          method: 'POST',
          path: '/api/v1/cdn/upload',
          data: { file_path: payload.cover_path, file_type: 1 }
        })
        const uploaded = upload?.data && typeof upload.data === 'object' ? upload.data : {}
        if (!uploaded.file_id) {
          const error = new Error(upload?.message || '小程序封面上传失败')
          error.code = 'WECOM_AGENT_UPLOAD_FAILED'
          throw error
        }
        return request({
          method: 'POST',
          path: '/api/v1/messages/miniprogram',
          data: {
            conversation_id: normalizeConversationId(payload.user_id),
            username: payload.wechat_id,
            appid: payload.app_id || '',
            appname: payload.desc || '',
            appicon: payload.avatar_url || '',
            title: payload.title,
            page_path: payload.page_path,
            file_id: uploaded.file_id,
            aes_key: uploaded.file_aes_key || uploaded.aes_key || '',
            md5: uploaded.file_md5 || uploaded.md5 || '',
            size: uploaded.file_size || uploaded.size || 0
          }
        })
      }

      const rawMessageTypes = {
        3002: 11070,
        3003: 11031,
        3004: 11067
      }
      if (rawMessageTypes[type]) {
        return request({
          method: 'POST',
          path: '/api/v1/raw',
          data: {
            type: rawMessageTypes[type],
            data: {
              conversation_id: normalizeConversationId(payload.user_id),
              file: payload.path
            }
          }
        })
      }

      if (type === 2002) {
        return request({
          method: 'GET',
          path: '/api/v1/groups',
          params: {
            page_num: Number(payload.page_num) || 1,
            page_size: Number(payload.page_size) || 100
          }
        })
      }

      if (type === 2003) {
        const rawId = String(payload.chat_room_id || payload.conversation_id || '')
        const conversationId = rawId.startsWith('R:') ? rawId : `R:${rawId}`
        return request({
          method: 'GET',
          path: `/api/v1/groups/${encodeURIComponent(conversationId)}/members`,
          params: {
            page_num: Number(payload.page_num) || 1,
            page_size: Number(payload.page_size) || 500
          }
        })
      }

      if (type === 5003) {
        const conversationId = normalizeConversationId(payload.chat_room_id, 'R')
        return request({
          method: 'PUT',
          path: `/api/v1/groups/${encodeURIComponent(conversationId)}/notice`,
          data: { notice: payload.content }
        })
      }

      if (type === 9000) {
        return request({
          method: 'POST',
          path: '/api/v1/cdn/upload',
          data: {
            file_path: payload.path || payload.file_path,
            file_type: Number(payload.file_type) || 1
          }
        })
      }

      if (type >= 9001 && type <= 9003) {
        return request({
          method: 'POST',
          path: '/api/v1/cdn/download/c2c',
          data: {
            file_id: payload.cdn_key || payload.file_id,
            aes_key: payload.aes_key,
            file_size: payload.size || payload.file_size,
            file_type: Number(payload.img_type || payload.file_type) || (type === 9001 ? 1 : type - 8999),
            save_path: payload.save_path
          }
        })
      }

      if (type === 9004) {
        return request({
          method: 'POST',
          path: '/api/v1/cdn/download/wx',
          data: {
            url: payload.url,
            auth_key: payload.auth_key,
            aes_key: payload.aes_key,
            size: payload.size,
            save_path: payload.save_path
          }
        })
      }

      {
        const error = new Error(`当前 Agent 暂不支持旧接口 type ${type}`)
        error.code = 'WECOM_AGENT_UNSUPPORTED'
        throw error
      }
    }
  }
}

function toInteger(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : 0
}

function normalizeAgentEvent(event, robotIds = []) {
  if (!event || typeof event !== 'object' || !event.data || typeof event.data !== 'object') {
    return event
  }

  const eventType = toInteger(event.msg_type ?? event.type)
  if (eventType === 11026 || eventType === 11179) {
    return {
      ...event.data,
      type: 0,
      event_id: String(event.event_id || '')
    }
  }
  if (eventType === 11027) {
    const port = event.data.port || event.port
    return {
      type: 900,
      user_id: event.data.user_id || '',
      ...(port ? { port } : {}),
      event_id: String(event.event_id || '')
    }
  }
  if (eventType !== 11041 && eventType !== 11042) return event

  const data = event.data
  const knownRobotIds = new Set(robotIds.map(String))
  const candidates = [data.receiver, data.sender].map((value) => String(value || ''))
  const robotId = candidates.find((value) => knownRobotIds.has(value)) || candidates[0] || candidates[1]
  const atList = Array.isArray(data.at_list)
    ? data.at_list.map((item) => String(item?.user_id ?? item ?? '')).filter(Boolean)
    : []

  const normalized = {
    type: eventType,
    self_user_id: robotId,
    user_id: data.conversation_id || '',
    sender: String(data.sender || ''),
    at_list: atList,
    msg_id: String(data.server_id || data.local_id || event.event_id || ''),
    time_stamp: toInteger(data.send_time || event.timestamp || event.time),
    event_id: String(event.event_id || '')
  }

  if (eventType === 11041) {
    normalized.msg_type = 2
    normalized.content = data.content || ''
    return normalized
  }

  const cdn = data.cdn && typeof data.cdn === 'object' ? data.cdn : {}
  const cdnType = toInteger(data.cdn_type)
  const size = toInteger(cdn.size || data.file_size)
  normalized.msg_type = 14
  normalized.content = {
    ...cdn,
    source_type: cdnType === 1 ? 1 : 2,
    cdn_type: cdnType,
    cdn_key: cdn.file_id || '',
    img_type: toInteger(cdn.file_type) || 1,
    size,
    url: cdn.url || '',
    auth_key: cdn.auth_key || '',
    aes_key: cdn.aes_key || '',
    _size_multiplier: 1
  }
  return normalized
}

module.exports = {
  createWecomAgentAdapter,
  normalizeAgentEvent
}
