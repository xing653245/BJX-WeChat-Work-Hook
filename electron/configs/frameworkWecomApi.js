/** 仅供框架自身功能使用，用户程序直接请求企微实例的 HTTP 接口。 */
const FRAMEWORK_API_NAMES = Object.freeze({
  1000: '获取登录状态',
  1002: '获取个人信息',
  1003: '退出登录',
  3000: '发送文本测试消息',
  7000: '关闭自动更新'
})

function validateFrameworkRequest(input) {
  const fail = message => ({ valid: false, message })
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('请求体必须是 JSON 对象')
  const type = input.type
  if (!Number.isInteger(type) || !Object.hasOwn(FRAMEWORK_API_NAMES, type)) return fail('框架仅支持内部固定使用的企微接口')
  const params = { type }
  if (type === 3000) {
    if (typeof input.user_id !== 'string' || !input.user_id.trim()) return fail('请填写接收方 user_id')
    if (typeof input.msg !== 'string' || !input.msg.trim()) return fail('文本消息不能为空')
    params.user_id = input.user_id.trim()
    params.msg = input.msg
  }
  if (type === 7000) {
    if (input.state !== 0 && input.state !== false) return fail('框架仅使用关闭自动更新操作')
    params.state = 0
  }
  return { valid: true, params }
}

module.exports = { FRAMEWORK_API_NAMES, validateFrameworkRequest }
