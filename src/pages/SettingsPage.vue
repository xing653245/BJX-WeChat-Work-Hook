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
          <span>接口调试 · 文本消息</span>
          <el-tooltip
            content="发往本框架：POST http://127.0.0.1:{监听端口}/api/message/text。请求 JSON 包含 port（企微实例在该端口上跑 HTTP）、user_id、msg。下方「企微 HTTP 端口」与「监听端口」不是同一个；下拉列表数据与「企微管理」页的登录实例一致。"
            placement="top"
          >
            <span><el-icon><QuestionFilled /></el-icon></span>
          </el-tooltip>
        </div>
      </template>

      <div class="form-item form-item-column api-test-section">
        <div class="api-test-split">
          <div class="api-test-split-left">
            <div class="api-test-rows">
              <div class="api-test-row">
                <label class="api-test-field-label">HTTP 端口</label>
                <div class="api-test-field-control">
                  <el-select
                    v-model="textTestWecomPort"
                    clearable
                    placeholder="从企微管理的实例中选择"
                    class="api-test-wecom-select"
                  >
                    <el-option
                      v-for="row in wecomManagerInstances"
                      :key="row.port"
                      :label="formatWecomInstanceOptionLabel(row)"
                      :value="row.port"
                    />
                  </el-select>
                  <p v-if="wecomManagerInstances.length === 0" class="api-test-wecom-empty">
                    当前没有可用的企微实例，请先到「企微管理」添加并保存。
                  </p>
                </div>
              </div>

              <div class="api-test-row">
                <label class="api-test-field-label">user_id</label>
                <el-input
                  v-model="textTestUserId"
                  class="api-test-unified-input"
                  placeholder="接收方 user_id，请自行填写"
                  clearable
                />
              </div>

              <div class="api-test-row">
                <label class="api-test-field-label">msg</label>
                <div class="api-test-msg-stack">
                  <span class="api-test-msg-caption">固定测试内容</span>
                  <code class="api-test-msg-code">{{ TEXT_MSG_TEST_BODY }}</code>
                </div>
              </div>
            </div>

            <div class="api-test-actions-row">
              <span class="api-test-actions-spacer" aria-hidden="true" />
              <div class="api-test-actions-inner">
                <el-button
                  type="primary"
                  :loading="testingTextMsg"
                  :disabled="!isElectronAvailable"
                  @click="handleTestMessageText"
                >
                  发送 POST /api/message/text
                </el-button>
              </div>
            </div>
          </div>

          <div class="api-test-split-right">
            <section class="api-test-request-visual" aria-label="HTTP 预览">
              <h4 class="api-test-visual-heading">HTTP 预览</h4>

              <div class="api-test-meta-block api-test-meta-tight">
                <div class="api-test-meta-line">
                  <span class="api-test-meta-label">请求地址</span>
                  <div class="api-test-meta-value-row">
                    <code class="api-test-meta-url">{{ textTestRequestPreview.url }}</code>
                    <span class="api-test-meta-method">POST</span>
                  </div>
                </div>
              </div>

              <div class="api-test-meta-block api-test-meta-tight">
                <div class="api-test-meta-line api-test-meta-line-stack">
                  <span class="api-test-meta-label">请求参数</span>
                  <pre class="api-test-json-pre">{{ textTestRequestPreview.bodyJson }}</pre>
                </div>
              </div>

              <div class="api-test-meta-block api-test-response-block api-test-meta-tight">
                <div class="api-test-meta-line api-test-meta-line-stack">
                  <span class="api-test-meta-label">响应结果</span>
                  <template v-if="testingTextMsg">
                    <div class="api-test-resp-loading">正在发送请求…</div>
                  </template>
                  <pre v-else-if="textTestResponseRaw" class="api-test-json-pre">{{ textTestResponseRaw }}</pre>
                  <p v-else class="api-test-resp-placeholder">暂无响应，请点击左侧按钮发起请求。</p>
                </div>
              </div>
            </section>
          </div>
        </div>
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

    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>窗口与关闭</span>
        </div>
      </template>

      <div class="form-item form-item-column">
        <div class="form-label-row">
          <label>点击窗口右上角关闭时：</label>
          <el-tooltip
            content="保存后立即生效，无需重启。选择「直接退出」将跳过确认框。若仍使用「每次询问」，此前勾选的「不再提醒」也会生效。"
            placement="top"
          >
            <span><el-icon><QuestionFilled /></el-icon></span>
          </el-tooltip>
        </div>
        <el-radio-group v-model="formData.window_close_action" class="close-action-radios">
          <el-radio value="ask">每次询问（最小化到托盘 / 退出）</el-radio>
          <el-radio value="tray">直接最小化到系统托盘（不询问）</el-radio>
          <el-radio value="quit">直接退出程序（不询问）</el-radio>
        </el-radio-group>
        <div v-if="hasStoredCloseConfirmPrefs" class="close-prefs-hint-box">
          <p class="close-prefs-hint-text">
            检测到上次关窗时勾选了「不再提醒」，将一直按记忆中的操作执行（不会再弹框）。若想改回<strong>弹出选择框</strong>，或已为「最小化」但想改成<strong>关闭程序</strong>，可先点右侧按钮清空记忆；
            或直接选上方的<strong>「直接退出程序」</strong>并点页面底部<strong>保存修改</strong>。
          </p>
          <el-button type="warning" plain @click="clearStoredCloseConfirm">
            清除「不再提醒」记忆
          </el-button>
        </div>
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
              <span class="info-label">{{ updateStatus.status === 'available' ? '新版本：' : '服务器版本：' }}</span>
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
import { getCloseConfirmAutoAction, clearCloseConfirmPrefs } from '../utils/closeConfirmPrefs'

const configStore = useConfigStore()
const saving = ref(false)
/** localStorage「不再提醒」存在时文案提示 */
const hasStoredCloseConfirmPrefs = ref(false)

/** POST /api/message/text 调试：固定正文；user_id、企微 port 用户填写 */
const TEXT_MSG_TEST_BODY = 'Hello 北极熊，这是一条自动化测试消息！'
const textTestUserId = ref('')
const textTestWecomPort = ref('')
const testingTextMsg = ref(false)
const textTestResponseRaw = ref('')

/** 与「企微管理」表格同源（config.login_info） */
const wecomManagerInstances = computed(() => {
  const raw = configStore.getLoginInfo()
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const rows = []
  for (const item of raw) {
    const p = item?.port
    const portStr = p != null ? String(p).trim() : ''
    if (!portStr || seen.has(portStr)) continue
    seen.add(portStr)
    rows.push({
      port: portStr,
      user_id: item?.user_id != null ? String(item.user_id) : '',
      nick_name: item?.nick_name != null ? String(item.nick_name) : ''
    })
  }
  return rows
})

function formatWecomInstanceOptionLabel(row) {
  const nn = row.nick_name?.trim() || '未备注昵称'
  const uid = row.user_id?.trim() || '—'
  return `端口 ${row.port} · ${nn}（${uid}）`
}

const formData = reactive({
  server_port: DEFAULT_SERVER_PORT_STRING,
  callback: '',
  open_log: true,
  save_log: true,
  /** 默认可在设置中关闭；此前未写入 ini 时也视为开启 */
  auto_check_update: true,
  /** ask | tray | quit，写入 ini sys.window_close_action */
  window_close_action: 'ask'
})

/** 展示即将/实际请求的 URL 与 Body（与实际发送一致时需 port / user_id 已合法填写） */
const textTestRequestPreview = computed(() => {
  const listenPort = parseInt(String(formData.server_port ?? '').trim(), 10)
  const listenOk =
    !Number.isNaN(listenPort) && listenPort > 1024 && listenPort <= 10000
  const url = listenOk
    ? `http://127.0.0.1:${listenPort}/api/message/text`
    : '（请先填写顶部「监听端口」，有效范围：(1024, 10000]）'

  const wPortParsed = parseInt(String(textTestWecomPort.value || '').trim(), 10)
  const portOk =
    !Number.isNaN(wPortParsed) && wPortParsed >= 1 && wPortParsed <= 65535
  const uid = String(textTestUserId.value || '').trim()

  const payload = {
    port: portOk ? wPortParsed : '（请选择企微 HTTP 端口）',
    user_id: uid || '（请填写接收方 user_id）',
    msg: TEXT_MSG_TEST_BODY
  }
  const bodyJson = JSON.stringify(payload, null, 2)

  return { url, bodyJson }
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

/** 用于与 ini.window_close_action 对比 */
function normalizeIniCloseAction(raw) {
  const wca = String(raw || 'ask').trim().toLowerCase()
  if (wca === 'quit' || wca === 'exit') return 'quit'
  if (wca === 'tray' || wca === 'minimize_tray') return 'tray'
  return 'ask'
}

function refreshCloseConfirmPrefsHint() {
  hasStoredCloseConfirmPrefs.value = getCloseConfirmAutoAction() !== null
}

/** 重置关窗本地的「不再询问」偏好 */
function clearStoredCloseConfirm() {
  clearCloseConfirmPrefs()
  refreshCloseConfirmPrefsHint()
  ElMessage.success('已清除记忆，下次关窗将重新弹出选择（若配置为「每次询问」）')
}

// 加载配置
const loadConfig = () => {
  const config = configStore.config
  formData.server_port = config.sys?.server_port || DEFAULT_SERVER_PORT_STRING
  formData.callback = config.sys?.callback || ''
  formData.open_log = config.sys?.open_log === 'true' || config.sys?.open_log === true
  formData.save_log = config.sys?.save_log === 'true' || config.sys?.save_log === true
  formData.auto_check_update = !(
    config.sys?.auto_check_update === 'false' ||
    config.sys?.auto_check_update === false
  )

  const wca = String(config.sys?.window_close_action || 'ask').trim().toLowerCase()
  if (wca === 'quit' || wca === 'exit') {
    formData.window_close_action = 'quit'
  } else if (wca === 'tray' || wca === 'minimize_tray') {
    formData.window_close_action = 'tray'
  } else {
    formData.window_close_action = 'ask'
  }
  refreshCloseConfirmPrefsHint()

  if (!String(textTestWecomPort.value || '').trim()) {
    const rows = wecomManagerInstances.value
    if (rows.length > 0) {
      textTestWecomPort.value = rows[0].port
    }
  }
}

async function handleTestMessageText() {
  if (!window.electronAPI?.callAPI) {
    ElMessage.warning('当前环境无法调用 Electron 接口')
    return
  }
  const uid = String(textTestUserId.value || '').trim()
  if (!uid) {
    ElMessage.warning('请填写接收方 user_id')
    return
  }
  const wPort = parseInt(String(textTestWecomPort.value || '').trim(), 10)
  if (Number.isNaN(wPort) || wPort < 1 || wPort > 65535) {
    ElMessage.warning('请填写有效的企微 HTTP 端口（请求体里的 port，1～65535）')
    return
  }
  const listenPort = parseInt(String(formData.server_port || '').trim(), 10)
  if (Number.isNaN(listenPort) || listenPort <= 1024 || listenPort > 10000) {
    ElMessage.warning('请先在「HTTP 设置」中填写有效的监听端口')
    return
  }

  testingTextMsg.value = true
  textTestResponseRaw.value = ''
  const url = `http://127.0.0.1:${listenPort}/api/message/text`
  try {
    const result = await window.electronAPI.callAPI({
      url,
      method: 'POST',
      data: {
        port: wPort,
        user_id: uid,
        msg: TEXT_MSG_TEST_BODY
      }
    })

    if (!result?.success) {
      textTestResponseRaw.value = JSON.stringify(
        { ipcError: result?.msg || '请求失败', detail: result },
        null,
        2
      )
      ElMessage.error(result?.msg || '请求失败')
      return
    }

    const body = result.data
    textTestResponseRaw.value =
      typeof body === 'string'
        ? body
        : JSON.stringify(body, null, 2)

    const innerOk = body && typeof body === 'object' && body.success === true
    if (innerOk) {
      ElMessage.success('调用成功')
    } else {
      const m = body?.message || body?.msg || '接口返回 failure'
      ElMessage.warning(typeof m === 'string' ? m : '接口返回异常，请看下方正文')
    }
  } catch (e) {
    const wrap = {
      exception: true,
      message: e?.message || String(e)
    }
    textTestResponseRaw.value = JSON.stringify(wrap, null, 2)
    ElMessage.error(e?.message || String(e))
  } finally {
    testingTextMsg.value = false
  }
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
      ElMessage.info(data.message || '当前已是最新版本')
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
  const prevCloseIni = normalizeIniCloseAction(configStore.config.sys?.window_close_action)
  const nextClose = formData.window_close_action || 'ask'
  const oldPortBeforeSave = configStore.config.sys?.server_port
  try {
    const newConfig = {
      sys: {
        server_port: String(formData.server_port),
        callback: formData.callback || '',
        open_log: String(formData.open_log),
        save_log: String(formData.save_log),
        auto_check_update: String(formData.auto_check_update),
        window_close_action: formData.window_close_action || 'ask'
      },
      custom: {
        login_info: configStore.getLoginInfo()
      }
    }

    const result = await configStore.saveConfig(newConfig)
    
    if (result.success) {
      // 直接退出：与本地「一直最小化」记忆冲突，保存后顺带清除记忆
      if (nextClose === 'quit') {
        clearCloseConfirmPrefs()
        refreshCloseConfirmPrefsHint()
      } else if (prevCloseIni !== 'ask' && nextClose === 'ask') {
        // 从「托盘 / 退出」改回询问时，清空记忆以免仍按旧习惯自动最小化
        clearCloseConfirmPrefs()
        refreshCloseConfirmPrefsHint()
      }
      // 如果端口改变了，需要重启FastAPI服务器
      if (
        String(oldPortBeforeSave) !== String(formData.server_port) &&
        window.electronAPI
      ) {
        const restartRes = await window.electronAPI.restartFastAPIServer(
          parseInt(formData.server_port, 10)
        )
        if (!restartRes?.success) {
          ElMessage.error(
            `HTTP 服务未在端口 ${formData.server_port} 启动：${restartRes?.message || '未知错误'}。请检查端口是否被占用，或完全退出框架后重新打开。`
          )
        }
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

.form-item-column {
  flex-direction: column;
  align-items: flex-start;
}

.form-label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.form-item-column .form-label-row label {
  width: auto;
  margin-right: 0;
  text-align: left;
  font-weight: 500;
}

.close-action-radios {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding-left: 0;
}

.close-prefs-hint-box {
  margin-top: 16px;
  padding: 12px 14px;
  max-width: 640px;
  background: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 8px;
}

.close-prefs-hint-text {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
}

.close-prefs-hint-text strong {
  color: #303133;
}

.api-test-section {
  --api-test-label-w: 132px;
  --api-test-col-gap: 14px;
  --api-test-split-gap: 22px;
  --api-test-left-max: 452px;

  margin-bottom: 0 !important;
  width: 100%;
}

.api-test-split {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(280px, 1.08fr);
  gap: var(--api-test-split-gap);
  align-items: stretch;
  width: 100%;
}

.api-test-split-left {
  justify-self: start;
  box-sizing: border-box;
  width: min(var(--api-test-left-max, 452px), 100%);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
}

.api-test-split-right {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.api-test-rows {
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.api-test-row {
  display: grid;
  grid-template-columns: var(--api-test-label-w) minmax(0, 1fr);
  column-gap: var(--api-test-col-gap);
  align-items: start;
}

.api-test-field-label {
  margin: 0;
  padding-top: 8px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--el-text-color-regular);
  text-align: left;
}

.api-test-field-label::after {
  content: '：';
}

.api-test-field-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.api-test-wecom-select {
  width: 100%;
}

.api-test-unified-input {
  width: 100%;
}

.api-test-wecom-empty {
  margin: 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.55;
}

.api-test-msg-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.api-test-msg-caption {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

.api-test-msg-code {
  display: block;
  padding: 8px 12px;
  background: var(--el-fill-color-light, #f5f7fa);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  font-size: 13px;
  font-family: ui-monospace, Consolas, 'Courier New', monospace;
  color: var(--el-text-color-primary);
  line-height: 1.55;
  word-break: break-word;
}

.api-test-actions-row {
  width: 100%;
  max-width: 100%;
  display: grid;
  grid-template-columns: var(--api-test-label-w) minmax(0, 1fr);
  column-gap: var(--api-test-col-gap);
  align-items: center;
  margin-top: 6px;
  margin-bottom: 0;
}

.api-test-actions-spacer {
  display: block;
}

.api-test-actions-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: flex-start;
}

.api-test-request-visual {
  width: 100%;
  max-width: none;
  flex: 1;
  min-height: 0;
  padding: 16px 18px;
  background: var(--el-fill-color-extra-light, #fafafa);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}

.api-test-split-right .api-test-json-pre {
  max-height: clamp(140px, 32vh, 320px);
}

.api-test-visual-heading {
  margin: 0 0 14px;
  padding-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  letter-spacing: 0.02em;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.api-test-meta-tight:not(:last-child) {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.api-test-meta-line {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
}

.api-test-meta-line-stack {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.api-test-meta-label {
  flex: 0 0 76px;
  margin: 0;
  padding-top: 3px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.api-test-meta-line-stack .api-test-meta-label {
  flex-basis: auto;
  padding-top: 0;
}

.api-test-meta-value-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.api-test-meta-url {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  font-size: 12px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9, #ecf5ff);
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--el-color-primary-light-7, #d9ecff);
  font-family: ui-monospace, Consolas, 'Courier New', monospace;
}

.api-test-meta-method {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--el-text-color-secondary);
  padding: 3px 8px;
  background: rgba(64, 158, 255, 0.12);
  border-radius: 4px;
}

.api-test-response-block.api-test-meta-tight:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.api-test-split-right .api-test-response-block .api-test-json-pre {
  max-height: clamp(160px, 38vh, 380px);
}

.api-test-json-pre {
  margin: 0;
  padding: 8px 12px;
  max-height: 200px;
  overflow: auto;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  font-family: ui-monospace, Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.api-test-resp-loading {
  margin: 0;
  padding: 10px 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  background: #fff;
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 8px;
}

.api-test-resp-placeholder {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  background: rgba(255, 255, 255, 0.6);
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 8px;
}

@media (max-width: 920px) {
  .api-test-split {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .api-test-split-left {
    justify-self: stretch;
    width: 100%;
    max-width: none;
  }

  .api-test-split-right .api-test-request-visual {
    flex: none;
  }

  .api-test-split-right .api-test-json-pre {
    max-height: 200px;
  }

  .api-test-split-right .api-test-response-block .api-test-json-pre {
    max-height: 200px;
  }

  .api-test-actions-row {
    margin-bottom: 0;
  }
}

@media (max-width: 620px) {
  .api-test-section {
    --api-test-label-w: 100%;
  }

  .api-test-row {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 6px;
  }

  .api-test-field-label {
    padding-top: 0;
    text-align: left;
  }

  .api-test-actions-row {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 8px;
  }

  .api-test-actions-spacer {
    display: none;
  }
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

