const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

test('企微消息仅更新框架本地日志，不再转发到外部回调地址', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../express_server.js'), 'utf8')
  const start = source.indexOf('async function processIncomingWecomMessage(data)')
  const end = source.indexOf("app.post('/msg'", start)
  const posts = [], logs = []
  const context = {
    readIni: () => ({ open_log: true, save_log: true, callback: 'http://external.invalid/message', login_info: [] }),
    enrichWecomMessage: data => data,
    checkAuthByUserId: () => ({ valid: true }),
    axios: { post: async (...args) => posts.push(args) },
    MESSAGE_SERVER_URL: 'http://127.0.0.1:9999/message',
    messageServerAxiosConfig: () => ({}),
    saveLogToFile: async data => logs.push(data)
  }
  vm.createContext(context)
  vm.runInContext(source.slice(start, end), context)
  const message = { type: 3000, user_id: 'test', content: '测试消息' }
  await context.processIncomingWecomMessage(message)
  assert.equal(posts.length, 1)
  assert.equal(posts[0][0], 'http://127.0.0.1:9999/message')
  assert.equal(logs[0], message)
})
