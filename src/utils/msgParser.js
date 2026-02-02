/**
 * 企微消息解析工具
 * 主要用于根据 msg_type 返回对应的中文说明，便于日志展示
 */

// 企微 msg_type 映射表
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
  4: '合并消息'
}

/**
 * 根据 msg_type 返回消息类型中文说明
 * @param {number|string} msgType 消息类型（数值或字符串）
 * @returns {string} 例如：文本消息 / 图片消息 / 未知消息(999)
 */
export const getMsgTypeText = (msgType) => {
  const code = Number(msgType)

  if (!Number.isFinite(code)) {
    return '未知消息'
  }

  const text = MSG_TYPE_MAP[code]

  // 按需求返回“未知消息(原始值)”的形式，便于排查新类型
  if (!text) {
    return msgType ? `未知消息(${msgType})` : '未知消息'
  }

  return text
}

