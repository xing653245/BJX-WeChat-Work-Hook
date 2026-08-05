/** 与 electron/configs/wecomVersion.js 保持一致 */
export const WECOM_VERSION_LABELS = {
  v4: '企微 v4',
  v5: '企微 v5'
}

export const DEFAULT_WECOM_VERSION = 'v4'

export function isWecomVersionConfigured(value) {
  return value === 'v4' || value === 'v5'
}

/** 与 conf.ini 中 wecom_version_selected 对应 */
export function isWecomVersionSelectionDone(sys) {
  if (sys?.wecom_version_selected === 'true' || sys?.wecom_version_selected === true) {
    return true
  }
  return isWecomVersionConfigured(sys?.wecom_version)
}

export function getWecomVersionLabel(value) {
  return WECOM_VERSION_LABELS[value] || '未选择'
}
