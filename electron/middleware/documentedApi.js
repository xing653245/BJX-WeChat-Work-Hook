const { callVWorkAPI } = require('./apiHandler')
const { getInjectBinDir } = require('../commons/resourcePaths')
const { readInjectSettings } = require('../services/injectSettings')

function defaultPort() {
  return readInjectSettings(getInjectBinDir()).port
}

// 文档入口保留 Hook 的 errno/errmsg/data；port 是多实例代理的可选扩展。
function createDocumentedApi({ call = callVWorkAPI, getPort = defaultPort } = {}) {
  return async (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ errno: -1, errmsg: '请求体必须是 JSON 对象', data: null })
      }
      const { port: requestedPort, type, ...params } = req.body
      const port = Number(requestedPort ?? getPort())
      if (!Number.isInteger(port) || port <= 1024 || port > 65535 || port === req.socket?.localPort) {
        return res.status(400).json({ errno: -1, errmsg: '企微端口无效，不能指向框架自身端口', data: null })
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
