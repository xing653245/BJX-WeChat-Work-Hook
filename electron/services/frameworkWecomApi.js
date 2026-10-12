const { validateFrameworkRequest } = require('../configs/frameworkWecomApi')
const { readIni, checkAuthByPort } = require('../commons/common')
const { postToVWorkApi } = require('./wecomApiClient')

/** 内部 IPC 调用；不提供用户 HTTP 转发入口。 */
async function callFrameworkWecomApi(port, input) {
  const checked = validateFrameworkRequest(input)
  if (!checked.valid) throw Object.assign(new Error(checked.message), { code: 'INVALID_API_PARAMS' })
  if (checked.params.type === 3000 || checked.params.type === 7000) {
    const auth = checkAuthByPort(port, readIni().login_info)
    if (!auth.valid) throw Object.assign(new Error(auth.message), { code: 'NO_AUTH', reason: auth.reason })
  }
  return postToVWorkApi(port, checked.params)
}

module.exports = { callFrameworkWecomApi }
