const test = require('node:test')
const assert = require('node:assert/strict')

test('Hook 响应：errno 为 0、仅有 data、以及加密包都算成功', async () => {
  const { isWecomHookBodyOk } = await import('../../src/utils/wecomHookBody.mjs')

  assert.equal(isWecomHookBodyOk({ errno: 0, errmsg: 'OK', data: {} }), true)
  assert.equal(isWecomHookBodyOk({ data: { user_id: '1' } }), true)
  assert.equal(isWecomHookBodyOk({ encrypted: true, data: ['cipher'] }), true)
  assert.equal(isWecomHookBodyOk('ok'), true)
})

test('Hook 响应：缺少 errno 的失败、空响应和明确错误算失败', async () => {
  const { isWecomHookBodyOk } = await import('../../src/utils/wecomHookBody.mjs')

  assert.equal(isWecomHookBodyOk(null), false)
  assert.equal(isWecomHookBodyOk({}), false)
  assert.equal(isWecomHookBodyOk({ errno: -1, errmsg: '失败' }), false)
  assert.equal(isWecomHookBodyOk({ code: 1 }), false)
  assert.equal(isWecomHookBodyOk({ errcode: 400 }), false)
  assert.equal(isWecomHookBodyOk({ error: 'boom' }), false)
  assert.equal(isWecomHookBodyOk({ errmsg: '接口返回 failure' }), false)
})
