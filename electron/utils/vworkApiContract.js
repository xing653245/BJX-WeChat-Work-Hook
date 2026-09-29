// 按用户提供的 vworkApi_Apifox导入.postman_collection.json 整理。
const contract = require('../configs/vworkApiContract.json')

function validateVworkRequest(input) {
  const fail = (message) => ({ valid: false, message })
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('请求体必须是 JSON 对象')
  const type = Number(input.type)
  if (!Number.isInteger(type) || !contract[type]) return fail('未知或缺少接口 type')
  const params = { ...input, type }
  for (const [key, rule] of Object.entries(contract[type].fields)) {
    const value = params[key]
    if (value == null) {
      if (rule.required) return fail(`缺少参数: ${key}`)
      continue
    }
    if (rule.kind === 'array' && !Array.isArray(value)) return fail(`${key} 必须是数组`)
    if (rule.kind === 'object' && (typeof value !== 'object' || Array.isArray(value))) return fail(`${key} 必须是对象`)
    if (rule.kind === 'string' || rule.kind === 'str') {
      if (typeof value !== 'string') return fail(`${key} 必须是字符串`)
    }
    if (rule.kind === 'int' || rule.kind === 'float') {
      const n = Number(value)
      if (value === '' || !Number.isFinite(n) || (rule.kind === 'int' && !Number.isInteger(n))) return fail(`${key} 必须是${rule.kind === 'int' ? '整数' : '数字'}`)
      params[key] = n
    }
  }
  if ('state' in params && ![0, 1].includes(params.state)) return fail('state 必须是 0 或 1')
  if (type === 4009 && (![1, 2].includes(params.add_type) || (params.add_type === 1 && !params.corp_id))) return fail('add_type 必须为 1 或 2，企微用户的 corp_id 不能为空')
  return { valid: true, params }
}

module.exports = { contract, validateVworkRequest }
