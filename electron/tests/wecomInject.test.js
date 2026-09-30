const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { EventEmitter } = require('node:events')

const servicePath = path.resolve(__dirname, '../services/wecomInject.js')
const serviceRequire = createRequire(servicePath)

function loadService(spawn) {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), {
    module,
    __dirname: path.dirname(servicePath),
    process,
    Buffer,
    console: { log() {} },
    require(name) {
      if (name === 'child_process') {
        return {
          spawn,
          execSync() { throw new Error('启动不应查询注册表') }
        }
      }
      if (name === 'fs') {
        return {
          existsSync: (file) => file.endsWith('it.exe'),
          readFileSync() { throw new Error('不读取旧配置') }
        }
      }
      return serviceRequire(name)
    }
  }, { filename: servicePath })
  return module.exports
}

test('注入传入实例端口和随机回调地址，在工具目录运行', async () => {
  const calls = []
  const service = loadService((...args) => {
    calls.push(args)
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    queueMicrotask(() => child.emit('close', 0))
    return child
  })

  for (const port of [8990, 4567]) {
    const result = await service.runInjectTool({
      port, callbackUrl: 'http://127.0.0.1:54321/msg', serverPort: 8002, key: 'legacy-key', wecomVersion: 'v5'
    })
    assert.equal(result.success, true)
    const [exe, args, options] = calls.at(-1)
    assert.equal(exe, path.resolve(__dirname, '../../bin/it.exe'))
    assert.deepEqual(Array.from(args), ['--port', String(port), '--callbackurl', 'http://127.0.0.1:54321/msg'])
    assert.equal(options.cwd, path.dirname(exe))
    assert.equal(options.shell, false)
  }
})

test('新工具支持静默成功，但异常退出和明确失败输出仍判定失败', () => {
  const { evaluateInjectResult } = loadService()
  assert.equal(evaluateInjectResult(0, '').success, true)
  assert.equal(evaluateInjectResult(0, '已启动企业微信').success, true)
  assert.equal(evaluateInjectResult(1, '注入成功').success, false)
  assert.equal(evaluateInjectResult(null, '').success, false)
  assert.equal(evaluateInjectResult(0, '无法启动企业微信').success, false)
  assert.equal(evaluateInjectResult(0, '加载日志 DLL 失败').success, false)
  assert.equal(evaluateInjectResult(0, '未能找到路径').success, false)
})

test('UTF-8 中文跨数据块及交错标准错误输出保持完整，并提示检查 host', async () => {
  const stdout = '已读取 settings.json：模式 启动并加载 DLL\n'
  const stderr = '未能找到路径“C:\\WXWork\\WXWork.exe”的一部分。'
  const service = loadService(() => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    queueMicrotask(() => {
      const out = Buffer.from(stdout)
      const err = Buffer.from(stderr)
      child.stdout.emit('data', out.subarray(0, 1))
      child.stderr.emit('data', err.subarray(0, 2))
      child.stdout.emit('data', out.subarray(1))
      child.stderr.emit('data', err.subarray(2))
      child.emit('close', 1)
    })
    return child
  })
  const result = await service.runInjectTool({ port: 2370, callbackUrl: 'http://127.0.0.1:54322/msg', wecomVersion: 'v5' })
  assert.equal(result.success, false)
  assert.ok(result.output.startsWith(stdout + stderr))
  assert.match(result.output, /settings\.json 的 host/)
  assert.ok(!result.output.includes('\uFFFD'))
})
