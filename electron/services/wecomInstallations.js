const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')

function classifyInstallations(rows, versions) {
  const seen = new Set()
  return rows.filter(row => {
    if (typeof row.path !== 'string' || path.win32.basename(row.path).toLowerCase() !== 'wxwork.exe') return false
    const key = path.win32.normalize(row.path).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map(row => ({ path: row.path, version: row.version, supported: versions.includes(row.version) }))
}

async function findWecomInstallations(binDir, currentHost = '') {
  if (process.platform !== 'win32') throw new Error('自动查找企微仅支持 Windows')
  const versions = JSON.parse(fs.readFileSync(path.join(binDir, 'versions.json'), 'utf8').replace(/^\uFEFF/, ''))
    .profiles.map(profile => profile.version)
  // PowerShell 无法读取 app.asar 内的虚拟路径，由 Electron 读出脚本后传入。
  const script = fs.readFileSync(path.join(__dirname, '../scripts/findWecomInstallations.ps1'), 'utf8').replace(/^\uFEFF/, '')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const stdout = await new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true, timeout: 20000, encoding: 'utf8', maxBuffer: 1024 * 1024,
      env: { ...process.env, VWORK_CURRENT_HOST: currentHost }
    }, (error, output) => error ? reject(error) : resolve(output))
  })
  const parsed = JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || '[]')
  return classifyInstallations(Array.isArray(parsed) ? parsed : [parsed], versions)
}
// 在窗口及业务服务启动前完成，确保首次添加企微就使用更新后的配置。
async function autoSaveWecomInstallation(binDir, { find = findWecomInstallations } = {}) {
  const { readInjectSettings, saveInjectSettings } = require('./injectSettings')
  const current = readInjectSettings(binDir).host || ''
  const candidates = (await find(binDir, current)).filter(item => item.supported)
  const key = value => path.win32.normalize(value).toLowerCase()
  const selected = candidates.find(item => key(item.path) === key(current)) ||
    (candidates.length === 1 ? candidates[0] : null)
  if (!selected) return { status: candidates.length ? 'multiple' : 'not-found' }
  if (key(selected.path) === key(current)) return { status: 'unchanged', path: current }
  saveInjectSettings(binDir, { host: selected.path })
  return { status: 'saved', path: selected.path }
}

module.exports = { findWecomInstallations, classifyInstallations, autoSaveWecomInstallation }
