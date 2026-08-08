/**
 * 发布脚本共用工具
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const pkg = require('../package.json')
const DIST_DIR = path.join(__dirname, '..', 'dist-electron')
const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md')

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
    console.warn(`[publish] 未找到 ${CHANGELOG_PATH}，Release 将使用默认说明`)
    return ''
  }

  const content = fs.readFileSync(CHANGELOG_PATH, 'utf-8')
  const headerRe = new RegExp(`^##\\s+v?${ver.replace(/\./g, '\\.')}\\s*$`, 'm')
  const match = content.match(headerRe)
  if (!match || match.index == null) {
    console.warn(`[publish] CHANGELOG.md 中未找到版本 ${ver} 章节，Release 将使用默认说明`)
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
  const footer = `发布于 ${new Date().toLocaleString('zh-CN')}`
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
  if (!parsed.sha512 || !parsed.size) {
    throw new Error('latest.yml 中缺少 sha512 或 size')
  }

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
  console.log(`[publish] 已写入 releaseNotes（来自 CHANGELOG.md / 默认说明）`)

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

  if (parsed.url !== installerName || parsed.path !== installerName) {
    console.log(
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
