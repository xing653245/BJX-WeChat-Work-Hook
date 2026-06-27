/**
 * 将 dist-electron 打包产物上传到 GitHub Release，供 electron-updater（github provider）自动更新。
 *
 * 前置条件：
 * - 已执行 electron-builder，dist-electron 中存在 latest.yml 与安装包
 * - 环境变量 GH_TOKEN 或 GITHUB_TOKEN：GitHub Personal Access Token（需 repo 权限）
 */
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const { pkg, collectReleaseFiles, getEnvToken } = require('./publish-utils')

function parseGithubPublishConfig() {
  const publishList = Array.isArray(pkg.build?.publish) ? pkg.build.publish : []
  const entry = publishList.find((item) => item.provider === 'github')
  if (!entry?.owner || !entry?.repo) {
    throw new Error('请在 package.json 的 build.publish 中配置 github provider（owner + repo）')
  }
  return { owner: entry.owner, repo: entry.repo }
}

function getGithubToken() {
  return getEnvToken(
    ['GH_TOKEN', 'GITHUB_TOKEN'],
    '请设置环境变量 GH_TOKEN（GitHub Settings → Developer settings → Personal access tokens）。' +
      "PowerShell: [System.Environment]::SetEnvironmentVariable('GH_TOKEN', '你的token', 'User')"
  )
}

async function githubRequest(method, apiPath, token, { data, params, responseType } = {}) {
  try {
    const response = await axios({
      method,
      url: `https://api.github.com${apiPath}`,
      params,
      data,
      responseType,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (status) => status < 500
    })
    if (response.status >= 400) {
      const detail = typeof response.data === 'object'
        ? JSON.stringify(response.data)
        : String(response.data || '')
      throw new Error(`GitHub API ${method} ${apiPath} 失败 (${response.status}): ${detail}`)
    }
    return response.data
  } catch (err) {
    if (err.response) {
      const detail = typeof err.response.data === 'object'
        ? JSON.stringify(err.response.data)
        : String(err.response.data || '')
      throw new Error(`GitHub API ${method} ${apiPath} 失败 (${err.response.status}): ${detail}`)
    }
    throw err
  }
}

async function getReleaseByTag(owner, repo, tag, token) {
  try {
    return await githubRequest(
      'GET',
      `/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
      token
    )
  } catch (err) {
    if (String(err.message).includes('(404)')) {
      return null
    }
    throw err
  }
}

async function getRepoDefaultBranch(owner, repo, token) {
  const repoInfo = await githubRequest('GET', `/repos/${owner}/${repo}`, token)
  return repoInfo.default_branch || 'main'
}

async function createRelease(owner, repo, tag, token) {
  const targetBranch = await getRepoDefaultBranch(owner, repo, token)
  console.log(`[publish-github] 基于远程默认分支 ${targetBranch} 创建 Release`)
  return githubRequest('POST', `/repos/${owner}/${repo}/releases`, token, {
    data: {
      tag_name: tag,
      target_commitish: targetBranch,
      name: tag,
      body: `北极熊企微框架Pro v${pkg.version}\n\n自动发布于 ${new Date().toLocaleString('zh-CN')}`,
      draft: false,
      prerelease: false
    }
  })
}

async function deleteReleaseAsset(owner, repo, assetId, token) {
  await githubRequest('DELETE', `/repos/${owner}/${repo}/releases/assets/${assetId}`, token)
}

async function uploadReleaseAsset(uploadUrl, filePath, token) {
  const filename = path.basename(filePath)
  const url = uploadUrl.replace(/\{[^}]+\}/, `?name=${encodeURIComponent(filename)}`)
  const bytes = fs.readFileSync(filePath)

  const response = await axios.post(url, bytes, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/octet-stream',
      'Content-Length': bytes.length
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: (status) => status < 500
  })

  if (response.status >= 400) {
    const detail = typeof response.data === 'object'
      ? JSON.stringify(response.data)
      : String(response.data || '')
    throw new Error(`上传 ${filename} 失败 (${response.status}): ${detail}`)
  }

  return response.data
}

async function replaceReleaseAssets(owner, repo, release, files, token) {
  const existing = Array.isArray(release.assets) ? release.assets : []
  const uploadNames = new Set(files.map((filePath) => path.basename(filePath)))

  for (const asset of existing) {
    if (asset.name && uploadNames.has(asset.name)) {
      console.log(`[publish-github] 删除旧附件: ${asset.name}`)
      await deleteReleaseAsset(owner, repo, asset.id, token)
    }
  }

  for (const filePath of files) {
    const name = path.basename(filePath)
    const sizeMb = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2)
    console.log(`[publish-github] 上传: ${name} (${sizeMb} MB)`)
    await uploadReleaseAsset(release.upload_url, filePath, token)
    console.log(`[publish-github] 完成: ${name}`)
  }
}

async function main() {
  const { owner, repo } = parseGithubPublishConfig()
  const token = getGithubToken()
  const files = collectReleaseFiles()
  const tag = `v${pkg.version}`

  console.log(`[publish-github] 目标: github.com/${owner}/${repo} @ ${tag}`)
  console.log(`[publish-github] 版本: v${pkg.version}`)
  console.log(`[publish-github] 文件: ${files.map((f) => path.basename(f)).join(', ')}`)

  let release = await getReleaseByTag(owner, repo, tag, token)
  if (!release) {
    console.log(`[publish-github] 创建 Release 标签: ${tag}`)
    release = await createRelease(owner, repo, tag, token)
  }

  await replaceReleaseAssets(owner, repo, release, files, token)

  console.log('[publish-github] 发布完成')
  console.log(`[publish-github] 更新地址: https://github.com/${owner}/${repo}/releases/tag/${tag}`)
}

main().catch((err) => {
  console.error('[publish-github] 失败:', err.message || err)
  process.exit(1)
})
