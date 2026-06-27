/**
 * 发布脚本共用工具
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const pkg = require('../package.json')
const DIST_DIR = path.join(__dirname, '..', 'dist-electron')

/** 与 electron-updater / 旧版客户端兼容的 ASCII 安装包名 */
function getStandardInstallerName(version) {
  const ver = String(version || pkg.version).replace(/^v/, '')
  return `vwork-electron-setup-${ver}.exe`
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

function buildLatestYml({ version, installerName, sha512, size, releaseDate }) {
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${installerName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${installerName}`,
    `sha512: ${sha512}`,
    `releaseDate: ${releaseDate}`,
    ''
  ].join('\n')
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

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vwork-publish-'))
  const fixedYml = buildLatestYml({
    version: parsed.version || version,
    installerName,
    sha512: parsed.sha512,
    size: parsed.size,
    releaseDate: parsed.releaseDate
  })

  const normalizedYmlPath = path.join(tempDir, 'latest.yml')
  const normalizedExePath = path.join(tempDir, installerName)
  fs.writeFileSync(normalizedYmlPath, fixedYml, 'utf-8')
  fs.copyFileSync(exePath, normalizedExePath)

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
  getStandardInstallerName,
  normalizeReleaseFilesForPublish,
  collectReleaseFiles,
  getEnvToken,
  getDefaultBranch
}
