const crypto = require('crypto')

const HEADER_NAME = 'x-vwork-internal-token'

function ensureMessageServerToken() {
  if (!process.env.MESSAGE_SERVER_TOKEN) {
    process.env.MESSAGE_SERVER_TOKEN = crypto.randomBytes(24).toString('hex')
  }
  return process.env.MESSAGE_SERVER_TOKEN
}

function isValidMessageServerRequest(req) {
  const expected = process.env.MESSAGE_SERVER_TOKEN
  if (!expected) return true
  const got = req.headers[HEADER_NAME]
  return got === expected
}

function messageServerAxiosConfig(extra = {}) {
  ensureMessageServerToken()
  return {
    timeout: 15000,
    ...extra,
    headers: {
      ...(extra.headers || {}),
      'X-VWork-Internal-Token': process.env.MESSAGE_SERVER_TOKEN
    }
  }
}

module.exports = {
  ensureMessageServerToken,
  isValidMessageServerRequest,
  messageServerAxiosConfig
}
