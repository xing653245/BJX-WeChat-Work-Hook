/** 北极熊接口统一由指定企微实例转发，不直连后端。 */
function getPolarBearBaseUrl(port) {
  const value = typeof port === 'number' || typeof port === 'string' ? String(port).trim() : ''
  const number = Number(value)
  if (!/^\d+$/.test(value) || !Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error('缺少或无效的企微端口，请选择已启动并注入的企微实例')
  }
  return 'http://127.0.0.1:' + number
}

module.exports = { getPolarBearBaseUrl }
