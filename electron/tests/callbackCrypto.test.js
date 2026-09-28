const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ALG_NAME,
  RSA_OAEP_MAX_PLAIN_BYTES,
  generateCallbackEncryptKeyPair,
  encodePemForIni,
  decodePemFromIni,
  isValidCallbackEncryptPublicKey,
  isValidCallbackEncryptPrivateKey,
  isEncryptedCallbackBody,
  encryptCallbackPayload,
  decryptCallbackPayload
} = require('../commons/callbackCrypto')

test('生成 RSA 密钥对并通过分块 RSA 加密往返还原 JSON', () => {
  const { publicKey, privateKey } = generateCallbackEncryptKeyPair()
  assert.equal(isValidCallbackEncryptPublicKey(publicKey), true)
  assert.equal(isValidCallbackEncryptPrivateKey(privateKey), true)

  const payload = {
    type: 'msg',
    content: '你好 RSA',
    nested: { a: 1, b: ['x', 'y'] }
  }
  const body = encryptCallbackPayload(payload, publicKey)

  assert.equal(body.encrypted, true)
  assert.equal(body.alg, ALG_NAME)
  assert.equal(isEncryptedCallbackBody(body), true)
  assert.ok(Array.isArray(body.chunks))
  assert.ok(body.chunks.length >= 1)
  assert.equal(body.key, undefined)
  assert.equal(body.iv, undefined)
  assert.equal(body.ciphertext, undefined)

  const plain = decryptCallbackPayload(body, privateKey)
  assert.deepEqual(plain, payload)
})

test('超过单块上限的大正文也能往返', () => {
  const { publicKey, privateKey } = generateCallbackEncryptKeyPair()
  const payload = {
    blob: '中'.repeat(RSA_OAEP_MAX_PLAIN_BYTES)
  }
  const body = encryptCallbackPayload(payload, publicKey)
  assert.ok(body.chunks.length > 1)
  assert.deepEqual(decryptCallbackPayload(body, privateKey), payload)
})

test('ini 转义的 PEM 可正确编解码', () => {
  const { publicKey } = generateCallbackEncryptKeyPair()
  const packed = encodePemForIni(publicKey)
  assert.equal(packed.includes('\n'), false)
  assert.equal(packed.includes('\\n'), true)
  assert.equal(decodePemFromIni(packed), publicKey)
})

test('旧 AES 十六进制密钥不再视为有效公钥', () => {
  assert.equal(
    isValidCallbackEncryptPublicKey('a'.repeat(64)),
    false
  )
})

test('明文 body 原样返回', () => {
  const raw = { hello: 'world' }
  assert.deepEqual(decryptCallbackPayload(raw, 'unused'), raw)
})
