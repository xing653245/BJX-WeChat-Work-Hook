const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { EventEmitter } = require('events')

function fixture(steps) {
  const updater = new EventEmitter()
  const feeds = [
    { id: 'gitee', label: 'Gitee', provider: 'generic', url: 'https://gitee.com/example/' },
    { id: 'github', label: 'GitHub', provider: 'github', owner: 'owner', repo: 'repo' }
  ]
  const calls = [], notifications = []
  updater.setFeedURL = feed => calls.push(feed.provider)
  updater.checkForUpdates = async () => {
    const step = steps.shift()
    const result = typeof step === 'function' ? await step() : step
    if (result instanceof Error) { updater.emit('error', result); throw result }
    if (result) updater.emit(result.isUpdateAvailable ? 'update-available' : 'update-not-available', result.updateInfo)
    return result
  }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/updateService.js'), 'utf8'), {
    module,
    require: name => {
      if (name === 'electron-updater') return { autoUpdater: updater }
      if (name === '../configs/updateFeeds') return { UPDATE_FEEDS: feeds }
      if (name === '../commons/diagnostics.cjs') return { createDiagnostics: () => ({ info() {}, warn() {} }) }
      throw new Error(name)
    }
  })
  const service = module.exports
  updater.on('error', () => { if (!service.shouldSuppressUpdateEvent()) notifications.push('error') })
  updater.on('update-not-available', () => { if (!service.shouldSuppressUpdateEvent()) notifications.push('none') })
  updater.on('update-available', () => notifications.push('available'))
  return { service, calls, notifications }
}
const none = { isUpdateAvailable: false, updateInfo: { version: '2.2.5' } }
const available = { isUpdateAvailable: true, updateInfo: { version: '2.2.6' } }

test('Gitee 有更新时保留其下载源，不检查 GitHub', async () => {
  const f = fixture([available])
  assert.equal((await f.service.checkForUpdatesWithFallback()).usedFallback, false)
  assert.deepEqual(f.calls, ['generic'])
  assert.equal(f.service.getActiveFeed().id, 'gitee')
})
test('Gitee 成功返回无更新时不再访问 GitHub', async () => {
  const f = fixture([none, available])
  assert.equal((await f.service.checkForUpdatesWithFallback()).feed.id, 'gitee')
  assert.deepEqual(f.calls, ['generic'])
  assert.deepEqual(f.notifications, ['none'])
  assert.equal(f.service.getActiveFeed().id, 'gitee')
})
for (const failure of [new Error('ETIMEDOUT'), new Error('404 Not Found'), new Error('Invalid YAML'), null]) {
  test(`Gitee 失败也尝试 GitHub：${failure?.message || '空结果'}`, async () => {
    const f = fixture([failure, available])
    assert.equal((await f.service.checkForUpdatesWithFallback()).feed.id, 'github')
    assert.deepEqual(f.notifications, ['available'])
    assert.equal(f.service.shouldSuppressUpdateEvent(), false)
  })
}
test('Gitee 失败后 GitHub 无更新时正常提示最新版', async () => {
  const f = fixture([new Error('404'), none])
  assert.equal((await f.service.checkForUpdatesWithFallback()).feed.id, 'github')
  assert.deepEqual(f.calls, ['generic', 'github'])
  assert.deepEqual(f.notifications, ['none'])
})
test('所有更新源均失败时才返回失败', async () => {
  const f = fixture([new Error('404'), new Error('net::ERR_CONNECTION_CLOSED')])
  await assert.rejects(f.service.checkForUpdatesWithFallback())
  assert.deepEqual(f.calls, ['generic', 'github'])
  assert.deepEqual(f.notifications, [])
  assert.equal(f.service.shouldSuppressUpdateEvent(), false)
})
test('ERR_CONNECTION_CLOSED 显示为 GitHub 网络连接失败', () => {
  const f = fixture([])
  const message = f.service.formatUpdateError(new Error('net::ERR_CONNECTION_CLOSED'), {
    action: '检查',
    feed: { id: 'github', provider: 'github' }
  })
  assert.match(message, /GitHub 更新（连接失败）/)
  assert.doesNotMatch(message, /ERR_CONNECTION_CLOSED/)
})
test('并发共用检查任务，下次检查仍从 Gitee 开始', async () => {
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  const f = fixture([() => pending, available, available])
  const first = f.service.checkForUpdatesWithFallback()
  assert.equal(first, f.service.checkForUpdatesWithFallback())
  finish(none)
  await first
  await f.service.checkForUpdatesWithFallback()
  assert.deepEqual(f.calls, ['generic', 'generic'])
})
