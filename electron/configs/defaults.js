/**
 * 默认配置常量
 * 统一管理应用中的默认值，方便维护
 */

// 默认服务器端口
const DEFAULT_SERVER_PORT = 8888

// 默认服务器端口（字符串格式，用于配置文件）
const DEFAULT_SERVER_PORT_STRING = '8888'

// 默认 API 服务器 URL
const DEFAULT_API_SERVER_URL = `http://127.0.0.1:${DEFAULT_SERVER_PORT}`

// 注入工具 key（与企微框架约定，主进程与前端共用）
const DEFAULT_INJECT_KEY = 'FUAyVli9Ee15q1wdbzpRsSjbyrVo2cDuhgNdLK3CWCW3Y95YepvLarcVszNGmETk'

module.exports = {
  DEFAULT_SERVER_PORT,
  DEFAULT_SERVER_PORT_STRING,
  DEFAULT_API_SERVER_URL,
  DEFAULT_INJECT_KEY
}

