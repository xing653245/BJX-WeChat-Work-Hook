/**
 * 当前企微客户端的注入工具路径配置。
 * 正常启动使用 bin/v5/it.exe 注入；这里保留注入工具路径解析。
 */
const path = require('path')
const fs = require('fs')

const WECOM_VERSION_META = {
  v5: {
    id: 'v5',
    label: '企微 v5',
    description: '适用于企微客户端 5.0.3.6005，仅该版本可成功注入'
  }
}

const INJECT_DLL_BY_VERSION = {
  v5: 'HookBridge.dll'
}

const VALID_WECOM_VERSIONS = Object.freeze(['v5'])
const DEFAULT_WECOM_VERSION = 'v5'

function normalizeWecomVersion(value) {
  const v = String(value ?? '').trim().toLowerCase()
  return VALID_WECOM_VERSIONS.includes(v) ? v : null
}

/** @returns {string[]} it.exe 相对应用资源根目录的路径片段 */
function getInjectExeSegments(versionId) {
  normalizeWecomVersion(versionId)
  return ['bin', 'v5', 'it.exe']
}

function resolveInjectToolPath(appRoot, versionId) {
  const version = normalizeWecomVersion(versionId) || DEFAULT_WECOM_VERSION
  const injectToolPath = path.join(appRoot, ...getInjectExeSegments(version))
  return { version, injectToolPath }
}

function getInjectDllFileName(versionId) {
  const version = normalizeWecomVersion(versionId) || DEFAULT_WECOM_VERSION
  return INJECT_DLL_BY_VERSION[version]
}

function resolveInjectDllPath(injectBinDir, versionId) {
  const version = normalizeWecomVersion(versionId) || DEFAULT_WECOM_VERSION
  const dllName = getInjectDllFileName(version)
  const dllPath = path.join(injectBinDir, dllName)
  if (fs.existsSync(dllPath)) {
    return { version, dllName, dllPath, source: dllName }
  }
  return { version, dllName, dllPath, source: '' }
}

function isInjectToolAvailable(appRoot, versionId) {
  const { injectToolPath } = resolveInjectToolPath(appRoot, versionId)
  if (!fs.existsSync(injectToolPath)) return false
  const injectBinDir = path.dirname(injectToolPath)
  return Boolean(resolveInjectDllPath(injectBinDir, versionId).source)
}

function getWecomVersionOptions(appRoot) {
  return VALID_WECOM_VERSIONS.map((id) => {
    const meta = WECOM_VERSION_META[id]
    const { injectToolPath } = resolveInjectToolPath(appRoot, id)
    return {
      id,
      label: meta.label,
      description: meta.description,
      injectToolPath,
      available: isInjectToolAvailable(appRoot, id)
    }
  })
}

module.exports = {
  WECOM_VERSION_META,
  VALID_WECOM_VERSIONS,
  DEFAULT_WECOM_VERSION,
  INJECT_DLL_BY_VERSION,
  normalizeWecomVersion,
  getInjectExeSegments,
  getInjectDllFileName,
  resolveInjectToolPath,
  resolveInjectDllPath,
  isInjectToolAvailable,
  getWecomVersionOptions
}
