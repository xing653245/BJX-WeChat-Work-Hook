const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ini = require('ini')
const { readIni } = require('../commons/common')

test('打包默认配置使用 8868 接收企微消息并转发到旧服务 8002', () => {
  const configPath = path.join(__dirname, '..', '..', 'conf', 'conf.ini')
  const config = ini.parse(fs.readFileSync(configPath, 'utf8'))

  assert.equal(String(config.sys.server_port), '8868')
  assert.equal(config.sys.callback, 'http://127.0.0.1:8002/msg')
})

test('已有电脑的旧 8001 回调在读取时自动迁移到 8002', () => {
  const os = require('node:os')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vwork-callback-migration-'))
  const configPath = path.join(tempRoot, 'conf.ini')

  try {
    fs.writeFileSync(
      configPath,
      '[sys]\nserver_port=8868\ncallback=http://127.0.0.1:8001/msg\n',
      'utf8'
    )

    const config = readIni(configPath)

    assert.equal(config.callback, 'http://127.0.0.1:8002/msg')
    assert.match(fs.readFileSync(configPath, 'utf8'), /callback=http:\/\/127\.0\.0\.1:8002\/msg/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('用户自定义回调地址保持不变', () => {
  const os = require('node:os')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vwork-custom-callback-'))
  const configPath = path.join(tempRoot, 'conf.ini')
  const customCallback = 'http://192.168.1.18:9000/custom-msg'

  try {
    fs.writeFileSync(
      configPath,
      `[sys]\nserver_port=8868\ncallback=${customCallback}\n`,
      'utf8'
    )

    const config = readIni(configPath)

    assert.equal(config.callback, customCallback)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
