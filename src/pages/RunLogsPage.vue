<template>
  <div class="page-shell run-logs-page">
    <div class="page-body">
      <div class="section-card">
        <div class="section-toolbar">
          <span class="toolbar-hint">右键行可复制内容或清空日志</span>
          <div class="toolbar-actions">
            <span v-if="logCount >= maxRows * 0.9" class="toolbar-warn">
              接近上限 {{ maxRows }} 条，将自动裁剪
            </span>
            <span class="toolbar-badge">{{ logCount }} 条</span>
            <el-button size="small" plain :disabled="logCount === 0" @click="clearLogs">
              清空
            </el-button>
          </div>
        </div>
        <div class="table-wrap">
          <el-table
            :data="logs"
            style="width: 100%"
            height="100%"
            stripe
            highlight-current-row
            class="data-table"
            @row-contextmenu="handleContextMenu"
          >
            <el-table-column prop="index" label="序号" width="72" align="center" />
            <el-table-column prop="time" label="时间" width="168" align="center" />
            <el-table-column prop="sender" label="发言者" width="140" align="center" />
            <el-table-column prop="type" label="类型" width="130" align="center" />
            <el-table-column prop="message" label="消息" min-width="200" show-overflow-tooltip />
          </el-table>
        </div>
      </div>
    </div>

    <div
      v-show="contextMenuVisible"
      class="context-menu"
      :style="{ left: contextMenuLeft + 'px', top: contextMenuTop + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="onMenuClick('copy-all')">复制本行内容</div>
      <div class="context-menu-item" @click="onMenuClick('copy-content')">复制本条消息</div>
      <div class="context-menu-divider" />
      <div class="context-menu-item context-menu-item-danger" @click="onMenuClick('clear')">
        清空日志内容
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getMsgTypeText } from '../utils/msgParser'

const logs = ref([])
const selectedRow = ref(null)
const maxRows = 1000

const contextMenuVisible = ref(false)
const contextMenuLeft = ref(0)
const contextMenuTop = ref(0)

const logCount = computed(() => logs.value.length)

let removeFastapiLogListener = null

const formatTime = (timestamp) => {
  const date = new Date(timestamp * 1000)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const getDirectionText = (data) => {
  if (data.is_self_msg === 1) return '发送'
  if (data.msg_id) return '接收'
  return ''
}

const getMessageType = (data) => {
  if (data.sys) return '系统提示'
  if (data.type === 'api_call') return 'API调用'

  const direction = getDirectionText(data)
  const msgTypeText = getMsgTypeText(data.msg_type)

  return direction ? `${direction}-${msgTypeText}` : msgTypeText
}

const addLog = (data) => {
  if (logs.value.length >= maxRows) {
    logs.value = logs.value.slice(maxRows / 2)
  }

  const timestamp = data.time_stamp || Math.floor(Date.now() / 1000)
  let content

  if (data.sys) {
    content = data.content
  } else if (Number(data.msg_type) === 2) {
    content = typeof data.content === 'string' ? data.content : String(data.content ?? '')
  } else {
    try {
      content = JSON.stringify(data.content ?? {}, null, 2)
    } catch (e) {
      content = String(data.content ?? '')
    }
  }

  const logEntry = {
    index: logs.value.length + 1,
    time: formatTime(timestamp),
    sender: data.self_user_id || '系统提示',
    type: getMessageType(data),
    message: content,
    rawData: data
  }

  logs.value.push(logEntry)

  logs.value.forEach((log, index) => {
    log.index = index + 1
  })
}

onMounted(() => {
  addLog({
    content: '启动成功',
    sys: true
  })

  document.addEventListener('click', closeContextMenu)

  if (window.electronAPI?.onFastAPIMessage) {
    removeFastapiLogListener = window.electronAPI.onFastAPIMessage((data) => {
      addLog(data)
    })
  }
})

onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu)
  removeFastapiLogListener?.()
  removeFastapiLogListener = null
})

const closeContextMenu = () => {
  contextMenuVisible.value = false
}

const handleContextMenu = (row, column, event) => {
  event.preventDefault()
  selectedRow.value = row
  contextMenuLeft.value = event.clientX
  contextMenuTop.value = event.clientY
  contextMenuVisible.value = true
}

const onMenuClick = (command) => {
  closeContextMenu()
  handleMenuCommand(command)
}

const handleMenuCommand = (command) => {
  if (command !== 'clear' && !selectedRow.value) {
    ElMessage.warning('请先选择一行日志')
    return
  }

  switch (command) {
    case 'copy-all':
      copyRowContent(selectedRow.value)
      break
    case 'copy-content':
      copyMessageContent(selectedRow.value)
      break
    case 'clear':
      clearLogs()
      break
  }
}

const copyRowContent = (row) => {
  const content = `${row.index}|${row.time}|${row.sender}|${row.type}|${row.message}`
  navigator.clipboard.writeText(content).then(() => {
    ElMessage.success('已复制到剪贴板')
  })
}

const copyMessageContent = (row) => {
  navigator.clipboard.writeText(row.message).then(() => {
    ElMessage.success('已复制到剪贴板')
  })
}

const clearLogs = () => {
  logs.value = []
  ElMessage.success('日志已清空')
}

defineExpose({
  addLog
})
</script>

<style scoped>
.page-shell {
  --sp-bg: #f4f6f9;
  --sp-surface: #ffffff;
  --sp-border: #e8ecf1;
  --sp-text: #1f2937;
  --sp-muted: #6b7280;
  --sp-accent: #409eff;
  --sp-accent-soft: rgba(64, 158, 255, 0.08);
  --sp-radius: 12px;
  --sp-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.04);

  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--sp-bg);
  color: var(--sp-text);
}

.page-body {
  flex: 1;
  min-height: 0;
  padding: 16px 20px 20px;
  overflow: hidden;
}

.section-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius);
  box-shadow: var(--sp-shadow);
  overflow: hidden;
}

.section-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sp-border);
  background: #fafbfc;
}

.toolbar-hint {
  font-size: 12px;
  color: var(--sp-muted);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.toolbar-badge {
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--sp-muted);
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: 999px;
}

.toolbar-warn {
  font-size: 12px;
  color: #b45309;
  font-weight: 500;
}

.table-wrap {
  flex: 1;
  min-height: 0;
  padding: 0 8px 8px;
}

.data-table :deep(.el-table__header th) {
  background: #f8fafc !important;
  font-weight: 600;
  font-size: 12px;
  color: var(--sp-muted);
}

:deep(.el-table) {
  font-size: 13px;
  --el-table-border-color: var(--sp-border);
  --el-table-header-bg-color: #f8fafc;
}

:deep(.el-table .cell) {
  padding: 8px 10px;
}

:deep(.el-table__row) {
  transition: background-color 0.15s ease;
}

.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 152px;
  padding: 6px 0;
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.context-menu-item {
  padding: 9px 16px;
  font-size: 13px;
  color: var(--sp-text);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.context-menu-item:hover {
  background: var(--sp-accent-soft);
  color: var(--sp-accent);
}

.context-menu-item-danger:hover {
  background: rgba(245, 108, 108, 0.08);
  color: #f56c6c;
}

.context-menu-divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--sp-border);
}

@media (max-width: 640px) {
  .page-body {
    padding: 12px;
  }

  .section-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
