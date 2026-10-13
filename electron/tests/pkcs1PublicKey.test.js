const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { validatePkcs1Rsa1024PublicKey } = require('../commons/pkcs1PublicKey.cjs')

function generateBody(bits, type = 'spki') {
  const pem = crypto.generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type, format: 'pem' }
  }).publicKey
  return pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '')
}

test('只接受 1024 bit PKCS#1 的 Base64，不要 BEGIN/END PUBLIC KEY', () => {
  const body = generateBody(1024, 'spki')
  const result = validatePkcs1Rsa1024PublicKey(body)
  assert.equal(result.ok, true)
  assert.equal(result.body, body)
  assert.equal(validatePkcs1Rsa1024PublicKey(`-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`).ok, false)
  assert.match(
    validatePkcs1Rsa1024PublicKey(`-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`).message,
    /不要包含 BEGIN\/END PUBLIC KEY/
  )
  const sample = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDAd3P5ZyBU6pSh0nNnY7ZPMW6HyTyL0ifmbkQxSR/0nZ2Mu6YMUCh6L6WA8SL5RigGm8kIEa+8trV1zfshwr4kWhFhfKHMmcFjJqfoWTnigtcdegCnE5h79feGPMqxZGi00ox5TUezXFjv5O/D9chksc075Ot2RYJ4ubCSxqfdrwIDAQAB'
  assert.equal(validatePkcs1Rsa1024PublicKey(sample).ok, true)
})

test('拒绝空内容、非 Base64、私钥与非 1024 bit', () => {
  assert.equal(validatePkcs1Rsa1024PublicKey('').message, '请填写加密公钥')
  assert.match(validatePkcs1Rsa1024PublicKey('%%%').message, /Base64/)
  assert.match(validatePkcs1Rsa1024PublicKey('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----').message, /私钥/)
  assert.match(validatePkcs1Rsa1024PublicKey(generateBody(2048, 'spki')).message, /1024 bit/)
})
