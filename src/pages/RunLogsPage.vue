<template>
  <div class="run-logs-page">
    <el-table
      :data="logs"
      style="width: 100%"
      height="100%"
      stripe
      highlight-current-row
      @row-contextmenu="handleContextMenu"
    >
      <el-table-column prop="index" label="序号" width="80" align="center" />
      <el-table-column prop="time" label="时间" width="180" align="center" />
      <el-table-column prop="sender" label="发言者" width="150" align="center" />
      <el-table-column prop="type" label="类型" width="120" align="center" />
      <el-table-column prop="message" label="消息" show-overflow-tooltip />
    </el-table>

    <!-- 自定义右键菜单：在表格右键时显示，并定位到鼠标位置 -->
    <div
      v-show="contextMenuVisible"
      class="context-menu"
      :style="{ left: contextMenuLeft + 'px', top: contextMenuTop + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="onMenuClick('copy-all')">复制本行内容</div>
      <div class="context-menu-item" @click="onMenuClick('copy-content')">复制本条消息</div>
      <div class="context-menu-divider" />
      <div class="context-menu-item" @click="onMenuClick('clear')">清空日志内容</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getMsgTypeText } from '../utils/msgParser'

const logs = ref([])
const selectedRow = ref(null)
const maxRows = 1000

// 右键菜单显隐与位置
const contextMenuVisible = ref(false)
const contextMenuLeft = ref(0)
const contextMenuTop = ref(0)

/** 取消 fastapi-message 订阅（只移除本页，勿 removeAllListeners） */
let removeFastapiLogListener = null

// 格式化时间
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

// 获取方向文本（发送/接收）
const getDirectionText = (data) => {
  if (data.is_self_msg === 1) return '发送'
  if (data.msg_id) return '接收'
  return ''
}

// 获取消息类型文本（带方向）
const getMessageType = (data) => {
  // 系统类/接口调用日志保持原有展示
  if (data.sys) return '系统提示'
  if (data.type === 'api_call') return 'API调用'

  const direction = getDirectionText(data)
  const msgTypeText = getMsgTypeText(data.msg_type)

  // 示例：发送-文本消息 / 接收-图片消息
  return direction ? `${direction}-${msgTypeText}` : msgTypeText
}

// 添加日志
const addLog = (data) => {
  // 如果超过最大行数，清空一半
  if (logs.value.length >= maxRows) {
    logs.value = logs.value.slice(maxRows / 2)
  }

  const timestamp = data.time_stamp || Math.floor(Date.now() / 1000)
  let content

  if (data.sys) {
    // 系统日志原样输出
    content = data.content
  } else if (Number(data.msg_type) === 2) {
    // 文本消息：直接显示消息内容字符串
    content = typeof data.content === 'string' ? data.content : String(data.content ?? '')
  } else {
    // 其它类型：content 是对象，显示完整 JSON
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

  // 更新所有序号
  logs.value.forEach((log, index) => {
    log.index = index + 1
  })
}

// 初始化：添加启动成功日志
onMounted(() => {
  addLog({
    content: '启动成功',
    sys: true
  })

  // 点击页面其它区域关闭右键菜单
  document.addEventListener('click', closeContextMenu)

  // 监听FastAPI推送的消息
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

// 关闭右键菜单
const closeContextMenu = () => {
  contextMenuVisible.value = false
}

// 右键菜单处理：显示自定义菜单并定位
const handleContextMenu = (row, column, event) => {
  event.preventDefault()
  selectedRow.value = row
  contextMenuLeft.value = event.clientX
  contextMenuTop.value = event.clientY
  contextMenuVisible.value = true
}

// 点击菜单项：先关闭菜单，再执行命令
const onMenuClick = (command) => {
  closeContextMenu()
  handleMenuCommand(command)
}

// 菜单命令处理
const handleMenuCommand = (command) => {
  // “清空”不需要选中行，其它需要
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

// 复制整行内容
const copyRowContent = (row) => {
  const content = `${row.index}|${row.time}|${row.sender}|${row.type}|${row.message}`
  navigator.clipboard.writeText(content).then(() => {
    ElMessage.success('已复制到剪贴板')
  })
}

// 复制消息内容
const copyMessageContent = (row) => {
  navigator.clipboard.writeText(row.message).then(() => {
    ElMessage.success('已复制到剪贴板')
  })
}

// 清空日志
const clearLogs = () => {
  logs.value = []
  ElMessage.success('日志已清空')
}

// 暴露方法供外部调用（用于接收FastAPI推送的日志）
defineExpose({
  addLog
})
</script>

<style scoped>
.run-logs-page {
  height: 100%;
  padding: 10px;
}

:deep(.el-table) {
  font-size: 13px;
}

:deep(.el-table .cell) {
  padding: 8px;
}

/* 自定义右键菜单 */
.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 140px;
  padding: 4px 0;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  box-shadow: var(--el-box-shadow-light);
}

.context-menu-item {
  padding: 8px 16px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  cursor: pointer;
}

.context-menu-item:hover {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.context-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--el-border-color-lighter);
}
</style>

