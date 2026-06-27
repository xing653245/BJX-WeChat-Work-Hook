/**
 * 发布脚本共用工具
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const pkg = require('../package.json')
const DIST_DIR = path.join(__dirname, '..', 'dist-electron')

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
  collectReleaseFiles,
  getEnvToken,
  getDefaultBranch
}
