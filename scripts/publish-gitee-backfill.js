/**
 * 补发历史版本到 Gitee（仅创建版本 Release，不更新 latest）
 *
 * 用法：
 *   node scripts/publish-gitee-backfill.js <版本号> <目录>
 *   node scripts/publish-gitee-backfill.js <版本号> --exe "<安装包.exe>"
 *
 * 目录模式：需含 latest.yml + 安装包（及可选 blockmap）
 * 单文件模式：仅 .exe，脚本会自动生成 latest.yml
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

function parseArgs(argv) {
  const version = argv[2]
  if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
    return { error: 'missing_version' }
  }

  const rest = argv.slice(3)
  if (rest.length === 0) {
    return { version, mode: 'dir', target: path.join(__dirname, '..', 'dist-electron') }
  }

  const exeFlagIndex = rest.indexOf('--exe')
  if (exeFlagIndex >= 0) {
    const exePath = rest.slice(exeFlagIndex + 1).join(' ').trim()
    if (!exePath) {
      return { error: 'missing_exe' }
    }
    return { version, mode: 'exe', target: path.resolve(exePath) }
  }

  // 支持带空格的路径：node script 1.2.0 "E:\BJX\xxx.exe" 或整段路径
  const joined = rest.join(' ').trim()
  const resolved = path.resolve(joined)
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile() && /\.exe$/i.test(resolved)) {
    return { version, mode: 'exe', target: resolved }
  }
  return { version, mode: 'dir', target: resolved }
}

function sha512Base64(filePath) {
  const hash = crypto.createHash('sha512')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('base64')
}

const { getStandardInstallerName } = require('./publish-utils')

function buildLatestYml(version, installerName, size, sha512) {
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${installerName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${installerName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    ''
  ].join('\n')
}

function prepareFilesFromExe(exePath, version) {
  if (!fs.existsSync(exePath)) {
    throw new Error(`安装包不存在: ${exePath}`)
  }
  if (!/\.exe$/i.test(exePath)) {
    throw new Error(`请指定 .exe 安装包: ${exePath}`)
  }

  const installerName = getStandardInstallerName(version)
  const stat = fs.statSync(exePath)
  const sha512 = sha512Base64(exePath)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vwork-backfill-'))
  const latestYmlPath = path.join(tempDir, 'latest.yml')

  fs.writeFileSync(latestYmlPath, buildLatestYml(version, installerName, stat.size, sha512), 'utf-8')
  fs.copyFileSync(exePath, path.join(tempDir, installerName))

  const blockmapSrc = `${exePath}.blockmap`
  const files = [latestYmlPath, path.join(tempDir, installerName)]
  if (fs.existsSync(blockmapSrc)) {
    const blockmapDest = path.join(tempDir, `${installerName}.blockmap`)
    fs.copyFileSync(blockmapSrc, blockmapDest)
    files.push(blockmapDest)
  }

  return { files, tempDir }
}

function collectReleaseFilesFromDir(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`目录不存在: ${dir}`)
  }
  if (!fs.statSync(dir).isDirectory()) {
    throw new Error(`不是目录，若为安装包请使用 --exe 参数: ${dir}`)
  }

  const latestYmlPath = path.join(dir, 'latest.yml')
  if (!fs.existsSync(latestYmlPath)) {
    throw new Error(`目录中缺少 latest.yml: ${dir}`)
  }

  const latestYml = fs.readFileSync(latestYmlPath, 'utf-8')
  const pathMatch = latestYml.match(/^path:\s*(.+)$/m)
  if (!pathMatch) {
    throw new Error('latest.yml 中缺少 path 字段')
  }

  const names = ['latest.yml', pathMatch[1].trim()]
  const blockmapName = `${names[1]}.blockmap`
  if (fs.existsSync(path.join(dir, blockmapName))) {
    names.push(blockmapName)
  }

  for (const name of names) {
    if (name !== 'latest.yml' && !fs.existsSync(path.join(dir, name))) {
      throw new Error(`缺少文件: ${name}`)
    }
  }

  return { files: names.map((name) => path.join(dir, name)), tempDir: null }
}

function printUsage() {
  console.error('用法:')
  console.error('  node scripts/publish-gitee-backfill.js <版本号> <产物目录>')
  console.error('  node scripts/publish-gitee-backfill.js <版本号> --exe "<安装包.exe>"')
  console.error('')
  console.error('示例:')
  console.error('  node scripts/publish-gitee-backfill.js 1.2.0 D:\\backup\\v1.2.0')
  console.error('  node scripts/publish-gitee-backfill.js 1.2.0 --exe "E:\\BJX\\北极熊企微框架Pro Setup 1.2.0.exe"')
}

async function main() {
  const parsed = parseArgs(process.argv)
  if (parsed.error === 'missing_version') {
    printUsage()
    process.exit(1)
  }
  if (parsed.error === 'missing_exe') {
    console.error('[publish-gitee-backfill] --exe 后需指定安装包路径')
    printUsage()
    process.exit(1)
  }

  const { version, mode, target } = parsed
  let tempDir = null
  let files

  if (mode === 'exe') {
    console.log(`[publish-gitee-backfill] 单文件模式: ${target}`)
    const prepared = prepareFilesFromExe(target, version)
    files = prepared.files
    tempDir = prepared.tempDir
  } else {
    console.log(`[publish-gitee-backfill] 目录模式: ${target}`)
    const prepared = collectReleaseFilesFromDir(target)
    files = prepared.files
  }

  const gitee = require('./publish-gitee')
  if (typeof gitee.publishVersionOnly !== 'function') {
    throw new Error('publish-gitee 未导出 publishVersionOnly')
  }

  console.log(`[publish-gitee-backfill] 补发 v${version}`)
  console.log(`[publish-gitee-backfill] 文件: ${files.map((f) => path.basename(f)).join(', ')}`)

  try {
    await gitee.publishVersionOnly(version, files)
    console.log(`[publish-gitee-backfill] 完成: v${version}`)
  } finally {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

main().catch((err) => {
  console.error('[publish-gitee-backfill] 失败:', err.message || err)
  process.exit(1)
})
