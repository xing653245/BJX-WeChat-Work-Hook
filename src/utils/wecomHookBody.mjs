/**
 * 企微 Hook 成功时常只返回 { data }，不一定带 errno。
 * 开启消息加密时，成功响应是 { encrypted: true, data: [密文] }，客户端没有私钥，读不到 errno。
 */
export function isWecomHookBodyOk(body) {
  if (body == null) return false
  if (typeof body !== 'object') return true
  if (body.errno != null && body.errno !== '') return Number(body.errno) === 0
  if (body.code != null && body.code !== '') return Number(body.code) === 0
  if (body.errcode != null && body.errcode !== '') return Number(body.errcode) === 0
  if (body.error) return false
  if (typeof body.errmsg === 'string' && body.errmsg.trim()) return false
  return Object.prototype.hasOwnProperty.call(body, 'data')
}
