/**
 * 框架 REST 路径 → 企微 Hook type，用于 call-api 日志（请求体常不含 type 字段）
 */
const FRAMEWORK_PATH_TO_TYPE = [
  ['/api/login/status', 1000],
  ['/api/login/qrcode', 1001],
  ['/api/login/info', 1002],
  ['/api/login/logout', 1003],
  ['/api/login/personal-qrcode', 1004],
  ['/api/login/captcha', 1005],
  ['/api/user/info', 1002],
  ['/api/contact/list', 2000],
  ['/api/contact/friends', 2001],
  ['/api/contact/groups', 2002],
  ['/api/contact/members', 2003],
  ['/api/contact/companies', 2004],
  ['/api/contact/departments', 2005],
  ['/api/message/text', 3000],
  ['/api/message/image', 3001],
  ['/api/message/gif', 3002],
  ['/api/message/file', 3003],
  ['/api/message/video', 3004],
  ['/api/message/card', 3005],
  ['/api/message/applet', 3006],
  ['/api/message/video-number', 3007],
  ['/api/message/card-link', 3008],
  ['/api/message/at', 3009],
  ['/api/message/location', 3010],
  ['/api/message/voice', 3011],
  ['/api/tag/groups', 6000],
  ['/api/tag/add', 6001],
  ['/api/tag/modify', 6002],
  ['/api/tag/delete', 6003],
  ['/api/tag/add-to-friend', 6004],
  ['/api/tag/add-friends', 6005],
  ['/api/tag/friends', 6006],
  ['/api/tag/remove-friends', 6007],
  ['/api/tag/user-tags', 'user-tags'],
  ['/api/settings/auto-update', 7000],
  ['/api/settings/auto-login', 7001],
  ['/api/settings/message-dnd', 7002],
  ['/api/settings/auto-download', 7003],
  ['/api/other/clear-chat', 10000],
  ['/api/other/voice-to-text', 10003],
  ['/api/other/wx-pid', 10004],
  ['/api/other/chat-window', 10005]
]

function resolveApiTypeForLog(url, data) {
  if (data?.type != null && data.type !== '') {
    const n = Number(data.type)
    return Number.isNaN(n) ? data.type : n
  }
  if (typeof url === 'string') {
    for (const [path, type] of FRAMEWORK_PATH_TO_TYPE) {
      if (url.includes(path)) return type
    }
  }
  return 'unknown'
}

module.exports = {
  resolveApiTypeForLog
}
