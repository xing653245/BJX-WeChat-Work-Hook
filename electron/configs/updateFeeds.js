/**
 * 自动更新源配置：优先 Gitee，失败后回退 GitHub
 *
 * Gitee：generic 源，URL 来自 package.json build.publish
 * GitHub：与 v1.1.4 一致，使用 electron-updater 的 github provider
 *         owner: xing653245, repo: WeChat-Work-Hook
 */
const pkg = require('../../package.json')

const DEFAULT_GITEE_URL = 'https://gitee.com/curator-ovo/vwork-electron/releases/download/latest/'
const DEFAULT_GITHUB_OWNER = 'xing653245'
const DEFAULT_GITHUB_REPO = 'WeChat-Work-Hook'

function normalizeFeedUrl(url) {
  if (!url) return ''
  return url.endsWith('/') ? url : `${url}/`
}

function listPublishEntries() {
  const pub = pkg.build?.publish
  if (!pub) return []
  return Array.isArray(pub) ? pub : [pub]
}

function buildGiteeFeed() {
  const entry = listPublishEntries().find(
    (item) => item.provider === 'generic' && item.url && item.url.includes('gitee.com')
  )
  const url = normalizeFeedUrl(entry?.url || DEFAULT_GITEE_URL)
  return {
    id: 'gitee',
    label: 'Gitee',
    provider: 'generic',
    url
  }
}

function buildGithubFeed() {
  const entry = listPublishEntries().find((item) => item.provider === 'github')
  const owner = entry?.owner || DEFAULT_GITHUB_OWNER
  const repo = entry?.repo || DEFAULT_GITHUB_REPO
  return {
    id: 'github',
    label: 'GitHub',
    provider: 'github',
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}/`
  }
}

const UPDATE_FEEDS = [buildGiteeFeed(), buildGithubFeed()]

module.exports = {
  UPDATE_FEEDS,
  DEFAULT_GITHUB_OWNER,
  DEFAULT_GITHUB_REPO
}
