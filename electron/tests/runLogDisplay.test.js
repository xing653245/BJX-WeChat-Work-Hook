const test = require('node:test')
const assert = require('node:assert/strict')

test('大量日志批次更新，只保留最近 1000 条且行标识稳定', async () => {
  const { createRunLogBuffer } = await import('../../src/utils/runLogBuffer.mjs')
  let rows, changes = 0
  const buffer = createRunLogBuffer({ onChange: value => { rows = value; changes++ } })
  for (let i = 0; i < 1500; i++) buffer.append({ message: String(i), timestamp: i })
  assert.equal(changes, 0)
  buffer.flush()
  assert.equal(changes, 1)
  assert.equal(rows.length, 1000)
  assert.equal(rows[0].message, '500')
  assert.equal(rows.at(-1).message, '1499')
  const lastId = rows.at(-1).id
  buffer.append({ message: '1500', timestamp: 1500 })
  buffer.flush()
  assert.equal(rows.at(-2).id, lastId)
  assert.equal(rows[0].index, 1)
  buffer.dispose()
})

test('按消息身份去重，保留不同账号及无消息 ID 的重复内容', async () => {
  const { createRunLogBuffer } = await import('../../src/utils/runLogBuffer.mjs')
  let rows
  const buffer = createRunLogBuffer({ onChange: value => { rows = value } })
  assert.equal(buffer.append({ eventId: 'account1:123', message: '你好' }), true)
  assert.equal(buffer.append({ eventId: 'account1:123', message: '你好' }), false)
  buffer.append({ eventId: 'account2:123', message: '你好' })
  buffer.append({ message: '重复提示' })
  buffer.append({ message: '重复提示' })
  buffer.flush()
  assert.equal(rows.length, 4)
  buffer.dispose()
})

test('清空与卸载使在途文件合并失效，定时刷新不会恢复旧日志', async () => {
  const { createRunLogBuffer } = await import('../../src/utils/runLogBuffer.mjs')
  let rows
  const buffer = createRunLogBuffer({ onChange: value => { rows = value }, delay: 5 })
  const generation = buffer.generation
  buffer.append({ message: '旧日志' })
  buffer.clear()
  assert.equal(buffer.merge([{ message: '文件记录' }], generation), null)
  await new Promise(resolve => setTimeout(resolve, 15))
  assert.deepEqual(rows, [])
  buffer.dispose()
  assert.equal(buffer.append({ message: '卸载后' }), false)
})

test('解析文件日志的类型、多行正文、时间和账号，合并不重复且不吞同秒重复消息', async () => {
  const { createRunLogBuffer, parseFileLogEntries, logIdentity } = await import('../../src/utils/runLogBuffer.mjs')
  const entries = parseFileLogEntries([
    '截断残片',
    '[2026-09-30 12:00:00] [收到][文本消息] 张三(user1): 第一行',
    '第二行',
    '[2026-09-30 12:00:00] [收到][文本消息] 张三(user1): 第一行',
    '第二行',
    '[2026-09-30 12:00:00] [收到][文本消息] 李四(user2): 第一行',
    '第二行'
  ])
  assert.equal(entries.length, 3)
  assert.equal(entries[0].message, '第一行\n第二行')
  assert.equal(entries[0].type, '接收-文本消息')
  let rows
  const buffer = createRunLogBuffer({ onChange: value => { rows = value } })
  buffer.append({ ...entries[0], fileKey: logIdentity('2026/09/30 12:00:00', '收到', '文本消息', 'user1', '第一行\n第二行') })
  buffer.append({ timestamp: entries[0].timestamp + 1000, message: '最新', fileKey: 'latest' })
  assert.equal(buffer.merge(entries, buffer.generation), 2)
  assert.equal(rows.length, 4)
  assert.equal(rows.at(-1).message, '最新')
  assert.equal(buffer.merge(entries, buffer.generation), 0)
  buffer.dispose()
})

test('历史文件不会把最新实时日志挤出显示范围', async () => {
  const { createRunLogBuffer } = await import('../../src/utils/runLogBuffer.mjs')
  let rows
  const buffer = createRunLogBuffer({ limit: 2, onChange: value => { rows = value } })
  buffer.append({ timestamp: 100, fileKey: 'new1' })
  buffer.append({ timestamp: 101, fileKey: 'new2' })
  assert.equal(buffer.merge([{ timestamp: 1, fileKey: 'old' }], buffer.generation), 0)
  assert.deepEqual(rows.map(row => row.fileKey), ['new1', 'new2'])
  buffer.dispose()
})

test('用户日志翻译操作错误，聊天正文保持原样', async () => {
  const { presentRunLog } = await import('../../src/utils/runLogPresentation.mjs')
  const success = presentRunLog({ apiName: '发送文本消息', content: '调用成功' })
  assert.equal(success.message, '发送文本消息：操作成功')
  assert.equal(success.level, 'success')
  const failure = presentRunLog({ apiName: '发送文本消息', content: '调用失败: ECONNREFUSED 127.0.0.1:6272' })
  assert.equal(failure.level, 'error')
  assert.match(failure.message, /无法连接目标服务/)
  assert.doesNotMatch(failure.message, /ECONNREFUSED/)
  const chat = presentRunLog({ content: 'ECONNREFUSED 是什么意思？', type: '接收-文本消息' })
  assert.equal(chat.message, 'ECONNREFUSED 是什么意思？')
  assert.equal(chat.level, 'message')
  assert.equal(presentRunLog({ content: '', type: '未知消息(999)' }).type, '其他消息')
})
