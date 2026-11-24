const { createDiagnostics, userMessage } = require('../commons/diagnostics.cjs')
const diagnostics = createDiagnostics('services/updateService.js')
/**
 * 自动更新：优先 Gitee，仅当 Gitee 检查失败时回退到 GitHub
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

function describeNetworkFailure(message) {
  const lower = [message?.code, normalizeErrorMessage(message)].filter(Boolean).join(' ').toLowerCase()
  if (!lower) return ''
  if (lower.includes('eai_again')) return '更新服务器地址解析暂时失败'
  if (lower.includes('enotfound') || lower.includes('getaddrinfo') || lower.includes('err_name_not_resolved')) return '无法解析更新服务器地址'
  if (lower.includes('etimedout') || lower.includes('err_connection_timed_out') || lower.includes('timeout')) return '连接更新服务器超时'
  if (lower.includes('econnrefused')) return '更新服务器拒绝连接'
  if (lower.includes('econnreset') || lower.includes('err_connection_reset')) return '更新服务器重置了连接'
  if (lower.includes('err_connection_closed') || lower.includes('socket hang up')) return '连接在完成前被关闭'
  if (lower.includes('err_internet_disconnected')) return '本机网络已断开'
  if (lower.includes('enetunreach')) return '当前网络无法到达更新服务器'
  if (lower.includes('ehostunreach')) return '更新服务器主机不可达'
  if (lower.includes('err_proxy_connection_failed')) return '无法连接代理服务器'
  if (lower.includes('err_tunnel_connection_failed')) return '代理隧道建立失败'
  if (lower.includes('err_proxy_certificate_invalid')) return '代理服务器证书无效'
  if (lower.includes('err_proxy_auth_unsupported')) return '代理服务器要求的认证方式不受支持'
  if (lower.includes('err_no_supported_proxies')) return '没有可用的受支持代理'
  if (lower.includes('err_proxy')) return '代理请求失败，请按故障报告中的具体代理错误码排查'
  if (lower.includes('err_network_changed')) return '检查更新时网络发生了变化'
  if (lower.includes('network error')) return '更新请求没有得到响应'
  return ''
}

function isGithubFeed(feed) {
  return feed?.id === 'github' || feed?.provider === 'github'
}

function formatFeedNetworkError(feed, failure, action = '检查') {
  const where = feed?.label || (isGithubFeed(feed) ? 'GitHub' : feed?.id === 'gitee' ? 'Gitee' : '更新服务器')
  const proxy = isGithubFeed(feed) ? '。访问 GitHub 失败时，国内网络通常需要可用的代理' : ''
  return `无法${action} ${where} 更新（${failure}）${proxy}`
}

function formatFeedFailure(feed, err, action = '检查') {
  const msg = normalizeErrorMessage(err)
  const network = describeNetworkFailure(err)
  if (network) {
    return formatFeedNetworkError(feed, network, action)
  }
  if (msg.includes('404') || msg.includes('Not Found')) {
    return `${feed.label} 未找到对应版本安装包`
  }
  const brief = userMessage(err, '未能识别具体原因，请导出故障报告')
  return `${feed.label} ${action}失败：${brief}`
}

function formatUpdateError(err, { action = '检查', feed = null } = {}) {
  const msg = normalizeErrorMessage(err)

  if (!msg) {
    return action === '下载' ? '下载更新失败，请稍后重试' : '检查更新失败，请稍后重试'
  }

  if (msg.includes('所有更新源均不可用') || msg.includes('所有更新源均连接失败')) {
    return msg
  }

  if (feed) return formatFeedFailure(feed, err, action)

  const network = describeNetworkFailure(err)
  if (network) {
    if (msg.toLowerCase().includes('github')) return `无法${action} GitHub 更新（${network}）。访问 GitHub 失败时，国内网络通常需要可用的代理`
    if (msg.toLowerCase().includes('gitee')) return `无法${action} Gitee 更新（${network}）`
    return network
  }

  if (msg.includes('404') || msg.includes('Not Found')) {
    return '未找到对应的更新安装包'
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
        const checked = { feed, usedFallback: i > 0, result }
        if (result.isUpdateAvailable) return checked

        // 更新源是同一版本的镜像：主源成功返回“无更新”即可采信。
        // 只有当前源检查失败时才访问备用源，避免 Gitee 正常时
        // 因 GitHub 在国内网络不可达而误报整体更新检查失败。
        suppressErrorEvents = false
        autoUpdater.emit('update-not-available', result.updateInfo)
        return checked
      } catch (err) {
        failures.push({ feed, err })
        diagnostics.warn('L003', '[update] ' + feed.label + ' 检查失败:', err?.message || err)
      }
    }

    if (failures.length) throw buildCombinedError(failures, '检查')
    throw new Error('未配置可用的更新源')
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
