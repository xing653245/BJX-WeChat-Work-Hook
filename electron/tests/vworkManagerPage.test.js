const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const pagePath = path.resolve(__dirname, '../../src/pages/VWorkManagerPage.vue')

test('企微管理页只展示自动识别登录提示，不再提供添加企微入口', () => {
  const source = readFileSync(pagePath, 'utf8')

  assert.match(source, /无需添加企微，请直接登录/u)
  assert.match(source, /登录成功后，此处会自动显示已登录企微/u)
  assert.doesNotMatch(source, /showAddDialog|executeAddWechat|handleAddWechat/u)
  assert.doesNotMatch(source, />\s*添加企微\s*</u)
})

test('企微管理页仍保留已登录账号的管理操作', () => {
  const source = readFileSync(pagePath, 'utf8')

  assert.match(source, /授权管理/u)
  assert.match(source, /复制ID/u)
  assert.match(source, /设置标签/u)
  assert.match(source, /退出微信/u)
})
