const { createDiagnostics } = require('../commons/diagnostics.cjs')
const diagnostics = createDiagnostics('services/updateService.js')
/**
 * 自动更新：优先 Gitee，无新版本或检查失败时继续尝试 GitHub
 */
const { autoUpdater } = require('electron-updater')
const { UPDATE_FEEDS } = require('../configs/updateFeeds')

let activeFeed = UPDATE_FEEDS[0]
let suppressErrorEvents = false
let checkingPromise = null

function getActiveFeed() {
  return activeFeed
}

function shouldSuppressUpdateEvent() {
  return suppressErrorEvents
}

function applyFeed(feed) {
  activeFeed = feed
  if (feed.provider === 'github') {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: feed.owner,
      repo: feed.repo
    })
    return
  }
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: feed.url
  })
}

function describeFeed(feed) {
  if (feed.provider === 'github') {
    return `github.com/${feed.owner}/${feed.repo}`
  }
  return feed.url
}

function normalizeErrorMessage(err) {
  return String(err?.message || err || '').trim()
}

function isNetworkUnreachableError(message) {
  const lower = normalizeErrorMessage(message).toLowerCase()
  if (!lower) return false
  return (
    lower.includes('enotfound') ||
    lower.includes('getaddrinfo') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('enetunreach') ||
    lower.includes('ehostunreach') ||
    lower.includes('network error') ||
    lower.includes('socket hang up') ||
    lower.includes('net::err_connection_timed_out') ||
    lower.includes('net::err_connection_reset') ||
    lower.includes('net::err_name_not_resolved') ||
    lower.includes('net::err_internet_disconnected') ||
    lower.includes('net::err_network_changed') ||
    lower.includes('net::err_proxy')
  )
}

function isGithubFeed(feed) {
  return feed?.id === 'github' || feed?.provider === 'github'
}

function formatFeedNetworkError(feed, action = '检查') {
  if (isGithubFeed(feed)) {
    return `无法${action} GitHub 更新（连接超时），国内网络通常需开启 VPN/代理 后重试`
  }
  if (feed?.id === 'gitee') {
    return `无法${action} Gitee 更新，请检查网络连接后重试`
  }
  return `无法${action}更新服务器，请检查网络连接后重试`
}

function formatFeedFailure(feed, err, action = '检查') {
  const msg = normalizeErrorMessage(err)
  if (isNetworkUnreachableError(msg)) {
    return formatFeedNetworkError(feed, action)
  }
  if (msg.includes('404') || msg.includes('Not Found')) {
    return `${feed.label} 未找到对应版本安装包，请联系管理员重新发布`
  }
  const brief = msg.length > 120 ? `${msg.slice(0, 120)}…` : msg
  return `${feed.label} ${action}失败：${brief}`
}

function formatUpdateError(err, { action = '检查', feed = null } = {}) {
  const msg = normalizeErrorMessage(err)

  if (!msg) {
    return action === '下载' ? '下载更新失败，请稍后重试' : '检查更新失败，请稍后重试'
  }

  if (msg.includes('所有更新源均不可用')) {
    return msg
  }

  if (feed && isNetworkUnreachableError(msg)) {
    return formatFeedNetworkError(feed, action)
  }

  if (isNetworkUnreachableError(msg)) {
    if (msg.toLowerCase().includes('github.com') || msg.toLowerCase().includes('github')) {
      return `无法${action} GitHub 更新（连接超时），请开启 VPN/代理 后重试`
    }
    if (msg.toLowerCase().includes('gitee.com') || msg.toLowerCase().includes('gitee')) {
      return `无法${action} Gitee 更新，请检查网络连接后重试`
    }
    return `网络不可达或连接超时，请检查网络；若使用 GitHub 更新源，请开启 VPN/代理 后重试`
  }

  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
    return '无法解析更新服务器地址，请检查网络或 DNS 设置'
  }

  if (msg.includes('ECONNREFUSED')) {
    return '更新服务器拒绝连接，请稍后重试'
  }

  if (msg.includes('404') || msg.includes('Not Found')) {
    return '未找到更新安装包，可能尚未发布，请稍后再试'
  }

  return action === '下载' ? `下载更新失败：${msg}` : `更新检查失败：${msg}`
}

function buildCombinedError(failures, action = '检查') {
  if (!failures.length) {
    return new Error(formatUpdateError(null, { action }))
  }

  if (failures.length === 1) {
    return new Error(formatFeedFailure(failures[0].feed, failures[0].err, action))
  }

  const giteeFailed = failures.find((item) => item.feed.id === 'gitee')
  const githubFailed = failures.find((item) => item.feed.id === 'github')

  if (giteeFailed && githubFailed) {
    const giteeNet = isNetworkUnreachableError(giteeFailed.err)
    const githubNet = isNetworkUnreachableError(githubFailed.err)
    if (giteeNet && githubNet) {
      return new Error(
        '所有更新源均连接失败：Gitee 不可达，GitHub 连接超时（国内通常需开启 VPN/代理）。请检查网络或开启代理后重试'
      )
    }
  }

  const detail = failures
    .map(({ feed, err }) => formatFeedFailure(feed, err, action))
    .join('；')
  return new Error(`所有更新源均不可用：${detail}`)
}

function checkForUpdatesWithFallback() {
  // 启动检查与按钮检查共用任务，防止检查期间切换彼此的下载源。
  if (!checkingPromise) {
    checkingPromise = checkFeeds().finally(() => { checkingPromise = null })
  }
  return checkingPromise
}

async function checkFeeds() {
  suppressErrorEvents = true
  const failures = []
  let lastResult

  try {
    for (let i = 0; i < UPDATE_FEEDS.length; i++) {
      const feed = UPDATE_FEEDS[i]
      try {
        applyFeed(feed)
        diagnostics.info('L001', '[update] 正在从 ' + feed.label + ' 检查更新: ' + describeFeed(feed))
        const result = await autoUpdater.checkForUpdates()
        if (!result || typeof result.isUpdateAvailable !== 'boolean') {
          throw new Error('更新源未返回有效检查结果')
        }
        lastResult = { feed, usedFallback: i > 0, result }
        if (result.isUpdateAvailable) return lastResult
        // 无新版本仍需检查下一个源，不向界面发送中间的“已是最新版”。
      } catch (err) {
        failures.push({ feed, err })
        diagnostics.warn('L003', '[update] ' + feed.label + ' 检查失败:', err?.message || err)
      }
    }

    if (failures.length) {
      // 任一源未能检查，且其余源没有更新，不能断言已是最新版。
      throw buildCombinedError(failures, '检查')
    }
    if (!lastResult) throw new Error('未配置可用的更新源')
    suppressErrorEvents = false
    autoUpdater.emit('update-not-available', lastResult.result.updateInfo)
    return lastResult
  } finally {
    suppressErrorEvents = false
  }
}

function initUpdateFeeds() {
  applyFeed(UPDATE_FEEDS[0])
}

module.exports = {
  getActiveFeed,
  shouldSuppressUpdateEvent,
  formatUpdateError,
  checkForUpdatesWithFallback,
  initUpdateFeeds
}
