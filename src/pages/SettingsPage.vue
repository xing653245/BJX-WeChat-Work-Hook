<template>
  <div class="settings-page">
    <div class="settings-body">
      <aside class="settings-nav" aria-label="设置分区导航">
        <div class="nav-caption">设置分区</div>
        <nav class="nav-list">
          <button
            v-for="item in navSections"
            :key="item.id"
            type="button"
            class="nav-item"
            :class="{ active: activeSection === item.id }"
            :aria-current="activeSection === item.id ? 'location' : undefined"
            @click="scrollToSection(item.id)"
          >
            <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
            <span class="nav-indicator" aria-hidden="true" />
          </button>
        </nav>
      </aside>

      <main ref="mainScrollRef" class="settings-main" tabindex="0" aria-label="设置内容">
        <!-- HTTP -->
        <section :id="sectionDomId('http')" class="settings-section">
          <div class="section-card" :class="{ 'is-collapsed': !sectionExpanded.http }">
            <button
              type="button"
              class="section-head section-head-toggle"
              :aria-expanded="sectionExpanded.http"
              @click="toggleSection('http')"
            >
              <div class="section-head-left">
                <span class="section-icon"><el-icon><Connection /></el-icon></span>
                <div>
                  <h2 class="section-title">连接、回调与加密</h2>
                  <p class="section-desc">先选择企微，再设置消息推送与加密方式</p>
                </div>
              </div>
              <el-icon class="collapse-chevron" :class="{ expanded: sectionExpanded.http }"><ArrowDown /></el-icon>
            </button>
            <Transition name="section-collapse">
              <div v-show="sectionExpanded.http">
            <div class="section-body">
              <div class="instance-toolbar">
                <div class="instance-picker">
                <label for="callback-instance">当前企微实例</label>
                <el-select v-model="selectedCallbackPort" placeholder="请选择运行中的企微 HTTP 端口" :disabled="updatingInstance" id="callback-instance" class="instance-select">
                  <el-option v-for="row in callbackInstances" :key="row.port" :value="String(row.port)" :label="'HTTP ' + row.port + (row.nick_name ? ' · ' + row.nick_name : '') + (row.user_id ? ' · ID ' + row.user_id : ' · 未登录')" />
                </el-select>
                </div>
                <el-button :loading="loadingInstances" :disabled="updatingInstance" @click="refreshCallbackInstances">刷新列表</el-button>
              </div>
              <p class="instance-status" role="status">{{ instanceStatus }}</p>
              <div class="field-grid">
                <label class="field-label" for="settings-push-url">原生回调地址</label>
                <div class="field-control">
                  <el-input :disabled="!selectedCallbackRow || updatingInstance" id="settings-push-url" v-model="instanceForm.push_url" class="field-input field-input-wide" placeholder="如 http://127.0.0.1:8002/msg" />
                  <p class="field-hint">企微向此地址推送后续回调；更新只影响当前选择的实例</p>
                </div>

                <label class="field-label" for="settings-push-enabled">开启原生回调</label>
                <div class="field-control control-inline">
                  <el-switch :disabled="!selectedCallbackRow || updatingInstance" id="settings-push-enabled" v-model="instanceForm.push_enabled" />
                  <span class="field-hint inline-hint">{{ instanceForm.push_enabled ? '更新后开启推送' : '更新后关闭推送' }}</span>
                </div>
                <label class="field-label">回调策略</label>
                <div class="field-control callback-options">
                  <div class="compact-field">
                    <label for="settings-push-timeout">超时时间 <span>毫秒</span></label>
                    <el-input-number :disabled="!selectedCallbackRow || updatingInstance" id="settings-push-timeout" v-model="instanceForm.push_timeout_ms" :min="1" :max="2147483647" :precision="0" controls-position="right" />
                  </div>
                  <div class="compact-field">
                    <label for="settings-push-retries">失败重试 <span>次</span></label>
                    <el-input-number :disabled="!selectedCallbackRow || updatingInstance" id="settings-push-retries" v-model="instanceForm.push_retries" :min="0" :max="2147483647" :precision="0" controls-position="right" />
                  </div>
                </div>
                <label class="field-label" for="settings-callback-encrypt">消息加密</label>
                <div class="field-control">
                  <el-switch :disabled="!selectedCallbackRow || updatingInstance" id="settings-callback-encrypt" v-model="instanceForm.encrypt" />
                </div>

                <template v-if="instanceForm.encrypt">
                  <label class="field-label" for="settings-callback-encrypt-public-key">加密公钥</label>
                  <div class="field-control">
                    <div class="key-row">
                      <el-input :disabled="!selectedCallbackRow || updatingInstance"
                        id="settings-callback-encrypt-public-key"
                        v-model="instanceForm.public_key"
                        type="textarea"
                        :rows="4"
                        placeholder="PKCS#1 RSA 1024 bits 公钥，内容为 Base64"
                        class="field-input-wide"
                      />
                    </div>
                    <p class="field-hint">填写 RSA 1024 位公钥的 Base64 内容；私钥由回调接收端保管</p>
                  </div>
                </template>
              </div>
            </div>
            <div class="card-actions">
              <p class="card-note">{{ selectedCallbackRow ? '仅应用于 HTTP ' + selectedCallbackRow.port + '，其他企微不受影响' : '添加企微后，即可设置回调与加密' }}</p>
              <el-button type="primary" :loading="updatingInstance" :disabled="!selectedCallbackRow?.user_id" @click="updateCallbackInstance">更新当前企微</el-button>
            </div>
              </div>
            </Transition>
          </div>
        </section>

        <!-- WeCom Version -->
        <section :id="sectionDomId('wecom')" class="settings-section">
          <div class="section-card" :class="{ 'is-collapsed': !sectionExpanded.wecom }">
            <button
              type="button"
              class="section-head section-head-toggle"
              :aria-expanded="sectionExpanded.wecom"
              @click="toggleSection('wecom')"
            >
              <div class="section-head-left">
                <span class="section-icon accent"><el-icon><ChatLineRound /></el-icon></span>
                <div>
                  <h2 class="section-title">企微版本</h2>
                  <p class="section-desc">配置用于启动企微的客户端路径</p>
                </div>
              </div>
              <el-icon class="collapse-chevron" :class="{ expanded: sectionExpanded.wecom }"><ArrowDown /></el-icon>
            </button>
            <Transition name="section-collapse">
              <div v-show="sectionExpanded.wecom">
            <div class="section-body">
              <div class="field-grid">

                <label class="field-label" for="settings-wecom-exe-v5">v5 客户端路径</label>
                <div class="field-control">
                  <el-input
                    id="settings-wecom-exe-v5"
                    v-model="formData.wecom_exe_path_v5"
                    placeholder="如 D:\WeCom5\WXWork.exe"
                    class="field-input field-input-wide"
                  />
                  <p class="field-hint">仅支持企微 v5.0.3.6005 版本客户端；保存后下次启动生效</p>
                </div>


              </div>
            </div>
            <footer class="card-actions" :class="{ 'is-dirty': isDirty, 'is-saving': saving }">
              <p class="card-status" role="status" aria-live="polite">
                <span v-if="!injectSettingsLoaded">客户端路径尚未读取</span>
                <span v-else-if="saving">正在保存…</span>
                <span v-else-if="isDirty">客户端路径有未保存的更改</span>
                <span v-else class="card-status-ok">客户端路径已保存</span>
              </p>
              <el-button
                type="primary"
                size="default"
                class="save-btn"
                @click="handleSave"
                :loading="saving"
                :disabled="!injectSettingsLoaded || !isDirty"
              >
                保存修改
              </el-button>
            </footer>
              </div>
            </Transition>
          </div>
        </section>

        <!-- API Debug -->
        <section :id="sectionDomId('api')" class="settings-section">
          <div class="section-card" :class="{ 'is-collapsed': !sectionExpanded.api }">
            <button
              type="button"
              class="section-head section-head-toggle"
              :aria-expanded="sectionExpanded.api"
              @click="toggleSection('api')"
            >
              <div class="section-head-left">
                <span class="section-icon accent"><el-icon><Promotion /></el-icon></span>
                <div>
                  <h2 class="section-title">接口调试 · 文本消息</h2>
                  <p class="section-desc">选择企微与接收方，发送一条测试消息</p>
                </div>
              </div>
              <div class="section-head-right">
                <el-tooltip
                  content="发往所选企微实例：POST http://127.0.0.1:{HTTP端口}/api。请求 JSON 包含 type: 3000、user_id、msg。"
                  placement="top"
                >
                  <span class="help-btn" @click.stop><el-icon><QuestionFilled /></el-icon></span>
                </el-tooltip>
                <el-icon class="collapse-chevron" :class="{ expanded: sectionExpanded.api }"><ArrowDown /></el-icon>
              </div>
            </button>

            <Transition name="section-collapse">
              <div v-show="sectionExpanded.api" class="section-body api-section-body">
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
                          placeholder="接收方 user_id"
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
                          发送 POST /api
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
            </Transition>
          </div>
        </section>

        <!-- Appearance -->
        <section :id="sectionDomId('appearance')" class="settings-section">
          <div class="section-card" :class="{ 'is-collapsed': !sectionExpanded.appearance }">
            <button
              type="button"
              class="section-head section-head-toggle"
              :aria-expanded="sectionExpanded.appearance"
              @click="toggleSection('appearance')"
            >
              <div class="section-head-left">
                <span class="section-icon"><el-icon><Sunny /></el-icon></span>
                <div>
                  <h2 class="section-title">外观</h2>
                  <p class="section-desc">选择适合你的显示方式，立即生效</p>
                </div>
              </div>
              <el-icon class="collapse-chevron" :class="{ expanded: sectionExpanded.appearance }"><ArrowDown /></el-icon>
            </button>
            <Transition name="section-collapse">
              <div v-show="sectionExpanded.appearance" class="section-body">
              <div class="option-cards theme-cards">
                <button
                  type="button"
                  class="option-card"
                  :class="{ selected: themeMode === 'light' }"
                  @click="setLocalTheme('light')"
                >
                  <span class="option-card-radio" aria-hidden="true" />
                  <span class="option-card-content">
                    <span class="option-card-title">浅色</span>
                    <span class="option-card-desc">明亮背景，适合日间使用</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="option-card"
                  :class="{ selected: themeMode === 'dark' }"
                  @click="setLocalTheme('dark')"
                >
                  <span class="option-card-radio" aria-hidden="true" />
                  <span class="option-card-content">
                    <span class="option-card-title">深色</span>
                    <span class="option-card-desc">降低屏幕亮度</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="option-card"
                  :class="{ selected: themeMode === 'system' }"
                  @click="setLocalTheme('system')"
                >
                  <span class="option-card-radio" aria-hidden="true" />
                  <span class="option-card-content">
                    <span class="option-card-title">跟随系统</span>
                    <span class="option-card-desc">自动匹配 Windows 主题</span>
                  </span>
                </button>
              </div>
              </div>
            </Transition>
          </div>
        </section>

        <!-- Window -->
        <section :id="sectionDomId('window')" class="settings-section">
          <div class="section-card" :class="{ 'is-collapsed': !sectionExpanded.window }">
            <button
              type="button"
              class="section-head section-head-toggle"
              :aria-expanded="sectionExpanded.window"
              @click="toggleSection('window')"
            >
              <div class="section-head-left">
                <span class="section-icon"><el-icon><Monitor /></el-icon></span>
                <div>
                  <h2 class="section-title">窗口与关闭</h2>
                  <p class="section-desc">选择关闭方式后自动保存</p>
                </div>
              </div>
              <el-icon class="collapse-chevron" :class="{ expanded: sectionExpanded.window }"><ArrowDown /></el-icon>
            </button>
            <Transition name="section-collapse">
              <div v-show="sectionExpanded.window" class="section-body">
              <div class="option-cards">
                <button
                  type="button"
                  class="option-card"
                  :class="{ selected: formData.window_close_action === 'ask' }"
                  @click="savePreference('window_close_action', 'ask')" :disabled="savingPreference"
                >
                  <span class="option-card-radio" aria-hidden="true" />
                  <span class="option-card-content">
                    <span class="option-card-title">每次询问</span>
                    <span class="option-card-desc">最小化到托盘或退出程序</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="option-card"
                  :class="{ selected: formData.window_close_action === 'tray' }"
                  @click="savePreference('window_close_action', 'tray')" :disabled="savingPreference"
                >
                  <span class="option-card-radio" aria-hidden="true" />
                  <span class="option-card-content">
                    <span class="option-card-title">直接最小化</span>
                    <span class="option-card-desc">关闭时进入系统托盘，不弹框</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="option-card"
                  :class="{ selected: formData.window_close_action === 'quit' }"
                  @click="savePreference('window_close_action', 'quit')" :disabled="savingPreference"
                >
                  <span class="option-card-radio" aria-hidden="true" />
                  <span class="option-card-content">
                    <span class="option-card-title">直接退出</span>
                    <span class="option-card-desc">关闭时结束程序，不询问</span>
                  </span>
                </button>
              </div>
              <Transition name="fade">
                <div v-if="hasStoredCloseConfirmPrefs" class="close-prefs-hint-box">
                  <p class="close-prefs-hint-text">
                    检测到上次关窗时勾选了「不再提醒」，将一直按记忆中的操作执行。若要改回弹框或切换行为，可清除记忆，或重新选择上方关闭方式。
                  </p>
                  <el-button type="warning" plain size="small" @click="clearStoredCloseConfirm">
                    清除「不再提醒」记忆
                  </el-button>
                </div>
              </Transition>
              </div>
            </Transition>
          </div>
        </section>

        <!-- Update -->
        <section :id="sectionDomId('update')" class="settings-section settings-section-last">
          <div class="section-card" :class="{ 'is-collapsed': !sectionExpanded.update }">
            <button
              type="button"
              class="section-head section-head-toggle"
              :aria-expanded="sectionExpanded.update"
              @click="toggleSection('update')"
            >
              <div class="section-head-left">
                <span class="section-icon"><el-icon><Refresh /></el-icon></span>
                <div>
                  <h2 class="section-title">更新设置</h2>
                  <p class="section-desc">版本检查与自动更新</p>
                </div>
              </div>
              <el-icon class="collapse-chevron" :class="{ expanded: sectionExpanded.update }"><ArrowDown /></el-icon>
            </button>
            <Transition name="section-collapse">
              <div v-show="sectionExpanded.update" class="section-body">
              <div class="version-bar">
                <div class="version-chip">
                  <span class="version-chip-label">当前版本</span>
                  <span class="version-chip-value">{{ appVersion || '…' }}</span>
                </div>
                <el-button
                  type="primary"
                  :icon="Refresh"
                  @click="handleCheckUpdate"
                  :loading="checkingUpdate"
                  :disabled="downloadingUpdate || installingUpdate || !isElectronAvailable"
                >
                  {{ checkingUpdate ? '检查中…' : '检查更新' }}
                </el-button>
              </div>

              <div class="auto-update-row">
                <el-switch
                  v-model="formData.auto_check_update"
                  @change="value => savePreference('auto_check_update', value)"
                  active-text="启动时自动检查更新"
                  :disabled="!isElectronAvailable || savingPreference"
                />
                <el-tooltip content="开启后，应用启动时会自动检查是否有新版本" placement="top">
                  <el-icon class="inline-help"><QuestionFilled /></el-icon>
                </el-tooltip>
              </div>

              <Transition name="fade">
                <div v-if="updateStatus" class="update-status-panel">
                  <div class="status-header">
                    <el-icon :class="['status-icon', `status-icon-${updateStatus.type}`]">
                      <component :is="getStatusIcon(updateStatus.status)" />
                    </el-icon>
                    <div class="status-title-group">
                      <h4 class="status-title">{{ updateStatus.title }}</h4>
                      <p v-if="updateStatus.message" class="status-message">{{ updateStatus.message }}</p>
                    </div>
                  </div>

                  <div v-if="updateStatus.version" class="update-info-item">
                    <el-icon class="info-icon"><InfoFilled /></el-icon>
                    <span class="info-label">{{ updateStatus.status === 'available' ? '新版本' : '服务器版本' }}</span>
                    <el-tag type="success" size="small">{{ updateStatus.version }}</el-tag>
                  </div>

                  <div v-if="updateStatus.releaseNotes" class="update-notes">
                    <div class="notes-header">
                      <el-icon><Document /></el-icon>
                      <span>更新说明</span>
                    </div>
                    <div class="notes-content" v-html="updateStatus.releaseNotes" />
                  </div>

                  <Transition name="slide-fade">
                    <div v-if="downloadProgress !== null" class="download-progress-container">
                      <div class="progress-header">
                        <span class="progress-label">下载进度</span>
                        <span class="progress-percent">{{ downloadProgress }}%</span>
                      </div>
                      <el-progress
                        :percentage="downloadProgress"
                        :status="downloadProgress === 100 ? 'success' : 'active'"
                        :stroke-width="8"
                      />
                      <p v-if="downloadProgress < 100" class="progress-tip">正在下载更新文件，请稍候…</p>
                    </div>
                  </Transition>

                  <div class="update-actions">
                    <el-button
                      v-if="updateStatus.status === 'available'"
                      type="primary"
                      :icon="Download"
                      @click="handleDownloadUpdate"
                      :loading="downloadingUpdate"
                      :disabled="installingUpdate"
                    >
                      {{ downloadingUpdate ? '下载中…' : '立即下载' }}
                    </el-button>
                    <el-button
                      v-if="updateStatus.status === 'downloaded'"
                      type="success"
                      :icon="CircleCheck"
                      @click="handleInstallUpdate"
                      :loading="installingUpdate"
                    >
                      {{ installingUpdate ? '准备中…' : '立即重启并安装' }}
                    </el-button>
                    <el-button
                      v-if="updateStatus.status === 'error'"
                      type="primary"
                      :icon="Refresh"
                      @click="handleCheckUpdate"
                      :loading="checkingUpdate"
                    >
                      重试
                    </el-button>
                  </div>
                </div>
              </Transition>
              </div>
            </Transition>
          </div>
        </section>
      </main>
    </div>

  </div>
</template>


<script setup>
import { createDiagnostics } from '../utils/diagnostics.mjs'
const diagnostics = createDiagnostics('pages/SettingsPage.vue')
import { createFeedback } from '../utils/feedback.mjs'
const feedback = createFeedback('pages/SettingsPage.vue')

import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
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
  WarningFilled,
  Connection,
  ChatLineRound,
  Promotion,
  Monitor,
  ArrowDown,
  Sunny
} from '@element-plus/icons-vue'
import { useConfigStore } from '../stores/config'
import { DEFAULT_SERVER_PORT_STRING } from '../utils/constants'
import { getCloseConfirmAutoAction, clearCloseConfirmPrefs } from '../utils/closeConfirmPrefs'
import { getStoredThemeMode } from '../utils/theme'
import { isWecomHookBodyOk } from '../utils/wecomHookBody.mjs'

const configStore = useConfigStore()
const setThemeModeGlobal = inject('setThemeMode', null)
const saving = ref(false)
const isDirty = ref(false)
const skipDirtyWatch = ref(false)
const activeSection = ref('http')
const mainScrollRef = ref(null)
const sectionExpanded = reactive({
  http: false,
  wecom: false,
  api: false,
  appearance: false,
  window: false,
  update: false
})
const themeMode = ref(getStoredThemeMode())
const navSections = [
  { id: 'http', label: '回调与加密', icon: Connection },
  { id: 'wecom', label: '企微版本', icon: ChatLineRound },
  { id: 'api', label: '接口调试', icon: Promotion },
  { id: 'appearance', label: '外观', icon: Sunny },
  { id: 'window', label: '窗口', icon: Monitor },
  { id: 'update', label: '更新', icon: Refresh }
]

let sectionObserver = null

function sectionDomId(id) {
  return `settings-section-${id}`
}

function expandOnly(id) {
  for (const key of Object.keys(sectionExpanded)) {
    sectionExpanded[key] = key === id
  }
  activeSection.value = id
}

function scrollToSection(id) {
  activeSection.value = id
  expandOnly(id)
  nextTick(() => {
    document.getElementById(sectionDomId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function toggleSection(id) {
  if (sectionExpanded[id]) {
    sectionExpanded[id] = false
    return
  }
  expandOnly(id)
}

function setLocalTheme(mode) {
  themeMode.value = mode
  setThemeModeGlobal?.(mode)
}

watch(
  () => activeSection.value,
  (id) => {
    if (id === 'appearance') {
      themeMode.value = getStoredThemeMode()
    }
  }
)

function setupSectionObserver() {
  sectionObserver?.disconnect()
  const elements = navSections
    .map((s) => document.getElementById(sectionDomId(s.id)))
    .filter(Boolean)
  if (!elements.length) return

  const root = mainScrollRef.value || null
  sectionObserver = new IntersectionObserver(
    (entries) => {
      if (Object.values(sectionExpanded).some(Boolean)) return
      const top = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (!top) return
      const matched = navSections.find((s) => top.target.id === sectionDomId(s.id))
      if (matched) activeSection.value = matched.id
    },
    { root, rootMargin: '-8% 0px -55% 0px', threshold: [0.12, 0.35, 0.6] }
  )
  elements.forEach((el) => sectionObserver.observe(el))
}

/** localStorage「不再提醒」存在时文案提示 */
const hasStoredCloseConfirmPrefs = ref(false)

/** POST /api 调试：固定正文；user_id、企微 port 用户填写 */
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
  wecom_exe_path_v5: '',
  /** 默认可在设置中关闭；此前未写入 ini 时也视为开启 */
  auto_check_update: true,
  /** ask | tray | quit，写入 ini sys.window_close_action */
  window_close_action: 'ask'
})

// 持久配置按账号 ID 匹配；页面草稿按运行实例及账号隔离，不冒充企微实际配置。
const callbackInstances = ref([])
const selectedCallbackPort = ref('')
const loadingInstances = ref(false)
const updatingInstance = ref(false)
let callbackRefreshPending = false
const instanceDrafts = reactive({})
const selectedCallbackRow = computed(() => callbackInstances.value.find(row => String(row.port) === selectedCallbackPort.value))
const emptyInstanceForm = () => ({ push_enabled: false, push_url: '', push_timeout_ms: 2000, push_retries: 2, encrypt: false, public_key: '' })
const blankInstanceForm = reactive(emptyInstanceForm())
const instanceForm = computed(() => {
  const row = selectedCallbackRow.value
  if (!row) return blankInstanceForm
  return instanceDrafts[row.port + ':' + row.pid + ':' + row.user_id]?.form || blankInstanceForm
})
const instanceStatus = computed(() => {
  const row = selectedCallbackRow.value
  if (!row) return '没有选中的运行实例；请先添加企微，或刷新列表。'
  const draft = instanceDrafts[row.port + ':' + row.pid + ':' + row.user_id]
  if (!row.user_id) return '尚未取得账号 ID，请先登录企微，再刷新列表以匹配已保存的配置。'
  if (draft?.storageWarning) return draft.storageWarning
  if (draft?.restored) return '已按账号 ID 匹配上次保存的回调与加密设置；点击更新应用到当前企微。'
  return draft?.confirmed ? '已向该实例成功提交配置；继续编辑后需再次点击更新。' : '以下为本地初始值或草稿，尚未确认企微实际配置。请核对后点击更新。'
})
async function refreshCallbackInstances() {
  if (loadingInstances.value || updatingInstance.value) {
    callbackRefreshPending = true
    return
  }
  callbackRefreshPending = false
  loadingInstances.value = true
  try {
    const rows = await window.electronAPI.listCallbackInstances()
    for (const row of rows) {
      const key = row.port + ':' + row.pid + ':' + row.user_id
      if (!instanceDrafts[key]) {
        const cfg = row.settings
        instanceDrafts[key] = { confirmed: row.confirmed === true, restored: row.restored === true, storageWarning: row.storageWarning || '', form: cfg ? {
          push_enabled: cfg.enabled, push_url: cfg.url, push_timeout_ms: cfg.timeout_ms,
          push_retries: cfg.retries, encrypt: cfg.Message_Encryption, public_key: cfg.RSA_PublicKey
        } : emptyInstanceForm() }
      }
    }
    const activeKeys = new Set(rows.map(row => row.port + ':' + row.pid + ':' + row.user_id))
    for (const key of Object.keys(instanceDrafts)) {
      if (!activeKeys.has(key)) delete instanceDrafts[key]
    }
    callbackInstances.value = rows
    if (!rows.some(row => String(row.port) === selectedCallbackPort.value)) selectedCallbackPort.value = rows.length ? String(rows[0].port) : ''
  } catch (error) { feedback.error('C002', '读取企微实例失败：' + error.message) }
  finally {
    loadingInstances.value = false
    if (callbackRefreshPending) void refreshCallbackInstances()
  }
}
watch(() => JSON.stringify(wecomManagerInstances.value.map(row => [row.port, row.user_id])), refreshCallbackInstances)

async function updateCallbackInstance() {
  const row = selectedCallbackRow.value
  if (!row || updatingInstance.value) return
  const draft = instanceDrafts[row.port + ':' + row.pid + ':' + row.user_id]
  const form = { ...draft.form }
  updatingInstance.value = true
  try {
    const result = await window.electronAPI.updateInstanceCallback({ port: row.port, pid: row.pid, user_id: row.user_id, settings: {
      enabled: form.push_enabled, url: form.push_url, timeout_ms: form.push_timeout_ms,
      retries: form.push_retries, Message_Encryption: form.encrypt, RSA_PublicKey: form.public_key
    } })
    if (!result.success) throw new Error(result.msg)
    draft.confirmed = true
    draft.restored = false
    draft.storageWarning = result.warning || ''
    if (result.warning) { ElMessage.warning(result.warning); return }
    ElMessage.success('当前企微已更新，配置已按账号 ID 保存')
  } catch (error) { feedback.error('C003', error.message || '更新失败') }
  finally {
    updatingInstance.value = false
    if (callbackRefreshPending) void refreshCallbackInstances()
  }
}

/** 展示即将/实际请求的 URL 与 Body（与实际发送一致时需 HTTP 端口 / user_id 已合法填写） */
const textTestRequestPreview = computed(() => {
  const wPortParsed = parseInt(String(textTestWecomPort.value || '').trim(), 10)
  const portOk =
    !Number.isNaN(wPortParsed) && wPortParsed >= 1 && wPortParsed <= 65535
  const url = portOk
    ? `http://127.0.0.1:${wPortParsed}/api`
    : '（请选择 HTTP 端口）'

  const uid = String(textTestUserId.value || '').trim()

  const payload = {
    type: 3000,
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
const injectSettingsLoaded = ref(false)
const savedInjectSettings = ref(null)
const applyInjectSettings = (data) => { formData.wecom_exe_path_v5 = data.host || '' }
const loadInjectSettings = async () => {
  const result = await window.electronAPI?.readInjectSettings()
  if (!result?.success) {
    feedback.error('U001', result?.msg || '读取注入配置失败，请重启框架后重试')
    return
  }
  savedInjectSettings.value = result.data
  applyInjectSettings(result.data)
  injectSettingsLoaded.value = true
  await nextTick()
  isDirty.value = false
}

const loadConfig = () => {
  skipDirtyWatch.value = true
  const config = configStore.config
  formData.server_port = config.sys?.server_port || DEFAULT_SERVER_PORT_STRING
  formData.callback = config.sys?.callback || ''
  if (savedInjectSettings.value) applyInjectSettings(savedInjectSettings.value)
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
  skipDirtyWatch.value = false
  isDirty.value = false
}

watch(
  () => formData.wecom_exe_path_v5,
  () => {
    if (skipDirtyWatch.value) return
    isDirty.value = formData.wecom_exe_path_v5 !== (savedInjectSettings.value?.host || '')
  },
  { deep: true }
)

async function handleTestMessageText() {
  if (!window.electronAPI?.callAPI) {
    feedback.warning('U003', '当前环境无法调用 Electron 接口')
    return
  }
  const uid = String(textTestUserId.value || '').trim()
  if (!uid) {
    feedback.warning('U004', '请填写接收方 user_id')
    return
  }
  const wPort = parseInt(String(textTestWecomPort.value || '').trim(), 10)
  if (Number.isNaN(wPort) || wPort < 1 || wPort > 65535) {
    feedback.warning('U005', '请选择有效的 HTTP 端口（1～65535）')
    return
  }

  testingTextMsg.value = true
  textTestResponseRaw.value = ''
  const url = `http://127.0.0.1:${wPort}/api`
  try {
    const result = await window.electronAPI.callAPI({
      url,
      method: 'POST',
      data: {
        type: 3000,
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
      feedback.error('U007', result?.msg || '请求失败')
      return
    }

    const body = result.data
    textTestResponseRaw.value =
      typeof body === 'string'
        ? body
        : JSON.stringify(body, null, 2)

    const innerOk = isWecomHookBodyOk(body)
    if (innerOk) {
      ElMessage.success('调用成功')
    } else {
      const m = body?.errmsg || body?.error || body?.message || '接口返回 failure'
      feedback.warning('U008', typeof m === 'string' ? m : '接口返回异常，请看下方正文')
    }
  } catch (e) {
    const wrap = {
      exception: true,
      message: e?.message || String(e)
    }
    textTestResponseRaw.value = JSON.stringify(wrap, null, 2)
    feedback.error('U009', e?.message || String(e))
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
      diagnostics.error('L001', '获取版本失败:', error)
      appVersion.value = '未知'
    }
  }
}

// 工具函数：检查 Electron API 是否可用
const checkElectronAPI = () => {
  if (!window.electronAPI) {
    feedback.warning('U010', '当前环境不支持更新功能')
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
      feedback.warning('U011', result.message || '检查更新失败')
    } else if (result.usedFallback) {
      ElMessage.info(result.message || '已改用备用更新源检查更新')
    }
  } catch (error) {
    updateStatus.value = createUpdateStatus(
      'error',
      'error',
      '检查更新失败',
      error.message
    )
    feedback.error('U012', '检查更新失败: ' + error.message)
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
      feedback.warning('U013', result.message || '下载更新失败')
      resetUpdateState()
    }
  } catch (error) {
    feedback.error('U014', '下载更新失败: ' + error.message)
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
      feedback.warning('U015', result.message || '安装更新失败')
      installingUpdate.value = false
    }
  } catch (error) {
    feedback.error('U016', '安装更新失败: ' + error.message)
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
      feedback.error('U017', data.message)
    }
  }

  const handler = statusHandlers[data.status]
  if (handler) {
    handler()
  } else {
    diagnostics.warn('L002', '未知的更新状态:', data.status)
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

const savingPreference = ref(false)
async function savePreference(key, value) {
  if (savingPreference.value) return
  const previous = configStore.config.sys?.[key]
  savingPreference.value = true
  try {
    const result = await window.electronAPI.saveConfig({ sys: { [key]: String(value) } })
    if (!result.success) throw new Error(result.msg)
    configStore.config.sys = { ...configStore.config.sys, [key]: String(value) }
    formData[key] = value
    if (key === 'window_close_action') { clearCloseConfirmPrefs(); refreshCloseConfirmPrefsHint() }
    ElMessage.success('偏好已保存')
  } catch (error) {
    formData[key] = key === 'auto_check_update' ? previous == null || previous === true || previous === 'true' : previous || 'ask'
    feedback.error('P001', error.message || '保存偏好失败，请重试')
  } finally { savingPreference.value = false }
}

// 保存配置
const handleSave = async () => {
  if (!injectSettingsLoaded.value) return feedback.error('U018', '请先读取客户端路径配置')
  saving.value = true
  try {
    const result = await window.electronAPI.saveInjectHost(formData.wecom_exe_path_v5)
    if (!result.success) throw new Error(result.msg)
    savedInjectSettings.value = { host: formData.wecom_exe_path_v5 }
    isDirty.value = false
    ElMessage.success('客户端路径已保存；实例回调和加密配置请使用上方更新按钮')
  } catch (error) { feedback.error('U023', error.message || '保存失败') }
  finally { saving.value = false }
}

// 仅在没有未保存草稿时回填；编辑中不读盘、不写 bin，避免和文件来回同步
watch(
  () => configStore.config.sys,
  (newSys) => {
    if (!newSys?.server_port || isDirty.value || saving.value) return
    loadConfig()
  },
  { deep: true }
)

onMounted(async () => {
  await refreshCallbackInstances()
  const hasLoaded =
    configStore.config.sys?.server_port &&
    configStore.config.sys?.callback !== undefined

  if (!hasLoaded) {
    await configStore.loadConfig()
  }
  loadConfig()
  await loadInjectSettings()
  loadAppVersion()
  setupUpdateListeners()
  themeMode.value = getStoredThemeMode()
  await nextTick()
  setupSectionObserver()
})

onUnmounted(() => {
  sectionObserver?.disconnect()
  sectionObserver = null
  if (window.electronAPI?.removeUpdateListeners) {
    window.electronAPI.removeUpdateListeners()
  }
})
</script>

<style scoped>
.instance-toolbar { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px; padding: 16px; background: var(--sp-subtle-bg); border: 1px solid var(--sp-border); border-radius: 10px; }
.instance-picker { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 200px; }
.instance-picker label { font-size: 13px; font-weight: 600; }
.instance-select { width: 100%; }
.instance-status { font-size: 12px; line-height: 1.7; color: var(--sp-muted); margin: 12px 0 24px; }
.card-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 24px; border-top: 1px solid var(--sp-border); background: var(--sp-subtle-bg); }
.card-actions :deep(.el-button) { flex-shrink: 0; min-width: 124px; margin: 0; }
.card-note, .card-status { margin: 0; font-size: 12px; line-height: 1.6; color: var(--sp-muted); }
.card-status { display: flex; align-items: center; gap: 8px; }
.card-status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--el-color-success); flex-shrink: 0; }
.is-dirty .card-status::before { background: var(--el-color-warning); }
.is-saving .card-status::before { background: var(--sp-accent); }
.option-card:disabled { cursor: wait; opacity: .65; }
.option-card:focus-visible { outline: 2px solid var(--sp-accent); outline-offset: 3px; }
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--sp-bg);
  color: var(--sp-text);
}

.settings-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 0;
}

.settings-nav {
  flex-shrink: 0;
  width: var(--sp-nav-w);
  padding: 24px 12px;
  border-right: 1px solid var(--sp-border);
  background: var(--sp-surface);
  overflow-y: auto;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 12px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--sp-muted);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
}

.nav-item:hover {
  background: var(--sp-accent-soft);
  color: var(--sp-text);
}

.nav-item.active {
  background: var(--sp-accent-soft);
  color: var(--sp-accent);
}

.nav-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.nav-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 3px;
  height: 18px;
  border-radius: 0 3px 3px 0;
  background: var(--sp-accent);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.nav-item.active .nav-indicator {
  transform: translateY(-50%) scaleY(1);
}

.settings-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 24px clamp(16px, 3vw, 36px) 40px;
  scroll-behavior: smooth;
}

.settings-main:focus-visible,
.nav-item:focus-visible {
  outline: 2px solid var(--sp-accent);
  outline-offset: -2px;
}

.settings-section {
  scroll-margin-top: 12px;
  margin: 0 auto 24px;
  max-width: 1000px;
}

.settings-section-last {
  margin-bottom: 8px;
}

.wecom-version-radio {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.wecom-version-unavailable {
  margin-left: 4px;
  font-size: 12px;
  color: var(--el-color-warning);
}

.section-card {
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius);
  box-shadow: 0 2px 6px rgb(15 23 42 / 3%);
  overflow: hidden;
  transition: box-shadow 0.25s ease, border-color 0.25s ease;
}

.section-card:hover {
  border-color: var(--sp-border);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--sp-border);
}

.section-head-toggle {
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: background 0.2s ease;
}

.section-head-toggle:hover {
  background: rgba(64, 158, 255, 0.04);
}

.section-head-toggle:focus-visible {
  outline: 2px solid var(--sp-accent);
  outline-offset: -2px;
}

.section-card.is-collapsed .section-head {
  border-bottom-color: transparent;
}

.section-head-left {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.section-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.section-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--sp-accent-soft);
  color: var(--sp-accent);
  flex-shrink: 0;
}

.section-icon.accent {
  background: rgba(103, 194, 58, 0.1);
  color: var(--el-color-success);
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
}

.section-desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--sp-muted);
  line-height: 1.45;
}

.section-body {
  padding: 24px;
}

.api-section-body {
  padding-top: 16px;
}

.help-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sp-muted);
  cursor: help;
  transition: color 0.2s, background 0.2s;
}

.help-btn:hover {
  color: var(--sp-accent);
  background: var(--sp-accent-soft);
}

.inline-help {
  margin-left: 4px;
  vertical-align: -2px;
  color: var(--sp-muted);
  cursor: help;
  font-size: 14px;
}

.inline-help:hover {
  color: var(--sp-accent);
}

.collapse-chevron {
  font-size: 14px;
  color: var(--sp-muted);
  transition: transform 0.28s cubic-bezier(0.34, 1.2, 0.64, 1);
}

.collapse-chevron.expanded {
  transform: rotate(180deg);
}

.section-collapse-enter-active,
.section-collapse-leave-active {
  transition: opacity 0.28s ease, max-height 0.32s ease;
  overflow: hidden;
}

.section-collapse-enter-from,
.section-collapse-leave-to {
  opacity: 0;
  max-height: 0;
}

.section-collapse-enter-to,
.section-collapse-leave-from {
  max-height: 2000px;
}

.field-grid {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 22px 24px;
  align-items: start;
}

.field-label {
  padding-top: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--sp-muted);
  text-align: left;
}

.field-control {
  min-width: 0;
}

.field-input {
  width: 100%;
  max-width: 260px;
}

.field-input-wide {
  width: 100%;
  max-width: 100%;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--sp-muted);
}

.key-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.key-row .field-input-wide {
  flex: 1;
  min-width: 220px;
}

.key-row-actions {
  margin-top: 8px;
}

.decrypt-sample {
  margin: 10px 0 0;
  padding: 10px 12px;
  max-width: 480px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.45;
  color: var(--sp-muted);
  background: var(--sp-toolbar-bg);
  border: 1px solid var(--sp-border);
  border-radius: 8px;
}

.theme-cards {
  margin-top: 0;
}

.option-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.option-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--sp-border);
  border-radius: 10px;
  background: var(--sp-toolbar-bg);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s, transform 0.15s ease;
}

.option-card:hover {
  border-color: var(--sp-accent);
  transform: translateY(-1px);
}

.option-card.selected {
  border-color: var(--sp-accent);
  background: var(--sp-accent-soft);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.15);
}

.option-card-radio {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border: 2px solid var(--sp-control-border);
  border-radius: 50%;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.option-card.selected .option-card-radio {
  border-color: var(--sp-accent);
  box-shadow: inset 0 0 0 3px var(--sp-accent);
}

.option-card-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.option-card-title {
  font-size: 13px;
  font-weight: 600;
}

.option-card-desc {
  font-size: 12px;
  color: var(--sp-muted);
  line-height: 1.45;
}

.close-prefs-hint-box {
  margin-top: 16px;
  padding: 12px 14px;
  background: var(--sp-warning-bg);
  border: 1px solid var(--sp-warning-border);
  border-radius: 10px;
}

.close-prefs-hint-text {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sp-warning-text);
}

.version-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  margin-bottom: 12px;
  border-bottom: 1px dashed var(--sp-border);
}

.version-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
}

.version-chip-label {
  font-size: 13px;
  color: var(--sp-muted);
}

.version-chip-value {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--sp-text);
}

.auto-update-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.update-status-panel {
  margin-top: 16px;
  padding: 16px;
  background: var(--sp-subtle-bg);
  border: 1px solid var(--sp-border);
  border-radius: 10px;
  animation: fadeIn 0.3s ease;
}

.status-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.status-icon {
  font-size: 22px;
  margin-top: 2px;
  flex-shrink: 0;
}

.status-icon-checking {
  color: var(--sp-accent);
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
  min-width: 0;
}

.status-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
}

.status-message {
  margin: 0;
  font-size: 13px;
  color: var(--sp-muted);
  line-height: 1.5;
}

.update-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--sp-surface);
  border-radius: 8px;
  border: 1px solid var(--sp-border);
}

.info-icon {
  color: var(--sp-accent);
}

.info-label {
  font-size: 13px;
  color: var(--sp-muted);
  font-weight: 500;
}

.update-notes {
  margin-top: 12px;
  padding: 12px;
  background: var(--sp-surface);
  border-radius: 8px;
  border: 1px solid var(--sp-border);
}

.notes-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}

.notes-content {
  font-size: 13px;
  color: var(--sp-muted);
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
  padding-left: 4px;
}

.download-progress-container {
  margin-top: 14px;
  padding: 14px;
  background: var(--sp-surface);
  border-radius: 8px;
  border: 1px solid var(--sp-border);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.progress-label {
  font-size: 13px;
  font-weight: 500;
}

.progress-percent {
  font-size: 13px;
  font-weight: 600;
  color: var(--sp-accent);
}

.progress-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--sp-muted);
  text-align: center;
}

.update-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--sp-border);
}

.api-test-split {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(260px, 1.08fr);
  gap: 20px;
  align-items: stretch;
  width: 100%;
}

.api-test-split-left {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.api-test-split-right {
  min-width: 0;
  display: flex;
}

.api-test-rows {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.api-test-row {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  column-gap: 12px;
  align-items: start;
}

.api-test-field-label {
  margin: 0;
  padding-top: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--sp-muted);
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

.api-test-wecom-select,
.api-test-unified-input {
  width: 100%;
}

.api-test-wecom-empty {
  margin: 0;
  font-size: 12px;
  color: var(--sp-muted);
}

.api-test-msg-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.api-test-msg-caption {
  font-size: 12px;
  color: var(--sp-muted);
}

.api-test-msg-code {
  display: block;
  padding: 8px 12px;
  background: var(--sp-subtle-bg);
  border: 1px solid var(--sp-border);
  border-radius: 8px;
  font-size: 13px;
  font-family: ui-monospace, Consolas, monospace;
  word-break: break-word;
}

.api-test-actions-row {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  column-gap: 12px;
  margin-top: 8px;
}

.api-test-actions-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.api-test-request-visual {
  width: 100%;
  padding: 16px;
  background: var(--sp-subtle-bg);
  border: 1px solid var(--sp-border);
  border-radius: 10px;
}

.api-test-visual-heading {
  margin: 0 0 12px;
  padding-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid var(--sp-border);
}

.api-test-meta-tight:not(:last-child) {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--sp-border);
}

.api-test-meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 13px;
}

.api-test-meta-line-stack {
  flex-direction: column;
  align-items: stretch;
}

.api-test-meta-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--sp-muted);
}

.api-test-meta-value-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.api-test-meta-url {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  font-size: 12px;
  color: var(--sp-accent);
  background: var(--sp-accent-soft);
  padding: 6px 10px;
  border-radius: 6px;
  font-family: ui-monospace, Consolas, monospace;
}

.api-test-meta-method {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  background: rgba(64, 158, 255, 0.12);
  border-radius: 4px;
}

.api-test-json-pre {
  margin: 0;
  padding: 8px 12px;
  max-height: 200px;
  overflow: auto;
  background: var(--sp-code-bg);
  border: 1px solid var(--sp-border);
  border-radius: 8px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.api-test-split-right .api-test-json-pre {
  max-height: clamp(140px, 28vh, 280px);
}

.api-test-resp-loading,
.api-test-resp-placeholder {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  border: 1px dashed var(--sp-border);
  border-radius: 8px;
  background: var(--sp-code-bg);
}

.api-test-resp-placeholder {
  color: var(--sp-muted);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes save-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.35); }
  50% { box-shadow: 0 0 0 6px rgba(64, 158, 255, 0); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.slide-fade-enter-active { transition: all 0.28s ease-out; }
.slide-fade-leave-active { transition: all 0.2s ease-in; }
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}



.nav-caption { padding: 0 12px 14px; font-size: 11px; font-weight: 600; letter-spacing: .08em; color: var(--sp-muted); }
.control-inline { display: flex; align-items: center; gap: 12px; }
.inline-hint { margin: 0; }
.callback-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; max-width: 460px; }
.compact-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.compact-field label { font-size: 12px; color: var(--sp-text); }
.compact-field label span { margin-left: 6px; color: var(--sp-muted); }
.compact-field :deep(.el-input-number) { width: 100%; }
.settings-page :deep(.el-input__wrapper), .settings-page :deep(.el-select__wrapper) { min-height: 36px; border-radius: 7px; }
.settings-page :deep(.el-textarea__inner) { border-radius: 7px; }
.settings-page button:focus-visible { outline: 2px solid var(--sp-accent); outline-offset: 3px; }
.section-desc, .field-hint, .option-card-desc { line-height: 1.65; overflow-wrap: anywhere; }
@media (max-width: 960px) {
  .settings-body {
    flex-direction: column;
  }

  .settings-nav {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--sp-border);
    padding: 10px 16px;
    box-sizing: border-box;
    overflow-x: auto;
  }

  .nav-list {
    flex-direction: row;
    position: static;
    gap: 6px;
  }

  .nav-item {
    flex-shrink: 0;
    width: auto;
    white-space: nowrap;
    padding: 8px 12px;
  }

  .nav-indicator {
    display: none;
  }

  .nav-caption { display: none; }
  .option-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }

  .api-test-split {
    grid-template-columns: 1fr;
  }

  .field-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .field-control { margin-bottom: 12px; }

  .field-label {
    text-align: left;
    padding-top: 0;
  }
}

@media (max-width: 640px) {
  .section-head, .section-body { padding: 18px 16px; }
  .option-cards { grid-template-columns: 1fr; }
  .settings-main { padding-top: 16px; }
  .instance-toolbar { align-items: stretch; }
  .instance-picker { flex-basis: 100%; min-width: 0; }
  .card-actions { text-align: left; }
  .field-input, .field-input-wide { max-width: 100%; }
  .settings-main,
  .card-actions {
    padding-left: 16px;
    padding-right: 16px;
  }

  .card-actions {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
  }

  .card-actions :deep(.el-button) {
    width: 100%;
  }

  .api-test-row,
  .api-test-actions-row {
    grid-template-columns: 1fr;
  }

  .api-test-field-label {
    padding-top: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .settings-page *, .settings-page *::before { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
</style>
