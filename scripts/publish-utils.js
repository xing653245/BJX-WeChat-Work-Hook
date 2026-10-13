const { createDiagnostics } = require('../electron/commons/diagnostics.cjs')
const diagnostics = createDiagnostics('publish-utils.js')
/**
 * 发布脚本共用工具
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { execSync } = require('child_process')

const pkg = require('../package.json')
const DIST_DIR = path.join(__dirname, '..', 'dist-electron')
const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md')
const GUIDE_FILENAME = '北极熊框架操作指南.md'
const GUIDE_PATH = path.join(__dirname, '..', GUIDE_FILENAME)

// 按 100 MiB 检查，在修改远端 Release 前拒绝超限附件。
function assertGiteeAssetSizes(files, limit = 100 * 1024 * 1024) {
  for (const file of files) {
    const size = fs.statSync(file).size
    if (size >= limit) throw new Error(`Gitee 附件超限：${path.basename(file)} 为 ${(size / 1024 / 1024).toFixed(2)} MiB，必须小于 ${(limit / 1024 / 1024).toFixed(0)} MiB；请重新使用精简打包配置构建`)
  }
}

/** 与 electron-updater / 旧版客户端兼容的 ASCII 安装包名 */
function getStandardInstallerName(version) {
  const ver = String(version || pkg.version).replace(/^v/, '')
  return `vwork-electron-setup-${ver}.exe`
}

function normalizeVersion(version) {
  return String(version || pkg.version).replace(/^v/, '').trim()
}

/**
 * 从 CHANGELOG.md 提取指定版本章节正文（不含 ## 标题行）
 */
function getChangelogForVersion(version = pkg.version) {
  const ver = normalizeVersion(version)
  if (!fs.existsSync(CHANGELOG_PATH)) {
    diagnostics.warn('L001', `[publish] 未找到 ${CHANGELOG_PATH}，Release 将使用默认说明`)
    return ''
  }

  const content = fs.readFileSync(CHANGELOG_PATH, 'utf-8')
  const headerRe = new RegExp(`^##\\s+v?${ver.replace(/\./g, '\\.')}\\s*$`, 'm')
  const match = content.match(headerRe)
  if (!match || match.index == null) {
    diagnostics.warn('L002', `[publish] CHANGELOG.md 中未找到版本 ${ver} 章节，Release 将使用默认说明`)
    return ''
  }

  const start = match.index + match[0].length
  const rest = content.slice(start)
  const nextIdx = rest.search(/^##\s+/m)
  return (nextIdx === -1 ? rest : rest.slice(0, nextIdx)).trim()
}

/** GitHub / Gitee Release 描述，以及客户端更新说明 */
function buildReleaseBody(version = pkg.version) {
  const ver = normalizeVersion(version)
  const notes = getChangelogForVersion(ver)
  const header = `北极熊企微框架Pro v${ver}`
  const footerLines = []
  if (fs.existsSync(GUIDE_PATH)) {
    footerLines.push(`操作指南见附件：${GUIDE_FILENAME}`)
  }
  footerLines.push(`发布于 ${new Date().toLocaleString('zh-CN')}`)
  const footer = footerLines.join('\n')
  if (notes) {
    return `${header}\n\n${notes}\n\n---\n${footer}`
  }
  return `${header}\n\n${footer}`
}

/** 写入 latest.yml 的多行 releaseNotes（YAML literal block） */
function formatYamlReleaseNotes(text) {
  const body = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
  return `releaseNotes: |\n${body}`
}

function parseLatestYml(content) {
  const urlMatch = content.match(/^\s+- url:\s*(.+)$/m)
  const pathMatch = content.match(/^path:\s*(.+)$/m)
  const sha512Match = content.match(/^sha512:\s*(.+)$/m)
  const sizeMatch = content.match(/size:\s*(\d+)/)
  const versionMatch = content.match(/^version:\s*(.+)$/m)
  const releaseDateMatch = content.match(/^releaseDate:\s*(.+)$/m)
  return {
    url: urlMatch?.[1]?.trim() || '',
    path: pathMatch?.[1]?.trim() || '',
    sha512: sha512Match?.[1]?.trim() || '',
    size: sizeMatch?.[1] || '',
    version: versionMatch?.[1]?.trim() || pkg.version,
    releaseDate: releaseDateMatch?.[1]?.trim() || `'${new Date().toISOString()}'`
  }
}

function buildLatestYml({ version, installerName, sha512, size, releaseDate, releaseNotes }) {
  const lines = [
    `version: ${version}`,
    'files:',
    `  - url: ${installerName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${installerName}`,
    `sha512: ${sha512}`,
    `releaseDate: ${releaseDate}`
  ]
  const notes = (releaseNotes || '').trim()
  if (notes) {
    lines.push(formatYamlReleaseNotes(notes))
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * 统一 latest.yml 与安装包文件名为 ASCII，避免 GitHub 上传中文名被截断导致 404
 */
function normalizeReleaseFilesForPublish(filePaths, version = pkg.version) {
  const installerName = getStandardInstallerName(version)
  const ymlPath = filePaths.find((f) => path.basename(f) === 'latest.yml')
  if (!ymlPath) {
    throw new Error('缺少 latest.yml')
  }

  const parsed = parseLatestYml(fs.readFileSync(ymlPath, 'utf-8'))
  const exePath = filePaths.find(
    (f) => /\.exe$/i.test(f) && !/\.blockmap$/i.test(f)
  )
  if (!exePath) {
    throw new Error('缺少 .exe 安装包')
  }
  const actualSize = fs.statSync(exePath).size
  const actualSha512 = crypto.createHash('sha512').update(fs.readFileSync(exePath)).digest('base64')
  if (parsed.sha512 !== actualSha512 || (parsed.size && Number(parsed.size) !== actualSize)) {
    throw new Error('latest.yml 的校验值或大小与安装包不一致，请重新打包')
  }
  // 关闭差分包后 electron-builder 可能省略 size，发布时从实际文件补全。
  parsed.size = actualSize

  const releaseNotes = buildReleaseBody(parsed.version || version)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vwork-publish-'))
  const fixedYml = buildLatestYml({
    version: parsed.version || version,
    installerName,
    sha512: parsed.sha512,
    size: parsed.size,
    releaseDate: parsed.releaseDate,
    releaseNotes
  })

  const normalizedYmlPath = path.join(tempDir, 'latest.yml')
  const normalizedExePath = path.join(tempDir, installerName)
  fs.writeFileSync(normalizedYmlPath, fixedYml, 'utf-8')
  fs.copyFileSync(exePath, normalizedExePath)
  diagnostics.info('L003', `[publish] 已写入 releaseNotes（来自 CHANGELOG.md / 默认说明）`)

  const uploadPlan = [
    { localPath: normalizedYmlPath, uploadName: 'latest.yml' },
    { localPath: normalizedExePath, uploadName: installerName }
  ]

  const blockmapSrc = filePaths.find((f) => f.endsWith('.blockmap'))
  if (blockmapSrc) {
    const blockmapName = `${installerName}.blockmap`
    const normalizedBlockmapPath = path.join(tempDir, blockmapName)
    fs.copyFileSync(blockmapSrc, normalizedBlockmapPath)
    uploadPlan.push({ localPath: normalizedBlockmapPath, uploadName: blockmapName })
  }

  if (fs.existsSync(GUIDE_PATH)) {
    const guideDest = path.join(tempDir, GUIDE_FILENAME)
    fs.copyFileSync(GUIDE_PATH, guideDest)
    uploadPlan.push({ localPath: guideDest, uploadName: GUIDE_FILENAME })
    diagnostics.info('L005', `[publish] 已加入操作指南: ${GUIDE_FILENAME}`)
  } else {
    diagnostics.warn('L006', `[publish] 未找到 ${GUIDE_FILENAME}，本次发布不附带操作指南`)
  }

  if (parsed.url !== installerName || parsed.path !== installerName) {
    diagnostics.info('L004',
      `[publish] 已规范化更新文件名: ${parsed.path || parsed.url} -> ${installerName}`
    )
  }

  return { uploadPlan, tempDir, installerName }
}

function collectReleaseFiles() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`未找到打包目录: ${DIST_DIR}，请先执行 electron-builder 打包`)
  }

  const latestYmlPath = path.join(DIST_DIR, 'latest.yml')
  if (!fs.existsSync(latestYmlPath)) {
    throw new Error('未找到 latest.yml，请确认 electron-builder 已成功完成 Windows 打包')
  }

  const latestYml = fs.readFileSync(latestYmlPath, 'utf-8')
  const pathMatch = latestYml.match(/^path:\s*(.+)$/m)
  if (!pathMatch) {
    throw new Error('latest.yml 中缺少 path 字段')
  }

  const names = ['latest.yml', pathMatch[1].trim()]
  const blockmapName = `${names[1]}.blockmap`
  if (pkg.build?.nsis?.differentialPackage !== false && fs.existsSync(path.join(DIST_DIR, blockmapName))) {
    names.push(blockmapName)
  }

  for (const name of names) {
    if (name !== 'latest.yml' && !fs.existsSync(path.join(DIST_DIR, name))) {
      throw new Error(`缺少发布文件: ${name}`)
    }
  }

  return names.map((name) => path.join(DIST_DIR, name))
}

function readWindowsUserEnv(name) {
  if (process.platform !== 'win32') return ''
  try {
    return execSync(
      `powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('${name}', 'User')]"`,
      { encoding: 'utf-8' }
    ).trim()
  } catch {
    return ''
  }
}

function getEnvToken(envNames, setupHint) {
  for (const name of envNames) {
    if (process.env[name]) {
      return process.env[name]
    }
    const fromUser = readWindowsUserEnv(name)
    if (fromUser) {
      return fromUser
    }
  }
  throw new Error(setupHint)
}

function getDefaultBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'master'
  }
}

module.exports = {
  assertGiteeAssetSizes,
  pkg,
  DIST_DIR,
  CHANGELOG_PATH,
  getStandardInstallerName,
  getChangelogForVersion,
  buildReleaseBody,
  normalizeReleaseFilesForPublish,
  collectReleaseFiles,
  getEnvToken,
  getDefaultBranch
}
