const EXPECTED_BITS = 1024
const RSA_OID = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]

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

function modulusBitsFromSpkiDer(der) {
  const seq = readTlv(der, 0, 0x30)
  const algo = readTlv(seq.value, 0, 0x30)
  const oid = readTlv(algo.value, 0, 0x06)
  if (oid.value.length !== RSA_OID.length || RSA_OID.some((byte, i) => oid.value[i] !== byte)) {
    throw new Error('not rsa')
  }
  const bitString = readTlv(seq.value, algo.offset, 0x03)
  if (bitString.value.length < 2 || bitString.value[0] !== 0) throw new Error('bad bitstring')
  return modulusBitsFromPkcs1Der(bitString.value.subarray(1))
}

function modulusBitsFromPublicKeyDer(der) {
  try {
    return modulusBitsFromSpkiDer(der)
  } catch {
    return modulusBitsFromPkcs1Der(der)
  }
}

export function normalizeRsaPublicKeyBase64(raw) {
  const text = String(raw || '').trim().replace(/\r\n/g, '\n')
  if (!text) {
    return { ok: false, message: '请填写加密公钥' }
  }
  if (/-----BEGIN RSA PRIVATE KEY-----/.test(text) || /-----BEGIN PRIVATE KEY-----/.test(text)) {
    return { ok: false, message: '请填写 RSA 加密公钥，不要填写私钥' }
  }
  if (/-----BEGIN PUBLIC KEY-----/.test(text) || /-----END PUBLIC KEY-----/.test(text) ||
      /-----BEGIN RSA PUBLIC KEY-----/.test(text) || /-----END RSA PUBLIC KEY-----/.test(text) ||
      /-----BEGIN /.test(text)) {
    return { ok: false, message: '只填写 Base64 公钥，不要包含 BEGIN/END PUBLIC KEY' }
  }
  const body = compactBase64(text)
  const der = decodeBase64Strict(body)
  if (!der) {
    return { ok: false, message: '加密公钥内容须为 Base64' }
  }
  return { ok: true, body, der }
}

export function validatePkcs1Rsa1024PublicKey(raw) {
  const extracted = normalizeRsaPublicKeyBase64(raw)
  if (!extracted.ok) return extracted
  try {
    const bits = modulusBitsFromPublicKeyDer(extracted.der)
    if (bits !== EXPECTED_BITS) {
      return { ok: false, message: `加密公钥须为 1024 bit，当前为 ${bits || '未知'} bit` }
    }
    return { ok: true, body: extracted.body }
  } catch {
    return { ok: false, message: '加密公钥须为 1024 bit、PKCS#1 格式的 RSA 加密公钥' }
  }
}
