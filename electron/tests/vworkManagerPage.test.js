const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const pagePath = path.resolve(__dirname, '../../src/pages/VWorkManagerPage.vue')

test('企微管理页通过 it.exe 注入添加企微，而不是固定 8080 自动登录', () => {
  const source = readFileSync(pagePath, 'utf8')

  assert.match(source, /右键添加企微后登录/u)
  assert.match(source, /executeAddWechat/u)
  assert.match(source, /runInjectTool/u)
  assert.match(source, />\s*添加企微\s*</u)
  assert.doesNotMatch(source, /HTTP 8080/u)
})

test('企微管理页仍保留已登录账号的管理操作', () => {
  const source = readFileSync(pagePath, 'utf8')

  assert.match(source, /授权管理/u)
  assert.match(source, /复制ID/u)
  assert.match(source, /设置标签/u)
  assert.match(source, /退出微信/u)
})
