const EXPECTED_BITS = 1024

function compactBase64(value) {
  return String(value || '').replace(/\s+/g, '')
}

function decodeBase64Strict(value) {
  const compact = compactBase64(value)
  if (!compact || compact.length % 4 !== 0) return null
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null
  try {
    const binary = atob(compact)
    const pad = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0
    if (binary.length !== (compact.length / 4) * 3 - pad) return null
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function readLength(bytes, offset) {
  if (offset >= bytes.length) throw new Error('truncated')
  const first = bytes[offset]
  if (first < 0x80) return { length: first, offset: offset + 1 }
  const count = first & 0x7f
  if (count < 1 || count > 4 || offset + count >= bytes.length) throw new Error('bad length')
  let length = 0
  for (let i = 1; i <= count; i += 1) length = (length << 8) | bytes[offset + i]
  return { length, offset: offset + 1 + count }
}

function readTlv(bytes, offset, tag) {
  if (bytes[offset] !== tag) throw new Error('bad tag')
  const len = readLength(bytes, offset + 1)
  const end = len.offset + len.length
  if (end > bytes.length) throw new Error('truncated')
  return { value: bytes.subarray(len.offset, end), offset: end }
}

function integerBitLength(intBytes) {
  let i = 0
  while (i < intBytes.length && intBytes[i] === 0) i += 1
  if (i === intBytes.length) return 0
  let bits = (intBytes.length - i - 1) * 8
  let value = intBytes[i]
  while (value) {
    bits += 1
    value >>= 1
  }
  return bits
}

function modulusBitsFromPkcs1Der(der) {
  const seq = readTlv(der, 0, 0x30)
  const modulus = readTlv(seq.value, 0, 0x02)
  const exponent = readTlv(seq.value, modulus.offset, 0x02)
  if (exponent.offset !== seq.value.length) throw new Error('trailing')
  return integerBitLength(modulus.value)
}

export function validatePkcs1Rsa1024PublicKey(raw) {
  const text = String(raw || '').trim().replace(/\r\n/g, '\n')
  if (!text) {
    return { ok: false, message: '请填写加密公钥' }
  }
  if (/-----BEGIN RSA PRIVATE KEY-----/.test(text) || /-----BEGIN PRIVATE KEY-----/.test(text)) {
    return { ok: false, message: '加密公钥须为 PKCS#1 格式（-----BEGIN RSA PUBLIC KEY-----）' }
  }
  if (/-----BEGIN PUBLIC KEY-----/.test(text)) {
    return { ok: false, message: '加密公钥须为 PKCS#1 格式（-----BEGIN RSA PUBLIC KEY-----）' }
  }
  const pem = text.match(/-----BEGIN RSA PUBLIC KEY-----\s*([\s\S]*?)\s*-----END RSA PUBLIC KEY-----/)
  let body
  if (pem) {
    body = compactBase64(pem[1])
  } else if (/-----BEGIN /.test(text)) {
    return { ok: false, message: '加密公钥须为 PKCS#1 格式（-----BEGIN RSA PUBLIC KEY-----）' }
  } else {
    body = compactBase64(text)
  }
  const der = decodeBase64Strict(body)
  if (!der) {
    return { ok: false, message: '加密公钥内容须为 Base64' }
  }
  try {
    const bits = modulusBitsFromPkcs1Der(der)
    if (bits !== EXPECTED_BITS) {
      return { ok: false, message: `加密公钥须为 ${EXPECTED_BITS} bits，当前为 ${bits || '未知'} bits` }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: '加密公钥不是有效的 PKCS#1 RSA 公钥' }
  }
}
