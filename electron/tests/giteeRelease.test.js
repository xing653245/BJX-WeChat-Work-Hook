const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function lookup(status, data) {
  const filename = path.resolve(__dirname, '../../scripts/publish-gitee.js')
  const localRequire = createRequire(filename)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.lookup = getReleaseByTag', {
    module, __dirname: path.dirname(filename),
    require: name => name === 'axios' ? async () => ({ status, data }) : localRequire(name)
  })
  return module.exports.lookup('owner', 'repo', 'v2.2.12', 'test-token')
}

test('Gitee 新版本尚无 Release 时，兼容 HTTP 200 空数组及 404', async () => {
  assert.equal(await lookup(200, []), null)
  assert.equal(await lookup(404, { message: 'Not Found' }), null)
})

test('Gitee 已有 Release 保留标识，权限或异常响应不能当成不存在', async () => {
  const release = { id: 123, tag_name: 'v2.2.12' }
  assert.equal(await lookup(200, release), release)
  await assert.rejects(lookup(403, { message: 'Forbidden' }), /403/)
  await assert.rejects(lookup(200, { message: 'unexpected' }), /未返回有效的 Release/)
})
