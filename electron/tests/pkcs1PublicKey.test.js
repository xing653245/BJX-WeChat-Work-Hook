const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { validatePkcs1Rsa1024PublicKey } = require('../commons/pkcs1PublicKey.cjs')

function generatePem(bits, type = 'pkcs1') {
  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type, format: 'pem' }
  })
  return publicKey
}

test('接受 PKCS#1 1024 bits PEM 与纯 Base64', () => {
  const pem = generatePem(1024, 'pkcs1')
  assert.equal(validatePkcs1Rsa1024PublicKey(pem).ok, true)
  const body = pem.replace(/-----BEGIN RSA PUBLIC KEY-----/, '').replace(/-----END RSA PUBLIC KEY-----/, '')
  assert.equal(validatePkcs1Rsa1024PublicKey(body).ok, true)
})

test('拒绝空内容、非 Base64、SPKI 与非 1024 bits', () => {
  assert.equal(validatePkcs1Rsa1024PublicKey('').message, '请填写加密公钥')
  assert.match(validatePkcs1Rsa1024PublicKey('%%%').message, /Base64/)
  const spki = generatePem(1024, 'spki')
  assert.match(validatePkcs1Rsa1024PublicKey(spki).message, /PKCS#1/)
  const pem2048 = generatePem(2048, 'pkcs1')
  assert.match(validatePkcs1Rsa1024PublicKey(pem2048).message, /1024 bits/)
})
