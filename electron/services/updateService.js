/**
 * 自动更新：优先 Gitee，失败后尝试 GitHub
 */
const { autoUpdater } = require('electron-updater')
const { UPDATE_FEEDS } = require('../configs/updateFeeds')

let activeFeed = UPDATE_FEEDS[0]
let suppressErrorEvents = false

function getActiveFeed() {
  return activeFeed
}

function shouldSuppressErrorEvent() {
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

function isRetriableUpdateError(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  if (!msg) return true
  return (
    msg.includes('enotfound') ||
    msg.includes('getaddrinfo') ||
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('network') ||
    msg.includes('404') ||
    msg.includes('403') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('httperror') ||
    msg.includes('latest.yml') ||
    msg.includes('net::') ||
    msg.includes('socket hang up')
  )
}

function formatUpdateError(err) {
  const msg = err?.message || String(err || '')
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
    return '无法连接到更新服务器，请检查网络连接'
  }
  if (msg.toLowerCase().includes('timeout') || msg.includes('ETIMEDOUT')) {
    return '连接更新服务器超时，请稍后重试'
  }
  if (msg.includes('ECONNREFUSED')) {
    return '更新服务器拒绝连接，请稍后重试'
  }
  if (msg.includes('所有更新源均不可用')) {
    return msg
  }
  return msg ? `更新检查失败: ${msg}` : '更新检查失败'
}

function buildCombinedError(failures) {
  if (!failures.length) {
    return new Error('检查更新失败')
  }
  if (failures.length === 1) {
    return failures[0].err
  }
  const detail = failures
    .map(({ feed, err }) => `${feed.label}: ${err?.message || err}`)
    .join('；')
  return new Error(`所有更新源均不可用（${detail}）`)
}

async function checkForUpdatesWithFallback() {
  suppressErrorEvents = true
  const failures = []

  try {
    for (let i = 0; i < UPDATE_FEEDS.length; i++) {
      const feed = UPDATE_FEEDS[i]
      applyFeed(feed)
      console.log(`[update] 正在从 ${feed.label} 检查更新: ${describeFeed(feed)}`)

      try {
        const result = await autoUpdater.checkForUpdates()
        const usedFallback = i > 0
        if (usedFallback) {
          console.log(`[update] ${UPDATE_FEEDS[0].label} 不可用，已改用 ${feed.label} 更新源`)
        }
        return {
          feed,
          usedFallback,
          result
        }
      } catch (err) {
        failures.push({ feed, err })
        console.warn(`[update] ${feed.label} 检查失败:`, err?.message || err)

        const hasNext = i < UPDATE_FEEDS.length - 1
        if (hasNext && isRetriableUpdateError(err)) {
          continue
        }
        break
      }
    }

    throw buildCombinedError(failures)
  } finally {
    suppressErrorEvents = false
  }
}

function initUpdateFeeds() {
  applyFeed(UPDATE_FEEDS[0])
}

module.exports = {
  UPDATE_FEEDS,
  getActiveFeed,
  shouldSuppressErrorEvent,
  applyFeed,
  formatUpdateError,
  checkForUpdatesWithFallback,
  initUpdateFeeds
}
