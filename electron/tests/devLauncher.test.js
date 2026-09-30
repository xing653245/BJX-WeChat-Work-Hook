const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')

// 模拟 Electron 子进程，验证启动器生命周期，不启动真实企微或占用业务端口。
async function launch({ listenError = false } = {}) {
  let closed = 0, spawned = 0, options
  const process = Object.assign(new EventEmitter(), { env: { ELECTRON_RUN_AS_NODE: '1' }, exit() {} })
  const child = Object.assign(new EventEmitter(), {
    exitCode: null, signalCode: null,
    kill() { this.signalCode = 'SIGTERM'; this.emit('exit', null) }
  })
  const server = {
    resolvedUrls: { local: ['http://localhost:5199/'] },
    async listen() { if (listenError) throw new Error('listen failed') },
    async close() { closed++ }
  }
  const script = fs.readFileSync(path.join(__dirname, '../../scripts/electron-dev.mjs'), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace("const root = fileURLToPath(new URL('../', import.meta.url))", "const root = 'project'")
  await vm.runInNewContext(`(async () => {${script}\n})()`, {
    process, console: { log() {}, error() {} },
    setTimeout: () => ({ unref() {} }), electron: 'electron',
    createServer: async () => server,
    spawn: (exe, args, opts) => { spawned++; options = opts; return child }
  })
  return { process, child, get closed() { return closed }, get spawned() { return spawned }, options }
}

test('开发启动器把实际端口传给 Electron，Electron 退出时关闭 Vite', async () => {
  const run = await launch()
  assert.equal(run.options.env.VWORK_DEV_SERVER_URL, 'http://localhost:5199/')
  assert.equal(run.options.env.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(run.options.windowsHide, false, 'Electron 主窗口必须以可见方式启动')
  run.child.exitCode = 0
  run.child.emit('exit', 0)
  await new Promise(setImmediate)
  assert.equal(run.closed, 1)
  assert.equal(run.process.exitCode, 0)
})

test('开发服务启动失败不启动 Electron，取消启动只清理一次', async () => {
  const failed = await launch({ listenError: true })
  assert.equal(failed.spawned, 0)
  assert.equal(failed.closed, 1)
  assert.equal(failed.process.exitCode, 1)
  const run = await launch()
  run.process.emit('SIGINT')
  run.process.emit('SIGTERM')
  await new Promise(setImmediate)
  assert.equal(run.child.signalCode, 'SIGTERM')
  assert.equal(run.closed, 1)
})
