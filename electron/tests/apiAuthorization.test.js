const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { createRequire } = require('module')

test('个人信息可用于建立登录态，业务调用在未授权时不触达 Hook', async () => {
  const filename = path.resolve(__dirname, '../services/frameworkWecomApi.js')
  const localRequire = createRequire(filename)
  const calls = []
  let authorized = false
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    require(name) {
      if (name === '../commons/common') return {
        readIni: () => ({ login_info: [] }),
        checkAuthByPort: () => ({ valid: authorized, message: '未授权' })
      }
      if (name === './wecomApiClient') return { postToVWorkApi: async (...args) => { calls.push(args); return { errno: 0 } } }
      return localRequire(name)
    }
  })
  const { callFrameworkWecomApi } = module.exports
  await callFrameworkWecomApi(8989, { type: 1002 })
  assert.equal(calls.length, 1)
  await assert.rejects(callFrameworkWecomApi(8989, { type: 3000, user_id: '123', msg: 'hello' }), { code: 'NO_AUTH' })
  assert.equal(calls.length, 1)
  authorized = true
  await callFrameworkWecomApi(8989, { type: 7000, state: false })
  assert.equal(calls[1][1].state, 0)
  await assert.rejects(callFrameworkWecomApi(8989, { type: 3000 }), { code: 'INVALID_API_PARAMS' })
  await assert.rejects(callFrameworkWecomApi(8989, { type: 3001, user_id: '123', path: 'file' }), { code: 'INVALID_API_PARAMS' })
  assert.equal(calls.length, 2)
})
