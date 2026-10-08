<template>
  <div class="page-shell run-logs-page">
    <div class="page-body">
      <div class="section-card">
        <div class="section-toolbar">
          <div class="toolbar-left">
            <span class="toolbar-hint">保留最近 {{ maxRows }} 条；{{ fileLogHint }}</span>
          </div>
          <div class="toolbar-actions">
            <span v-if="logCount >= maxRows * 0.9" class="toolbar-warn">
              接近上限 {{ maxRows }} 条，将自动裁剪
            </span>
            <span class="toolbar-badge">{{ logCount }} 条</span>
            <el-button size="small" plain :loading="loadingFileLogs" @click="mergeTodayFileLogs">
              合并今日文件日志
            </el-button>
            <el-button size="small" plain @click="openLogFolder">打开日志目录</el-button>
            <el-button size="small" plain :loading="exportingReport" @click="exportReport">导出故障报告</el-button>
            <el-button size="small" plain :disabled="logCount === 0" @click="clearLogs">
              清空显示
            </el-button>
          </div>
        </div>
        <div class="table-wrap">
          <el-table
            :data="logs"
            row-key="id"
            style="width: 100%"
            height="100%"
            stripe
            highlight-current-row
            class="data-table"
            @row-contextmenu="handleContextMenu"
          >
            <el-table-column prop="index" label="序号" width="72" align="center" />
            <el-table-column prop="time" label="时间" width="168" align="center" />
            <el-table-column prop="sender" label="来源" width="160" align="center" show-overflow-tooltip />
            <el-table-column prop="type" label="类型" width="140" align="center">
              <template #default="{ row }">
                <span class="log-type" :class="`log-type--${row.level}`">{{ row.type }}</span>
              </template>
            </el-table-column>
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
        清空显示日志
      </div>
    </div>
  </div>
</template>

<script setup>
import { createFeedback } from '../utils/feedback.mjs'
const feedback = createFeedback('pages/RunLogsPage.vue')
import { presentRunLog } from '../utils/runLogPresentation.mjs'
const exportingReport = ref(false)

import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { formatMessageContent, formatMessageTypeLabel, getMsgTypeText } from '../utils/msgParser'
import { createRunLogBuffer, logIdentity, parseFileLogEntries } from '../utils/runLogBuffer.mjs'
import { useConfigStore } from '../stores/config'

const configStore = useConfigStore()
const logs = shallowRef([])
const selectedRow = ref(null)
const maxRows = 1000
const loadingFileLogs = ref(false)
const logDirPath = ref('')

const contextMenuVisible = ref(false)
const contextMenuLeft = ref(0)
const contextMenuTop = ref(0)

const logCount = computed(() => logs.value.length)

const fileLogHint = computed(() => {
  const open = configStore.config.sys?.open_log
  const save = configStore.config.sys?.save_log
  const openOn = open === 'true' || open === true
  const saveOn = save === 'true' || save === true
  if (openOn && saveOn) return '文件日志已开启'
  if (openOn) return '未开启「保存日志」，仅内存显示'
  return '文件日志记录已关闭'
})

let removeFastapiLogListener = null

const logBuffer = createRunLogBuffer({ limit: maxRows, onChange: rows => { logs.value = rows } })
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
})
const addLog = (data) => {
  if (!data || typeof data !== 'object') return
  const candidate = Number(data.time_stamp)
  let date = new Date(Number.isFinite(candidate) && candidate > 0 ? candidate * 1000 : Date.now())
  if (Number.isNaN(date.getTime())) date = new Date()
  const time = timeFormatter.format(date).replace(/\//g, '-')
  const rawContent = formatMessageContent(data)
  const direction = data.sys ? '系统' : data.is_self_msg === 1 ? '发出' : '收到'
  const messageType = !data.sys && data.msg_type != null && data.msg_type !== '' ? getMsgTypeText(data.msg_type) : ''
  const apiName = data.type === 'api_call' ? data.api_name || '账号操作' : ''
  const identityContent = apiName ? `[${apiName}] ${rawContent}` : rawContent
  const presentation = presentRunLog({ content: rawContent, type: formatMessageTypeLabel(data), system: !!data.sys, apiName })
  logBuffer.append({
    time, timestamp: date.getTime(), sender: data.sys ? '系统' : apiName ? data.user_id || '当前账号' : data.sender || data.nick_name || data.user_id || data.self_user_id || '—',
    ...presentation,
    fileKey: logIdentity(time, direction, messageType, data.sys ? '' : data.user_id || '', identityContent),
    eventId: !data.sys && data.msg_id ? JSON.stringify([data.self_user_id || '', data.port || '', data.msg_id, direction]) : null
  })
}
onMounted(() => {
  addLog({
    content: '启动成功',
    sys: true
  })

  configStore.loadConfig()
  window.electronAPI?.getLogDirectory?.().then((res) => {
    if (res?.success) logDirPath.value = res.path
  }).catch(() => {})

  document.addEventListener('click', closeContextMenu)

  if (window.electronAPI?.onFastAPIMessage) {
    removeFastapiLogListener = window.electronAPI.onFastAPIMessage((data) => {
      addLog(data)
    })
  }
})

onUnmounted(() => {
  logBuffer.dispose()
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
    feedback.warning('U001', '请先选择一行日志')
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

async function copyLogText(content) {
  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success('已复制到剪贴板')
  } catch (error) { feedback.error('U011', '复制失败，请重试') }
}

const copyRowContent = (row) => copyLogText(`时间：${row.time}\n来源：${row.sender}\n类型：${row.type}\n消息：${row.message}`)
const copyMessageContent = (row) => copyLogText(row.message)

const clearLogs = () => {
  logBuffer.clear()
  selectedRow.value = null
  closeContextMenu()
  ElMessage.success('显示日志已清空，文件日志仍保留')
}

async function mergeTodayFileLogs() {
  if (loadingFileLogs.value) return
  if (!window.electronAPI?.readTodayLogFile) {
    feedback.warning('U002', '当前环境无法读取文件日志')
    return
  }
  const generation = logBuffer.generation
  loadingFileLogs.value = true
  try {
    const res = await window.electronAPI.readTodayLogFile({ maxLines: 300 })
    if (generation !== logBuffer.generation) return
    if (!res?.success) {
      feedback.warning('U003', '读取文件日志失败')
      return
    }
    if (!res.lines?.length) {
      ElMessage.info('今日暂无文件日志')
      return
    }
    const entries = parseFileLogEntries(res.lines).map(entry => {
      const api = !entry.sys && !entry.messageType && entry.message.match(/^\[([^\]]+)\]\s*((?:调用|操作)(?:成功|失败).*)$/s)
      return { ...entry, ...presentRunLog({ content: api ? api[2] : entry.message,
        type: entry.type, system: entry.sys, apiName: api?.[1] || '' }) }
    })
    const added = logBuffer.merge(entries, generation)
    if (added === null) return
    ElMessage.success(added ? `已合并 ${added} 条文件日志` : '文件日志与当前列表一致，无新增')
  } catch (e) {
    feedback.error('U004', e?.message || '读取文件日志失败')
  } finally {
    loadingFileLogs.value = false
  }
}

async function openLogFolder() {
  if (!window.electronAPI?.openLogDirectory) {
    feedback.warning('U005', '当前环境无法打开日志目录')
    return
  }
  try {
    const res = await window.electronAPI.openLogDirectory()
    if (res?.success) {
      if (res.path) logDirPath.value = res.path
    } else feedback.warning('U006', res?.error || '打开日志目录失败')
  } catch (error) { feedback.error('U012', '打开日志目录失败，请重试') }
}

async function exportReport() {
  if (exportingReport.value) return
  exportingReport.value = true
  try {
    const result = await window.electronAPI?.exportDiagnosticReport?.()
    if (result?.canceled) return
    if (result?.success) ElMessage.success('故障报告已导出，请将文件发送给技术支持')
    else feedback.error('U009', result?.message || '导出失败，请重启应用后重试')
  } catch (error) { feedback.error('U010', error) }
  finally { exportingReport.value = false }
}

defineExpose({
  addLog
})
</script>

<style scoped>
.log-type { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 12px; color: var(--sp-muted); background: var(--sp-subtle-bg); }
.log-type--success { color: var(--el-color-success); background: var(--el-color-success-light-9); }
.log-type--error { color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
.log-type--warning { color: var(--el-color-warning); background: var(--el-color-warning-light-9); }
.log-type--message { color: var(--sp-accent); background: var(--sp-accent-soft); }
.page-shell {
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sp-border);
  background: var(--sp-toolbar-bg);
}

.toolbar-left {
  min-width: 0;
  flex: 1;
}

.toolbar-hint {
  font-size: 12px;
  color: var(--sp-muted);
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  max-width: 100%;
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
  color: var(--el-color-warning);
  font-weight: 500;
}

.table-wrap {
  flex: 1;
  min-height: 0;
  padding: 0 8px 8px;
}

.data-table :deep(.el-table__header th) {
  background: var(--sp-table-header-bg) !important;
  font-weight: 600;
  font-size: 12px;
  color: var(--sp-muted);
}

:deep(.el-table) {
  font-size: 13px;
  --el-table-border-color: var(--sp-border);
  --el-table-header-bg-color: var(--sp-table-header-bg);
  --el-table-tr-bg-color: var(--sp-surface);
  --el-table-row-hover-bg-color: var(--sp-subtle-bg);
  --el-fill-color-blank: var(--sp-surface);
  background: var(--sp-surface);
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
