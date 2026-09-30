const { createDiagnostics } = require('../electron/commons/diagnostics.cjs')
const diagnostics = createDiagnostics('publish-github.js')
/**
 * 将 dist-electron 打包产物上传到 GitHub Release，供 electron-updater（github provider）自动更新。
 */
const fs = require('fs')
const axios = require('axios')
const {
  pkg,
  collectReleaseFiles,
  normalizeReleaseFilesForPublish,
  getEnvToken,
  buildReleaseBody
} = require('./publish-utils')

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
  diagnostics.info('L001', `[publish-github] 基于远程默认分支 ${targetBranch} 创建 Release`)
  return githubRequest('POST', `/repos/${owner}/${repo}/releases`, token, {
    data: {
      tag_name: tag,
      target_commitish: targetBranch,
      name: tag,
      body: buildReleaseBody(pkg.version),
      draft: false,
      prerelease: false
    }
  })
}

async function updateReleaseBody(owner, repo, releaseId, token) {
  return githubRequest('PATCH', `/repos/${owner}/${repo}/releases/${releaseId}`, token, {
    data: {
      body: buildReleaseBody(pkg.version)
    }
  })
}

async function deleteReleaseAsset(owner, repo, assetId, token) {
  await githubRequest('DELETE', `/repos/${owner}/${repo}/releases/assets/${assetId}`, token)
}

async function uploadReleaseAsset(uploadUrl, filePath, token, uploadName) {
  const url = uploadUrl.replace(/\{[^}]+\}/, `?name=${encodeURIComponent(uploadName)}`)
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
    throw new Error(`上传 ${uploadName} 失败 (${response.status}): ${detail}`)
  }

  return response.data
}

async function replaceReleaseAssets(owner, repo, release, uploadPlan, token) {
  const existing = Array.isArray(release.assets) ? release.assets : []
  const targetNames = new Set(uploadPlan.map((item) => item.uploadName))
  const replacingExe = uploadPlan.some((item) => item.uploadName.endsWith('.exe'))

  for (const asset of existing) {
    const shouldDelete =
      targetNames.has(asset.name) ||
      (replacingExe && (asset.name.endsWith('.exe') || asset.name.endsWith('.blockmap')))
    if (shouldDelete) {
      diagnostics.info('L002', `[publish-github] 删除旧附件: ${asset.name}`)
      await deleteReleaseAsset(owner, repo, asset.id, token)
    }
  }

  for (const { localPath, uploadName } of uploadPlan) {
    const sizeMb = (fs.statSync(localPath).size / 1024 / 1024).toFixed(2)
    diagnostics.info('L003', `[publish-github] 上传: ${uploadName} (${sizeMb} MB)`)
    await uploadReleaseAsset(release.upload_url, localPath, token, uploadName)
    diagnostics.info('L004', `[publish-github] 完成: ${uploadName}`)
  }
}

async function main() {
  const { owner, repo } = parseGithubPublishConfig()
  const token = getGithubToken()
  const rawFiles = collectReleaseFiles()
  const { uploadPlan, tempDir } = normalizeReleaseFilesForPublish(rawFiles)
  const tag = `v${pkg.version}`

  diagnostics.info('L005', `[publish-github] 目标: github.com/${owner}/${repo} @ ${tag}`)
  diagnostics.info('L006', `[publish-github] 版本: v${pkg.version}`)
  diagnostics.info('L007', `[publish-github] 上传文件: ${uploadPlan.map((item) => item.uploadName).join(', ')}`)

  try {
    let release = await getReleaseByTag(owner, repo, tag, token)
    if (!release) {
      diagnostics.info('L008', `[publish-github] 创建 Release 标签: ${tag}`)
      release = await createRelease(owner, repo, tag, token)
    } else {
      diagnostics.info('L009', `[publish-github] 更新已有 Release 说明: ${tag}`)
      release = await updateReleaseBody(owner, repo, release.id, token)
    }

    await replaceReleaseAssets(owner, repo, release, uploadPlan, token)

    diagnostics.info('L010', '[publish-github] 发布完成')
    diagnostics.info('L011', `[publish-github] 更新地址: https://github.com/${owner}/${repo}/releases/tag/${tag}`)
  } finally {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

main().catch((err) => {
  diagnostics.error('L012', '[publish-github] 失败:', err.message || err)
  process.exit(1)
})
