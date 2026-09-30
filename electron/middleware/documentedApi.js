const { callVWorkAPI } = require('./apiHandler')
// 框架代理必须明确指定实例端口，不读取共享配置中的默认端口。
function createDocumentedApi({ call = callVWorkAPI } = {}) {
  return async (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ errno: -1, errmsg: '请求体必须是 JSON 对象', data: null })
      }
      const { port: requestedPort, type, ...params } = req.body
      const port = Number(requestedPort)
      if (!Number.isInteger(port) || port <= 1024 || port > 65535 || port === req.socket?.localPort) {
        return res.status(400).json({ errno: -1, errmsg: '请通过 port 指定企微实例 HTTP 端口，不能指向框架自身端口', data: null })
      }
      res.json(await call(port, type, params))
    } catch (error) {
      const status = error.code === 'NO_AUTH' ? 403
        : ['INVALID_API_PARAMS', 'INVALID_FRIEND_NETWORK_PARAMS'].includes(error.code) ? 400 : 503
      res.status(status).json({ errno: -1, errmsg: error.message, data: null })
    }
  }
}

module.exports = { createDocumentedApi }
