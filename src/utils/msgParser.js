/**
 * 企微消息解析工具
 * msg_type 说明见官方文档；未收录的类型仍应正常推送/回调，仅展示为「未知消息」
 */

/** 企微 msg_type 映射表 */
export const MSG_TYPE_MAP = {
  2: '文本消息',
  14: '图片消息',
  29: 'GIF消息',
  15: '文件消息',
  23: '视频消息',
  41: '名片消息',
  78: '小程序消息',
  141: '视频号消息',
  13: '卡片链接消息',
  6: '位置消息',
  16: '语音消息',
  4: '合并消息',
  2063: '撤回消息'
}

export const TEXT_MSG_TYPE = 2
export const UNKNOWN_MSG_LABEL = '未知消息'

/**
 * 根据 msg_type 返回消息类型中文说明
 * @param {number|string} msgType 消息类型（数值或字符串）
 * @returns {string} 例如：文本消息 / 图片消息 / 未知消息(999)
 */
export const getMsgTypeText = (msgType) => {
  const code = Number(msgType)

  if (!Number.isFinite(code)) {
    return UNKNOWN_MSG_LABEL
  }

  const text = MSG_TYPE_MAP[code]
  if (!text) {
    return msgType !== undefined && msgType !== null && msgType !== ''
      ? `${UNKNOWN_MSG_LABEL}(${msgType})`
      : UNKNOWN_MSG_LABEL
  }

  return text
}

/** 是否为文档已收录的 msg_type */
export const isKnownMsgType = (msgType) => {
  const code = Number(msgType)
  return Number.isFinite(code) && Object.prototype.hasOwnProperty.call(MSG_TYPE_MAP, code)
}

/** 发送/接收方向 */
export const getMessageDirectionText = (data) => {
  if (!data || typeof data !== 'object') return ''
  if (data.is_self_msg === 1) return '发送'
  if (data.msg_id) return '接收'
  return ''
}

/** 运行日志「类型」列文案 */
export const formatMessageTypeLabel = (data) => {
  if (data?.sys) return '系统提示'
  if (data?.type === 'api_call') return 'API调用'

  const direction = getMessageDirectionText(data)
  const msgTypeText = getMsgTypeText(data?.msg_type)
  return direction ? `${direction}-${msgTypeText}` : msgTypeText
}

/** 格式化消息正文（含未知 msg_type） */
export const formatMessageContent = (data) => {
  if (!data || typeof data !== 'object') return ''

  if (data.sys || data.type === 'api_call') {
    return typeof data.content === 'string' ? data.content : String(data.content ?? '')
  }

  const msgType = Number(data.msg_type)
  const content = data.content

  if (msgType === TEXT_MSG_TYPE) {
    return typeof content === 'string' ? content : String(content ?? '')
  }

  if (content === null || content === undefined || content === '') {
    if (Number.isFinite(msgType) && !isKnownMsgType(msgType)) {
      return getMsgTypeText(msgType)
    }
    return ''
  }

  if (typeof content === 'string') {
    if (Number.isFinite(msgType) && !isKnownMsgType(msgType)) {
      return `[${getMsgTypeText(msgType)}] ${content}`
    }
    return content
  }

  try {
    const json = JSON.stringify(content, null, 2)
    if (Number.isFinite(msgType) && !isKnownMsgType(msgType)) {
      return `[${getMsgTypeText(msgType)}]\n${json}`
    }
    return json
  } catch {
    return String(content)
  }
}

/** 为回调/日志补充 msg_type_text */
export const enrichWecomMessage = (data) => {
  if (!data || typeof data !== 'object') return data
  return {
    ...data,
    msg_type_text: getMsgTypeText(data.msg_type)
  }
}
