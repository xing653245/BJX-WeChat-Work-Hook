export function logIdentity(time, direction, type, sender, message) {
  return JSON.stringify([String(time).replace(/\//g, '-'), direction, type, String(sender), message])
}

function timestamp(time) {
  const match = String(time).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!match) return 0
  const [, y, m, d, h, min, s] = match.map(Number)
  return new Date(y, m - 1, d, h, min, s).getTime()
}

export function parseFileLogEntries(lines) {
  const entries = []
  for (const line of lines) {
    const head = line.match(/^\[(\d{4}[-/].+?)\]\s*(.*)$/)
    if (!head) {
      if (entries.length) entries.at(-1).message += '\n' + line
      continue // 文件尾部截断产生的残片不作为一条新消息。
    }
    const [, time, body] = head
    const message = body.match(/^\[(发出|收到)\](?:\[([^\]]*)\])?\s*(.*?)\(([^)]*)\):\s?(.*)$/)
    if (body.startsWith('[系统]')) {
      entries.push({ time, timestamp: timestamp(time), sender: '系统提示', type: '系统提示',
        direction: '系统', messageType: '', identitySender: '', message: body.replace(/^\[系统\]\s?/, ''), sys: true })
    } else if (message) {
      entries.push({ time, timestamp: timestamp(time), sender: message[4] || message[3] || '—',
        type: `${message[1] === '发出' ? '发送' : '接收'}-${message[2] || '消息'}`,
        direction: message[1], messageType: message[2] || '', identitySender: message[4], message: message[5] })
    } else {
      entries.push({ time, timestamp: timestamp(time), sender: '文件日志', type: '文件',
        direction: '文件', messageType: '', identitySender: '', message: body })
    }
  }
  return entries.map(entry => ({ ...entry, fileKey: logIdentity(entry.time, entry.direction, entry.messageType, entry.identitySender, entry.message) }))
}

// 固定容量环形缓冲；高频追加 O(1)，按批次发布浅快照供表格渲染。
export function createRunLogBuffer({ limit = 1000, onChange, delay = 80 }) {
  const buffer = new Array(limit)
  const eventIds = new Set()
  let start = 0, size = 0, nextId = 0, timer = null, disposed = false, generation = 0
  const rows = () => Array.from({ length: size }, (_, i) => buffer[(start + i) % limit])
  function flush() {
    clearTimeout(timer)
    timer = null
    if (!disposed) onChange(rows().map((row, i) => ({ ...row, index: i + 1 })))
  }
  function append(entry) {
    if (disposed || (entry.eventId && eventIds.has(entry.eventId))) return false
    if (size === limit) {
      eventIds.delete(buffer[start].eventId)
      buffer[start] = { ...entry, id: ++nextId }
      start = (start + 1) % limit
    } else buffer[(start + size++) % limit] = { ...entry, id: ++nextId }
    if (entry.eventId) eventIds.add(entry.eventId)
    if (timer === null) timer = setTimeout(flush, delay)
    return true
  }
  function clear() {
    generation++
    buffer.fill(undefined)
    start = size = 0
    eventIds.clear()
    flush()
  }
  function merge(entries, expectedGeneration) {
    if (disposed || generation !== expectedGeneration) return null
    const existing = rows()
    const counts = new Map()
    for (const row of existing) counts.set(row.fileKey, (counts.get(row.fileKey) || 0) + 1)
    const additions = entries.filter(entry => {
      const count = counts.get(entry.fileKey) || 0
      if (count) { counts.set(entry.fileKey, count - 1); return false }
      return true
    })
    const addedRows = additions.map(row => ({ ...row, id: ++nextId }))
    const addedIds = new Set(addedRows.map(row => row.id))
    const merged = [...existing, ...addedRows]
      .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id).slice(-limit)
    buffer.fill(undefined)
    start = size = 0
    eventIds.clear()
    for (const row of merged) {
      buffer[size++] = row
      if (row.eventId) eventIds.add(row.eventId)
    }
    flush()
    return merged.filter(row => addedIds.has(row.id)).length
  }
  function dispose() { clear(); disposed = true; clearTimeout(timer) }
  return { append, clear, merge, flush, dispose, get generation() { return generation } }
}
