const test = require('node:test')
const assert = require('node:assert/strict')
const { parseNetstatListeningPids, parseNetstatLocalPids } = require('../commons/portProcess.cjs')

const sample = [
  'TCP    127.0.0.1:8553         0.0.0.0:0              LISTENING       12345',
  'TCP    127.0.0.1:54321        127.0.0.1:8553         ESTABLISHED     67890',
  'TCP    127.0.0.1:18553        0.0.0.0:0              LISTENING       11111',
  'TCP    [::]:8553              [::]:0                 LISTENING       12345'
].join('\n')

test('只收集本机监听该端口的 PID，忽略对端连接和相似端口', () => {
  assert.deepEqual(parseNetstatListeningPids(sample, 8553), [12345])
  assert.deepEqual(parseNetstatListeningPids(sample, 18553), [11111])
})

test('本机地址匹配不含对端端口', () => {
  assert.deepEqual(parseNetstatLocalPids(sample, 8553), [12345])
  assert.ok(!parseNetstatLocalPids(sample, 8553).includes(67890))
})
