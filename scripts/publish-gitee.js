const { createDiagnostics } = require('../electron/commons/diagnostics.cjs')
const diagnostics = createDiagnostics('publish-gitee.js')
/**
 * 将 dist-electron 打包产物上传到 Gitee Release，供 electron-updater（generic）自动更新。
 *
 * 发布策略：
 * 1. 创建/更新版本 Release（如 v1.2.0）——保留历史版本，不删除旧 Release
 * 2. 同步更新 latest Release —— 供自动更新 URL 使用
 *
 * 前置条件：
 * - 已执行 electron-builder，dist-electron 中存在 latest.yml 与安装包
 * - 环境变量 GITEE_TOKEN：Gitee 私人令牌（需 repo 权限）
 */
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const {
  pkg,
  collectReleaseFiles,
  getDefaultBranch,
  getEnvToken,
  normalizeReleaseFilesForPublish,
  buildReleaseBody
} = require('./publish-utils')

function parseGiteePublishConfig() {
  const pub = pkg.build?.publish?.[0]
  if (!pub || pub.provider !== 'generic' || !pub.url) {
    throw new Error('请在 package.json 的 build.publish 中配置 generic 类型的 Gitee URL')
  }
  const match = pub.url.match(/gitee\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/?/)
  if (!match) {
    throw new Error(`无法从 publish URL 解析 Gitee 仓库信息: ${pub.url}`)
  }
  return { owner: match[1], repo: match[2], latestTag: match[3] }
}

function getToken() {
  return getEnvToken(
    ['GITEE_TOKEN', 'GITEE_ACCESS_TOKEN'],
    '请设置环境变量 GITEE_TOKEN（Gitee 设置 → 私人令牌）。' +
      "PowerShell: [System.Environment]::SetEnvironmentVariable('GITEE_TOKEN', '你的token', 'User')"
  )
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
      validateStatus: (status) => status < 500
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

async function createRelease(owner, repo, tag, token, { title, version } = {}) {
  const ver = version || pkg.version
  const name = title || tag
  return giteeRequest('POST', `/repos/${owner}/${repo}/releases`, token, {
    data: {
      tag_name: tag,
      target_commitish: getDefaultBranch(),
      name,
      body: buildReleaseBody(ver),
      prerelease: false
    }
  })
}

async function updateRelease(owner, repo, releaseId, tag, token, { title, version } = {}) {
  const ver = version || pkg.version
  const name = title || tag
  return giteeRequest('PATCH', `/repos/${owner}/${repo}/releases/${releaseId}`, token, {
    data: {
      tag_name: tag,
      name,
      body: buildReleaseBody(ver)
    }
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

async function uploadAttachment(owner, repo, releaseId, filePath, token, uploadName) {
  const filename = uploadName || path.basename(filePath)
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

async function replaceReleaseAssets(owner, repo, releaseId, uploadPlan, token) {
  const existing = await listAttachments(owner, repo, releaseId, token)
  const targetNames = new Set(uploadPlan.map((item) => item.uploadName))
  const replacingExe = uploadPlan.some((item) => item.uploadName.endsWith('.exe'))

  for (const item of existing) {
    const name = item.name || item.filename
    const shouldDelete =
      name &&
      (targetNames.has(name) ||
        (replacingExe && (name.endsWith('.exe') || name.endsWith('.blockmap'))))
    if (shouldDelete) {
      diagnostics.info('L001', `[publish-gitee] 删除旧附件: ${name}`)
      await deleteAttachment(owner, repo, releaseId, item.id, token)
    }
  }

  for (const { localPath, uploadName } of uploadPlan) {
    const sizeMb = (fs.statSync(localPath).size / 1024 / 1024).toFixed(2)
    diagnostics.info('L002', `[publish-gitee] 上传: ${uploadName} (${sizeMb} MB)`)
    await uploadAttachment(owner, repo, releaseId, localPath, token, uploadName)
    diagnostics.info('L003', `[publish-gitee] 完成: ${uploadName}`)
  }
}

async function publishToTag(owner, repo, tag, token, rawFiles, { title, version } = {}) {
  const ver = version || pkg.version
  diagnostics.info('L004', `\n[publish-gitee] ---- 标签: ${tag} ----`)

  const { uploadPlan, tempDir } = normalizeReleaseFilesForPublish(rawFiles, ver)

  try {
    let release = await getReleaseByTag(owner, repo, tag, token)
    if (!release) {
      diagnostics.info('L005', `[publish-gitee] 创建 Release: ${tag}`)
      release = await createRelease(owner, repo, tag, token, { title, version: ver })
    } else {
      diagnostics.info('L006', `[publish-gitee] 更新已有 Release 信息: ${tag}`)
      release = await updateRelease(owner, repo, release.id, tag, token, { title, version: ver })
    }

    await replaceReleaseAssets(owner, repo, release.id, uploadPlan, token)
    diagnostics.info('L007', `[publish-gitee] 标签 ${tag} 发布完成`)
  } finally {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

async function publishVersionOnly(version, files) {
  const { owner, repo } = parseGiteePublishConfig()
  const token = getToken()
  const versionTag = version.startsWith('v') ? version : `v${version}`
  await publishToTag(owner, repo, versionTag, token, files, {
    title: versionTag,
    version: version.replace(/^v/, '')
  })
  diagnostics.info('L008', `[publish-gitee] 版本归档: https://gitee.com/${owner}/${repo}/releases/tag/${versionTag}`)
}

async function main() {
  const { owner, repo, latestTag } = parseGiteePublishConfig()
  const token = getToken()
  const files = collectReleaseFiles()
  const versionTag = `v${pkg.version}`

  diagnostics.info('L009', `[publish-gitee] 目标仓库: gitee.com/${owner}/${repo}`)
  diagnostics.info('L010', `[publish-gitee] 版本: v${pkg.version}`)
  diagnostics.info('L011', `[publish-gitee] 文件: ${files.map((f) => path.basename(f)).join(', ')}`)

  // 1. 版本 Release：每次新版本追加一条，保留历史
  await publishToTag(owner, repo, versionTag, token, files, {
    title: `v${pkg.version}`
  })

  // 2. latest Release：供 electron-updater generic 源使用，仅覆盖 latest 附件
  await publishToTag(owner, repo, latestTag, token, files, {
    title: `Latest (${pkg.version})`
  })

  const baseUrl = pkg.build.publish[0].url.replace(/\/?$/, '/')
  diagnostics.info('L012', '\n[publish-gitee] 全部发布完成')
  diagnostics.info('L013', `[publish-gitee] 自动更新地址: ${baseUrl}latest.yml`)
  diagnostics.info('L014', `[publish-gitee] 版本归档地址: https://gitee.com/${owner}/${repo}/releases/tag/${versionTag}`)
}

module.exports = {
  publishVersionOnly
}

if (require.main === module) {
  main().catch((err) => {
    diagnostics.error('L015', '[publish-gitee] 失败:', err.message || err)
    process.exit(1)
  })
}
