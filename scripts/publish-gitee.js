/**
 * 将 dist-electron 打包产物上传到 Gitee Release，供 electron-updater（generic）自动更新。
 *
 * 前置条件：
 * - 已执行 electron-builder，dist-electron 中存在 latest.yml 与安装包
 * - 环境变量 GITEE_TOKEN：Gitee 私人令牌（需 repo 权限）
 *
 * publish URL 示例：
 * https://gitee.com/curator-ovo/vwork-electron/releases/download/latest/
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const axios = require('axios')

const pkg = require('../package.json')
const DIST_DIR = path.join(__dirname, '..', 'dist-electron')

function parseGiteePublishConfig() {
  const pub = pkg.build?.publish?.[0]
  if (!pub || pub.provider !== 'generic' || !pub.url) {
    throw new Error('请在 package.json 的 build.publish 中配置 generic 类型的 Gitee URL')
  }
  const match = pub.url.match(/gitee\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/?/)
  if (!match) {
    throw new Error(`无法从 publish URL 解析 Gitee 仓库信息: ${pub.url}`)
  }
  return { owner: match[1], repo: match[2], tag: match[3] }
}

function getToken() {
  let token = process.env.GITEE_TOKEN || process.env.GITEE_ACCESS_TOKEN
  if (!token && process.platform === 'win32') {
    try {
      token = execSync(
        'powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable(\'GITEE_TOKEN\', \'User\')"',
        { encoding: 'utf-8' }
      ).trim()
    } catch {
      // ignore
    }
  }
  if (!token) {
    throw new Error(
      '请设置环境变量 GITEE_TOKEN（Gitee 设置 → 私人令牌）。' +
      'PowerShell: [System.Environment]::SetEnvironmentVariable(\'GITEE_TOKEN\', \'你的token\', \'User\')'
    )
  }
  return token
}

function collectReleaseFiles() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`未找到打包目录: ${DIST_DIR}，请先执行 npm run electron:build`)
  }

  const latestYmlPath = path.join(DIST_DIR, 'latest.yml')
  if (!fs.existsSync(latestYmlPath)) {
    throw new Error(`未找到 latest.yml，请确认 electron-builder 已成功完成 Windows 打包`)
  }

  const latestYml = fs.readFileSync(latestYmlPath, 'utf-8')
  const pathMatch = latestYml.match(/^path:\s*(.+)$/m)
  if (!pathMatch) {
    throw new Error('latest.yml 中缺少 path 字段')
  }

  const names = ['latest.yml', pathMatch[1].trim()]
  const blockmapName = `${names[1]}.blockmap`
  if (fs.existsSync(path.join(DIST_DIR, blockmapName))) {
    names.push(blockmapName)
  }

  for (const name of names) {
    if (name !== 'latest.yml' && !fs.existsSync(path.join(DIST_DIR, name))) {
      throw new Error(`缺少发布文件: ${name}`)
    }
  }

  return names.map((name) => path.join(DIST_DIR, name))
}

function getDefaultBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'master'
  }
}

async function giteeRequest(method, apiPath, token, { params, data, headers } = {}) {
  const url = `https://gitee.com/api/v5${apiPath}`
  try {
    const response = await axios({
      method,
      url,
      params: { access_token: token, ...params },
      data,
      headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (status) => status < 500,
    })
    if (response.status >= 400) {
      const detail = typeof response.data === 'object'
        ? JSON.stringify(response.data)
        : String(response.data || '')
      throw new Error(`Gitee API ${method} ${apiPath} 失败 (${response.status}): ${detail}`)
    }
    return response.data
  } catch (err) {
    if (err.response) {
      const detail = typeof err.response.data === 'object'
        ? JSON.stringify(err.response.data)
        : String(err.response.data || '')
      throw new Error(`Gitee API ${method} ${apiPath} 失败 (${err.response.status}): ${detail}`)
    }
    throw err
  }
}

async function getReleaseByTag(owner, repo, tag, token) {
  try {
    return await giteeRequest('GET', `/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`, token)
  } catch (err) {
    if (String(err.message).includes('(404)')) {
      return null
    }
    throw err
  }
}

async function createRelease(owner, repo, tag, token) {
  const version = pkg.version
  return giteeRequest('POST', `/repos/${owner}/${repo}/releases`, token, {
    data: {
      tag_name: tag,
      target_commitish: getDefaultBranch(),
      name: tag === 'latest' ? `Latest (${version})` : `v${version}`,
      body: `北极熊企微框架Pro v${version}\n\n自动发布于 ${new Date().toLocaleString('zh-CN')}`,
      prerelease: false,
    },
  })
}

async function listAttachments(owner, repo, releaseId, token) {
  const data = await giteeRequest(
    'GET',
    `/repos/${owner}/${repo}/releases/${releaseId}/attach_files`,
    token
  )
  return Array.isArray(data) ? data : []
}

async function deleteAttachment(owner, repo, releaseId, attachId, token) {
  await giteeRequest(
    'DELETE',
    `/repos/${owner}/${repo}/releases/${releaseId}/attach_files/${attachId}`,
    token
  )
}

async function uploadAttachment(owner, repo, releaseId, filePath, token) {
  const filename = path.basename(filePath)
  const bytes = fs.readFileSync(filePath)
  const form = new FormData()
  form.append('access_token', token)
  form.append('file', new Blob([bytes]), filename)

  const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/releases/${releaseId}/attach_files`
  const response = await fetch(url, { method: 'POST', body: form })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`上传 ${filename} 失败 (${response.status}): ${text}`)
  }
  return response.json()
}

async function replaceReleaseAssets(owner, repo, releaseId, files, token) {
  const existing = await listAttachments(owner, repo, releaseId, token)

  for (const item of existing) {
    const name = item.name || item.filename
    if (name) {
      console.log(`[publish-gitee] 删除旧附件: ${name}`)
      await deleteAttachment(owner, repo, releaseId, item.id, token)
    }
  }

  for (const filePath of files) {
    const name = path.basename(filePath)
    const sizeMb = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2)
    console.log(`[publish-gitee] 上传: ${name} (${sizeMb} MB)`)
    await uploadAttachment(owner, repo, releaseId, filePath, token)
    console.log(`[publish-gitee] 完成: ${name}`)
  }
}

async function main() {
  const { owner, repo, tag } = parseGiteePublishConfig()
  const token = getToken()
  const files = collectReleaseFiles()

  console.log(`[publish-gitee] 目标: gitee.com/${owner}/${repo} @ ${tag}`)
  console.log(`[publish-gitee] 版本: v${pkg.version}`)
  console.log(`[publish-gitee] 文件: ${files.map((f) => path.basename(f)).join(', ')}`)

  let release = await getReleaseByTag(owner, repo, tag, token)
  if (!release) {
    console.log(`[publish-gitee] 创建 Release 标签: ${tag}`)
    release = await createRelease(owner, repo, tag, token)
  }

  await replaceReleaseAssets(owner, repo, release.id, files, token)

  const baseUrl = pkg.build.publish[0].url.replace(/\/?$/, '/')
  console.log('[publish-gitee] 发布完成')
  console.log(`[publish-gitee] 更新地址: ${baseUrl}latest.yml`)
}

main().catch((err) => {
  console.error('[publish-gitee] 失败:', err.message || err)
  process.exit(1)
})
