<template>
  <div class="settings-page">
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>HTTP 设置</span>
          <el-tooltip content="当你需要调用框架的接口时，就是用的这个端口&#10;调用框架的地址为：http://127.0.0.1:端口号/api&#10;如果修改了这个端口之后，必须要重启框架，设置才会生效" placement="top">
            <span><el-icon><QuestionFilled /></el-icon></span>
          </el-tooltip>
        </div>
      </template>
      
      <div class="form-item">
        <label>监听端口：</label>
        <el-input
          v-model="formData.server_port"
          placeholder="请输入端口号(1024-10000)"
          style="width: 300px"
        />
      </div>

      <div class="form-item">
        <label>回调地址：</label>
        <el-input
          v-model="formData.callback"
          placeholder="请输入回调地址，如: http://127.0.0.1:8001/msg"
          style="width: 500px"
        />
        <el-tooltip content="这个回调地址，是框架向你推送企微消息的地址&#10;接口需要是POST，且我传给你的是JSON&#10;你需要搭建这个回调服务，并把地址填入&#10;修改之后不需要重启框架" placement="top">
          <span style="margin-left: 8px"><el-icon><QuestionFilled /></el-icon></span>
        </el-tooltip>
      </div>
    </el-card>

    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>日志设置</span>
        </div>
      </template>
      
      <div class="form-item">
        <el-checkbox v-model="formData.open_log">开启日志</el-checkbox>
        <el-checkbox v-model="formData.save_log">保存日志</el-checkbox>
        <el-tooltip content="开启之后，会把运行日志保存到logs/runLog下&#10;如果需要开启的话，需要先打开[开启日志]才能生效 修改后需要重启框架才能生效" placement="top">
          <span style="margin-left: 8px"><el-icon><QuestionFilled /></el-icon></span>
        </el-tooltip>
      </div>
    </el-card>

    <el-card class="settings-card update-card">
      <template #header>
        <div class="card-header">
          <span>更新设置</span>
        </div>
      </template>
      
      <!-- 版本信息区域 -->
      <div class="version-info">
        <div class="version-item">
          <span class="version-label">当前版本</span>
          <span>{{ appVersion }}</span>
        </div>
        <el-button 
          type="primary" 
          :icon="Refresh"
          @click="handleCheckUpdate" 
          :loading="checkingUpdate"
          :disabled="downloadingUpdate || installingUpdate || !isElectronAvailable"
          class="check-update-btn"
        >
          {{ checkingUpdate ? '检查中...' : '检查更新' }}
        </el-button>
      </div>

      <!-- 自动更新开关 -->
      <div class="form-item update-switch">
        <el-switch
          v-model="formData.auto_check_update"
          active-text="启动时自动检查更新"
          inactive-text=""
          :disabled="!isElectronAvailable"
        />
        <el-tooltip content="开启后，应用启动时会自动检查是否有新版本可用" placement="top">
          <el-icon class="help-icon"><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>

      <!-- 更新状态显示 -->
      <transition name="fade">
        <div v-if="updateStatus" class="update-status-container">
          <el-divider />
          <div class="update-status-content">
            <div class="status-header">
              <el-icon :class="['status-icon', `status-icon-${updateStatus.type}`]">
                <component :is="getStatusIcon(updateStatus.status)" />
              </el-icon>
              <div class="status-title-group">
                <h4 class="status-title">{{ updateStatus.title }}</h4>
                <p v-if="updateStatus.message" class="status-message">{{ updateStatus.message }}</p>
              </div>
            </div>

            <!-- 版本信息 -->
            <div v-if="updateStatus.version" class="update-info-item">
              <el-icon class="info-icon"><InfoFilled /></el-icon>
              <span class="info-label">新版本：</span>
              <el-tag type="success" size="small">{{ updateStatus.version }}</el-tag>
            </div>

            <!-- 更新说明 -->
            <div v-if="updateStatus.releaseNotes" class="update-notes">
              <div class="notes-header">
                <el-icon><Document /></el-icon>
                <span>更新说明</span>
              </div>
              <div class="notes-content" v-html="updateStatus.releaseNotes"></div>
            </div>

            <!-- 下载进度 -->
            <transition name="slide-fade">
              <div v-if="downloadProgress !== null" class="download-progress-container">
                <div class="progress-header">
                  <span class="progress-label">下载进度</span>
                  <span class="progress-percent">{{ downloadProgress }}%</span>
                </div>
                <el-progress 
                  :percentage="downloadProgress" 
                  :status="downloadProgress === 100 ? 'success' : 'active'"
                  :stroke-width="8"
                  class="download-progress"
                />
                <div v-if="downloadProgress < 100" class="progress-tip">
                  正在下载更新文件，请稍候...
                </div>
              </div>
            </transition>

            <!-- 操作按钮组 -->
            <div class="update-actions">
              <el-button 
                v-if="updateStatus.status === 'available'"
                type="primary" 
                :icon="Download"
                @click="handleDownloadUpdate"
                :loading="downloadingUpdate"
                :disabled="installingUpdate"
                size="default"
                class="action-btn"
              >
                {{ downloadingUpdate ? '下载中...' : '立即下载' }}
              </el-button>
              <el-button 
                v-if="updateStatus.status === 'downloaded'"
                type="success" 
                :icon="CircleCheck"
                @click="handleInstallUpdate"
                :loading="installingUpdate"
                size="default"
                class="action-btn"
              >
                {{ installingUpdate ? '准备中...' : '立即重启并安装' }}
              </el-button>
              <el-button 
                v-if="updateStatus.status === 'error'"
                type="primary" 
                :icon="Refresh"
                @click="handleCheckUpdate"
                :loading="checkingUpdate"
                size="default"
                class="action-btn"
              >
                重试
              </el-button>
            </div>
          </div>
        </div>
      </transition>
    </el-card>

    <div class="footer-actions">
      <el-button type="primary" size="large" @click="handleSave" :loading="saving">
        保存修改
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { 
  QuestionFilled, 
  Refresh, 
  Download, 
  CircleCheck, 
  Document, 
  InfoFilled,
  Loading,
  Check,
  WarningFilled
} from '@element-plus/icons-vue'
import { useConfigStore } from '../stores/config'
import { DEFAULT_SERVER_PORT_STRING } from '../utils/constants'

const configStore = useConfigStore()
const saving = ref(false)

const formData = reactive({
  server_port: DEFAULT_SERVER_PORT_STRING,
  callback: '',
  open_log: true,
  save_log: true,
  auto_check_update: false
})

// 更新相关状态
const appVersion = ref('')
const checkingUpdate = ref(false)
const downloadingUpdate = ref(false)
const installingUpdate = ref(false)
const updateStatus = ref(null)
const downloadProgress = ref(null)

// 计算属性
const isElectronAvailable = computed(() => {
  return !!window.electronAPI
})

const isUpdateInProgress = computed(() => {
  return checkingUpdate.value || downloadingUpdate.value || installingUpdate.value
})

// 加载配置
const loadConfig = () => {
  const config = configStore.config
  formData.server_port = config.sys?.server_port || DEFAULT_SERVER_PORT_STRING
  formData.callback = config.sys?.callback || ''
  formData.open_log = config.sys?.open_log === 'true' || config.sys?.open_log === true
  formData.save_log = config.sys?.save_log === 'true' || config.sys?.save_log === true
  formData.auto_check_update = config.sys?.auto_check_update === 'true' || config.sys?.auto_check_update === true
}

// 获取应用版本
const loadAppVersion = async () => {
  if (window.electronAPI) {
    try {
      appVersion.value = await window.electronAPI.getAppVersion()
    } catch (error) {
      console.error('获取版本失败:', error)
      appVersion.value = '未知'
    }
  }
}

// 工具函数：检查 Electron API 是否可用
const checkElectronAPI = () => {
  if (!window.electronAPI) {
    ElMessage.warning('当前环境不支持更新功能')
    return false
  }
  return true
}

// 工具函数：创建更新状态对象
const createUpdateStatus = (status, type, title, message, version = null, releaseNotes = null) => {
  return { status, type, title, message, version, releaseNotes }
}

// 工具函数：重置更新状态
const resetUpdateState = () => {
  checkingUpdate.value = false
  downloadingUpdate.value = false
  downloadProgress.value = null
}

// 检查更新
const handleCheckUpdate = async () => {
  if (!checkElectronAPI()) return

  checkingUpdate.value = true
  updateStatus.value = null
  downloadProgress.value = null

  try {
    const result = await window.electronAPI.checkForUpdates()
    if (!result.success) {
      updateStatus.value = createUpdateStatus(
        'error',
        'error',
        '检查更新失败',
        result.message || '检查更新失败'
      )
      ElMessage.warning(result.message || '检查更新失败')
    }
  } catch (error) {
    updateStatus.value = createUpdateStatus(
      'error',
      'error',
      '检查更新失败',
      error.message
    )
    ElMessage.error('检查更新失败: ' + error.message)
  } finally {
    checkingUpdate.value = false
  }
}

// 下载更新
const handleDownloadUpdate = async () => {
  if (!checkElectronAPI()) return

  downloadingUpdate.value = true
  downloadProgress.value = 0

  try {
    const result = await window.electronAPI.downloadUpdate()
    if (!result.success) {
      ElMessage.warning(result.message || '下载更新失败')
      resetUpdateState()
    }
  } catch (error) {
    ElMessage.error('下载更新失败: ' + error.message)
    resetUpdateState()
  }
}

// 安装更新
const handleInstallUpdate = async () => {
  if (!checkElectronAPI()) return

  installingUpdate.value = true

  try {
    const result = await window.electronAPI.quitAndInstall()
    if (!result.success) {
      ElMessage.warning(result.message || '安装更新失败')
      installingUpdate.value = false
    }
  } catch (error) {
    ElMessage.error('安装更新失败: ' + error.message)
    installingUpdate.value = false
  }
}

// 获取状态图标
const getStatusIcon = (status) => {
  const iconMap = {
    'checking': Loading,
    'available': InfoFilled,
    'not-available': Check,
    'downloaded': CircleCheck,
    'error': WarningFilled
  }
  return iconMap[status] || InfoFilled
}

// 处理更新状态变化
const handleUpdateStatusChange = (data) => {
  const statusHandlers = {
    'checking': () => {
      updateStatus.value = createUpdateStatus(
        'checking',
        'checking',
        '正在检查更新',
        data.message
      )
    },
    'available': () => {
      updateStatus.value = createUpdateStatus(
        'available',
        'success',
        '发现新版本',
        data.message,
        data.version,
        data.releaseNotes
      )
      ElMessage.success(`发现新版本: ${data.version}`)
    },
    'not-available': () => {
      updateStatus.value = createUpdateStatus(
        'not-available',
        'success',
        '已是最新版本',
        data.message,
        data.version
      )
      ElMessage.info('当前已是最新版本')
    },
    'downloaded': () => {
      updateStatus.value = createUpdateStatus(
        'downloaded',
        'success',
        '更新下载完成',
        data.message,
        data.version
      )
      downloadingUpdate.value = false
      downloadProgress.value = 100
      ElMessage.success('更新下载完成，可以立即安装')
    },
    'error': () => {
      updateStatus.value = createUpdateStatus(
        'error',
        'error',
        '更新失败',
        data.message
      )
      resetUpdateState()
      ElMessage.error(data.message)
    }
  }

  const handler = statusHandlers[data.status]
  if (handler) {
    handler()
  } else {
    console.warn('未知的更新状态:', data.status)
  }
}

// 监听更新状态
const setupUpdateListeners = () => {
  if (!window.electronAPI) return

  // 监听更新状态
  window.electronAPI.onUpdateStatus((data) => {
    handleUpdateStatusChange(data)
  })

  // 监听下载进度
  window.electronAPI.onUpdateProgress((data) => {
    downloadProgress.value = data.percent
  })
}

// 保存配置
const handleSave = async () => {
  // 验证端口
  const port = parseInt(formData.server_port)
  if (isNaN(port) || port <= 1024 || port > 10000) {
    ElMessage.warning('端口号的范围(1024, 10000]')
    loadConfig() // 恢复原值
    return
  }

  saving.value = true
  try {
    const newConfig = {
      sys: {
        server_port: String(formData.server_port),
        callback: formData.callback || '',
        open_log: String(formData.open_log),
        save_log: String(formData.save_log),
        auto_check_update: String(formData.auto_check_update)
      },
      custom: {
        login_info: configStore.getLoginInfo()
      }
    }

    const result = await configStore.saveConfig(newConfig)
    
    if (result.success) {
      // 如果端口改变了，需要重启FastAPI服务器
      const oldPort = configStore.config.sys?.server_port
      if (oldPort !== String(formData.server_port) && window.electronAPI) {
        await window.electronAPI.restartFastAPIServer(parseInt(formData.server_port))
      }
      ElMessage.success('修改部分设置后，需要重启框架')
    } else {
      ElMessage.error(result.msg || '保存失败')
      loadConfig() // 恢复原值
    }
  } catch (error) {
    ElMessage.error('保存失败: ' + error.message)
    loadConfig() // 恢复原值
  } finally {
    saving.value = false
  }
}

// 监听配置变化，自动更新表单（当配置加载完成后）
watch(
  () => configStore.config.sys,
  (newSys) => {
    if (newSys && newSys.server_port) {
      loadConfig()
    }
  },
  { deep: true }
)

onMounted(async () => {
  // 确保配置已加载（检查 callback 是否存在，避免空字符串误判）
  const hasLoaded = configStore.config.sys?.server_port && 
                    (configStore.config.sys?.callback !== undefined)
  
  if (!hasLoaded) {
    await configStore.loadConfig()
  }
  loadConfig()
  loadAppVersion()
  setupUpdateListeners()
})

onUnmounted(() => {
  // 清理更新事件监听器
  if (window.electronAPI && window.electronAPI.removeUpdateListeners) {
    window.electronAPI.removeUpdateListeners()
  }
})
</script>

<style scoped>
.settings-page {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}

.settings-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.form-item {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.form-item label {
  width: 100px;
  text-align: right;
  margin-right: 12px;
  font-size: 14px;
}

.footer-actions {
  display: flex;
  justify-content: center;
  margin-top: 30px;
}

.footer-actions .el-button {
  padding: 12px 48px;
  font-size: 16px;
}

/* 更新卡片样式 */
.update-card {
  position: relative;
}

.version-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 16px;
}

.version-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.version-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.version-tag {
  font-size: 14px;
  padding: 8px 16px;
  border-radius: 6px;
}

.version-icon {
  margin-right: 4px;
}

.check-update-btn {
  min-width: 120px;
}

.update-switch {
  margin-bottom: 0;
  padding: 12px 0;
}

.help-icon {
  margin-left: 8px;
  color: #909399;
  cursor: help;
  font-size: 16px;
}

.help-icon:hover {
  color: #409eff;
}

/* 更新状态容器 */
.update-status-container {
  margin-top: 20px;
  animation: fadeIn 0.3s ease-in;
}

.update-status-content {
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.status-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.status-icon {
  font-size: 24px;
  margin-top: 2px;
  flex-shrink: 0;
}

.status-icon-info {
  color: #409eff;
}

.status-icon-checking {
  color: #409eff;
  animation: rotate 2s linear infinite;
}

.status-icon-success {
  color: #67c23a;
}

.status-icon-error {
  color: #f56c6c;
}

.status-title-group {
  flex: 1;
}

.status-title {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.status-message {
  margin: 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.5;
}

/* 更新信息项 */
.update-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.info-icon {
  color: #409eff;
  font-size: 16px;
}

.info-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

/* 更新说明 */
.update-notes {
  margin-top: 16px;
  padding: 12px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.notes-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.notes-content {
  font-size: 13px;
  color: #606266;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  padding-left: 22px;
}

/* 下载进度 */
.download-progress-container {
  margin-top: 16px;
  padding: 16px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.progress-label {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.progress-percent {
  font-size: 14px;
  font-weight: 600;
  color: #409eff;
}

.download-progress {
  margin-bottom: 8px;
}

.progress-tip {
  font-size: 12px;
  color: #909399;
  text-align: center;
  margin-top: 8px;
}

/* 操作按钮组 */
.update-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e4e7ed;
}

.action-btn {
  flex: 1;
  min-width: 140px;
}

/* 动画效果 */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-enter-from {
  transform: translateY(-10px);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .version-info {
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    gap: 12px;
  }

  .update-actions {
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
  }
}
</style>

