const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const {
  POLAR_BEAR_SIGN_SECRET,
  POLAR_BEAR_SIGN_SALT,
  buildPolarBearAuthHeaders
} = require('../configs/polarBearBackend')

test('北极熊验签头为 HMAC-SHA256(secret, timestamp&nonce&salt) 的 hex 小写', () => {
  const headers = buildPolarBearAuthHeaders()
  const timestamp = headers['X-Timestamp']
  const nonce = headers['X-Nonce']
  const expected = crypto
    .createHmac('sha256', POLAR_BEAR_SIGN_SECRET)
    .update(`${timestamp}&${nonce}&${POLAR_BEAR_SIGN_SALT}`, 'utf8')
    .digest('hex')

  assert.match(timestamp, /^\d+$/)
  assert.match(nonce, /^[0-9a-f]{32}$/)
  assert.equal(headers['X-Sign'], expected)
  assert.equal(headers['X-Sign'], headers['X-Sign'].toLowerCase())
  assert.equal(POLAR_BEAR_SIGN_SECRET, 'sadasgfd34355768ghjcv')
  assert.equal(POLAR_BEAR_SIGN_SALT, 'xxse41235_a1d457a1s000dw22318967e')
})
