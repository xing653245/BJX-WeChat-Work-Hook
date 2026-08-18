<template>
  <div class="settings-page">
    <div class="settings-body">
      <aside class="settings-nav" aria-label="设置分区导航">
        <nav class="nav-list">
          <button
            v-for="item in navSections"
            :key="item.id"
            type="button"
            class="nav-item"
            :class="{ active: activeSection === item.id }"
            @click="scrollToSection(item.id)"
          >
            <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
            <span class="nav-indicator" aria-hidden="true" />
          </button>
        </nav>
      </aside>

      <main ref="mainScrollRef" class="settings-main">
        <!-- HTTP -->
        <section :id="sectionDomId('http')" class="settings-section">
          <div class="section-card">
            <div class="section-head">
              <div class="section-head-left">
                <span class="section-icon"><el-icon><Connection /></el-icon></span>
                <div>
                  <h2 class="section-title">HTTP 设置</h2>
                  <p class="section-desc">框架监听端口、消息回调与推送加密</p>
                </div>
              </div>
              <el-tooltip
                content="当你需要调用框架的接口时，就是用的这个端口&#10;调用框架的地址为：http://127.0.0.1:端口号/api&#10;修改后保存即可切换接口地址；已登录企微无需重新添加"
                placement="top"
              >
                <button type="button" class="help-btn" aria-label="帮助"><el-icon><QuestionFilled /></el-icon></button>
              </el-tooltip>
            </div>
            <div class="section-body">
              <div class="field-grid">
                <label class="field-label" for="settings-server-port">监听端口</label>
                <div class="field-control">
                  <el-input
                    id="settings-server-port"
                    v-model="formData.server_port"
                    placeholder="1024–10000"
                    class="field-input"
                  />
                  <p class="field-hint">有效范围 (1024, 10000]。保存后立即切换接口地址，已登录企微可继续使用</p>
                </div>

                <label class="field-label" for="settings-callback">回调地址</label>
                <div class="field-control">
                  <el-input
                    id="settings-callback"
                    v-model="formData.callback"
                    placeholder="如 http://127.0.0.1:8001/msg"
                    class="field-input field-input-wide"
                  />
                  <p class="field-hint">
                    框架向此 POST 地址推送企微消息（JSON）；修改后无需重启
                    <el-tooltip
                      content="这个回调地址，是框架向你推送企微消息的地址&#10;接口需要是POST，且我传给你的是JSON&#10;你需要搭建这个回调服务，并把地址填入"
                      placement="top"
                    >
                      <el-icon class="inline-help"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </p>
                </div>

                <label class="field-label" for="settings-callback-encrypt">消息加密</label>
                <div class="field-control">
                  <el-switch id="settings-callback-encrypt" v-model="formData.callback_encrypt" />
                  <p class="field-hint">
                    开启后，推送到回调地址的正文使用 AES-256-GCM 加密；未开启则仍为明文 JSON。保存后需要重启框架
                    <el-tooltip
                      content="加密后请求头带 X-VWork-Encrypt: AES-256-GCM&#10;正文为 { encrypted, alg, iv, tag, ciphertext }&#10;用下方 64 位十六进制密钥解密即可得到原来的 JSON"
                      placement="top"
                    >
                      <el-icon class="inline-help"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </p>
                </div>

                <template v-if="formData.callback_encrypt">
                  <label class="field-label" for="settings-callback-encrypt-key">解密密钥</label>
                  <div class="field-control">
                    <div class="key-row">
                      <el-input
                        id="settings-callback-encrypt-key"
                        v-model="formData.callback_encrypt_key"
                        type="password"
                        show-password
                        placeholder="64 位十六进制（32 字节）"
                        class="field-input-wide"
                      />
                      <el-button @click="copyEncryptKey">复制</el-button>
                      <el-button @click="regenerateEncryptKey">重新生成</el-button>
                    </div>
                    <p class="field-hint">
                      请妥善保存并配置到你的回调服务；重新生成后旧密钥无法解密之后的推送。
                    </p>
                    <pre class="decrypt-sample">{{ decryptSampleText }}</pre>
                    <div class="key-row key-row-actions">
                      <el-button size="small" plain @click="copyDecryptSnippet('node')">复制 Node 解密</el-button>
                      <el-button size="small" plain @click="copyDecryptSnippet('python')">复制 Python 解密</el-button>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </section>

        <!-- WeCom Version -->
        <section :id="sectionDomId('wecom')" class="settings-section">
          <div class="section-card">
            <div class="section-head">
              <div class="section-head-left">
                <span class="section-icon accent"><el-icon><ChatLineRound /></el-icon></span>
                <div>
                  <h2 class="section-title">企微版本</h2>
                  <p class="section-desc">注入工具与客户端安装路径</p>
                </div>
              </div>
            </div>
            <div class="section-body">
              <div class="field-grid">
                <label class="field-label" for="settings-wecom-version">注入版本</label>
                <div class="field-control">
                  <el-radio-group id="settings-wecom-version" v-model="formData.wecom_version" class="wecom-version-radio">
                    <el-radio
                      v-for="item in wecomVersionOptions"
                      :key="item.id"
                      :label="item.id"
                      :disabled="!item.available"
                    >
                      {{ item.label }}
                      <span v-if="!item.available" class="wecom-version-unavailable">（未安装）</span>
                    </el-radio>
                  </el-radio-group>
                  <p class="field-hint">
                    选择「添加企微」时使用的企微版本；修改后需重启框架
                  </p>
                </div>

                <label class="field-label" for="settings-wecom-exe-v4">v4 客户端路径</label>
                <div class="field-control">
                  <el-input
                    id="settings-wecom-exe-v4"
                    v-model="formData.wecom_exe_path_v4"
                    placeholder="如 D:\WeCom4\WXWork.exe"
                    class="field-input field-input-wide"
                  />
                  <p class="field-hint">仅支持企微 v4.1.36.6012 版本客户端</p>
                </div>

                <label class="field-label" for="settings-wecom-exe-v5">v5 客户端路径</label>
                <div class="field-control">
                  <el-input
                    id="settings-wecom-exe-v5"
                    v-model="formData.wecom_exe_path_v5"
                    placeholder="如 D:\WeCom5\WXWork.exe"
                    class="field-input field-input-wide"
                  />
                  <p class="field-hint">仅支持企微 v5.0.3.6005 版本客户端</p>
                </div>
              </div>
            </div>
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
                  <p class="section-desc">POST /api/message/text 快速验证</p>
                </div>
              </div>
              <div class="section-head-right">
                <el-tooltip
                  content="发往本框架：POST http://127.0.0.1:{监听端口}/api/message/text。请求 JSON 包含 port（企微实例 HTTP 端口）、user_id、msg。"
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
            </Transition>
          </div>
        </section>

        <!-- Logs -->
        <section :id="sectionDomId('logs')" class="settings-section">
          <div class="section-card">
            <div class="section-head">
              <div class="section-head-left">
                <span class="section-icon"><el-icon><Document /></el-icon></span>
                <div>
                  <h2 class="section-title">日志设置</h2>
                  <p class="section-desc">运行日志输出与持久化</p>
                </div>
              </div>
            </div>
            <div class="section-body">
              <div class="switch-cards">
                <div class="switch-card" :class="{ active: formData.open_log }">
                  <div class="switch-card-text">
                    <span class="switch-card-title">开启日志</span>
                    <span class="switch-card-desc">在界面与控制台输出运行信息</span>
                  </div>
                  <el-switch v-model="formData.open_log" />
                </div>
                <div
                  class="switch-card"
                  :class="{ active: formData.save_log, disabled: !formData.open_log }"
                >
                  <div class="switch-card-text">
                    <span class="switch-card-title">保存日志</span>
                    <span class="switch-card-desc">写入 logs/runLog，需先开启日志</span>
                  </div>
                  <el-switch v-model="formData.save_log" :disabled="!formData.open_log" />
                </div>
              </div>
              <p class="section-footnote">
                修改后需重启框架生效。运行日志页可「合并今日文件日志」与打开日志目录。
                <el-tooltip
                  content="开启之后，会把运行日志保存到logs/runLog下&#10;如果需要开启的话，需要先打开[开启日志]才能生效"
                  placement="top"
                >
                  <el-icon class="inline-help"><QuestionFilled /></el-icon>
                </el-tooltip>
              </p>
              <div class="log-dir-actions">
                <el-button size="small" plain @click="openLogDirectory">打开日志目录</el-button>
                <code v-if="logDirectoryPath" class="log-dir-path">{{ logDirectoryPath }}</code>
              </div>
            </div>
          </div>
        </section>

        <!-- Appearance -->
        <section :id="sectionDomId('appearance')" class="settings-section">
          <div class="section-card">
            <div class="section-head">
              <div class="section-head-left">
                <span class="section-icon"><el-icon><Sunny /></el-icon></span>
                <div>
                  <h2 class="section-title">外观</h2>
                  <p class="section-desc">界面明暗主题</p>
                </div>
              </div>
            </div>
            <div class="section-body">
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
          </div>
        </section>

        <!-- Window -->
        <section :id="sectionDomId('window')" class="settings-section">
          <div class="section-card">
            <div class="section-head">
              <div class="section-head-left">
                <span class="section-icon"><el-icon><Monitor /></el-icon></span>
                <div>
                  <h2 class="section-title">窗口与关闭</h2>
                  <p class="section-desc">点击右上角关闭按钮时的行为</p>
                </div>
              </div>
              <el-tooltip
                content="保存后立即生效，无需重启。选择「直接退出」将跳过确认框。"
                placement="top"
              >
                <button type="button" class="help-btn" aria-label="帮助"><el-icon><QuestionFilled /></el-icon></button>
              </el-tooltip>
            </div>
            <div class="section-body">
              <div class="option-cards">
                <button
                  type="button"
                  class="option-card"
                  :class="{ selected: formData.window_close_action === 'ask' }"
                  @click="formData.window_close_action = 'ask'"
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
                  @click="formData.window_close_action = 'tray'"
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
                  @click="formData.window_close_action = 'quit'"
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
                    检测到上次关窗时勾选了「不再提醒」，将一直按记忆中的操作执行。若要改回弹框或切换行为，可清除记忆，或选上方选项后保存。
                  </p>
                  <el-button type="warning" plain size="small" @click="clearStoredCloseConfirm">
                    清除「不再提醒」记忆
                  </el-button>
                </div>
              </Transition>
            </div>
          </div>
        </section>

        <!-- Update -->
        <section :id="sectionDomId('update')" class="settings-section settings-section-last">
          <div class="section-card">
            <div class="section-head">
              <div class="section-head-left">
                <span class="section-icon"><el-icon><Refresh /></el-icon></span>
                <div>
                  <h2 class="section-title">更新设置</h2>
                  <p class="section-desc">版本检查与自动更新</p>
                </div>
              </div>
            </div>
            <div class="section-body">
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
                  active-text="启动时自动检查更新"
                  :disabled="!isElectronAvailable"
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
          </div>
        </section>
      </main>
    </div>

    <footer class="settings-footer" :class="{ 'is-dirty': isDirty, 'is-saving': saving }">
      <p class="footer-status">
        <span v-if="saving">正在保存…</span>
        <span v-else-if="isDirty">有未保存的更改</span>
        <span v-else class="footer-status-ok">配置已同步</span>
      </p>
      <el-button
        type="primary"
        size="large"
        class="save-btn"
        :class="{ pulse: isDirty && !saving }"
        @click="handleSave"
        :loading="saving"
      >
        保存修改
      </el-button>
    </footer>
  </div>
</template>


<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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
import { DEFAULT_WECOM_VERSION, isWecomVersionConfigured } from '../utils/wecomVersion'

const configStore = useConfigStore()
const setThemeModeGlobal = inject('setThemeMode', null)
const saving = ref(false)
const isDirty = ref(false)
const skipDirtyWatch = ref(false)
const activeSection = ref('http')
const mainScrollRef = ref(null)
const sectionExpanded = reactive({ api: true })
const themeMode = ref(getStoredThemeMode())
const logDirectoryPath = ref('')
const wecomVersionOptions = ref([])
const wecomRegistryHint = ref('')

async function loadWecomRegistryHint() {
  if (!window.electronAPI?.getWecomRegistryInfo) return
  try {
    const reg = await window.electronAPI.getWecomRegistryInfo()
    if (reg?.executable) {
      wecomRegistryHint.value = `注册表当前默认：${reg.version || '未知版本'} · ${reg.executable}`
    } else {
      wecomRegistryHint.value = ''
    }
  } catch {
    wecomRegistryHint.value = ''
  }
}

async function loadWecomVersionOptions() {
  if (!window.electronAPI?.getWecomVersionOptions) {
    wecomVersionOptions.value = [
      { id: 'v4', label: '企微 v4', available: true },
      { id: 'v5', label: '企微 v5', available: false }
    ]
    return
  }
  const res = await window.electronAPI.getWecomVersionOptions()
  wecomVersionOptions.value = Array.isArray(res?.options) ? res.options : []
}

const navSections = [
  { id: 'http', label: 'HTTP', icon: Connection },
  { id: 'wecom', label: '企微版本', icon: ChatLineRound },
  { id: 'api', label: '接口调试', icon: Promotion },
  { id: 'logs', label: '日志', icon: Document },
  { id: 'appearance', label: '外观', icon: Sunny },
  { id: 'window', label: '窗口', icon: Monitor },
  { id: 'update', label: '更新', icon: Refresh }
]

let sectionObserver = null

function sectionDomId(id) {
  return `settings-section-${id}`
}

function scrollToSection(id) {
  activeSection.value = id
  document.getElementById(sectionDomId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function toggleSection(id) {
  sectionExpanded[id] = !sectionExpanded[id]
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

async function openLogDirectory() {
  if (!window.electronAPI?.openLogDirectory) {
    ElMessage.warning('当前环境无法打开日志目录')
    return
  }
  const res = await window.electronAPI.openLogDirectory()
  if (res?.path) logDirectoryPath.value = res.path
  if (!res?.success && res?.error) {
    ElMessage.warning(res.error)
  }
}

function setupSectionObserver() {
  sectionObserver?.disconnect()
  const elements = navSections
    .map((s) => document.getElementById(sectionDomId(s.id)))
    .filter(Boolean)
  if (!elements.length) return

  const root = mainScrollRef.value || null
  sectionObserver = new IntersectionObserver(
    (entries) => {
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
  callback_encrypt: false,
  callback_encrypt_key: '',
  wecom_version: DEFAULT_WECOM_VERSION,
  wecom_exe_path_v4: '',
  wecom_exe_path_v5: '',
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
  skipDirtyWatch.value = true
  const config = configStore.config
  formData.server_port = config.sys?.server_port || DEFAULT_SERVER_PORT_STRING
  formData.callback = config.sys?.callback || ''
  formData.callback_encrypt =
    config.sys?.callback_encrypt === 'true' || config.sys?.callback_encrypt === true
  formData.callback_encrypt_key = String(config.sys?.callback_encrypt_key || '').trim()
  formData.wecom_version = isWecomVersionConfigured(config.sys?.wecom_version)
    ? config.sys.wecom_version
    : DEFAULT_WECOM_VERSION
  formData.wecom_exe_path_v4 = config.sys?.wecom_exe_path_v4 || ''
  formData.wecom_exe_path_v5 = config.sys?.wecom_exe_path_v5 || ''
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
  skipDirtyWatch.value = false
  isDirty.value = false
}

watch(
  formData,
  () => {
    if (skipDirtyWatch.value) return
    isDirty.value = true
  },
  { deep: true }
)

watch(
  () => formData.open_log,
  (open) => {
    if (!open) formData.save_log = false
  }
)

watch(
  () => formData.callback_encrypt,
  (on) => {
    if (skipDirtyWatch.value) return
    if (on && !isValidCallbackEncryptKey(formData.callback_encrypt_key)) {
      formData.callback_encrypt_key = generateCallbackEncryptKey()
    }
  }
)

function generateCallbackEncryptKey() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function isValidCallbackEncryptKey(raw) {
  return /^[0-9a-fA-F]{64}$/.test(String(raw || '').trim())
}

const decryptSampleText = `{
  "encrypted": true,
  "alg": "AES-256-GCM",
  "iv": "<Base64>",
  "tag": "<Base64>",
  "ciphertext": "<Base64>"
}`

const NODE_DECRYPT_SNIPPET = `const crypto = require('crypto')

function decryptCallback(body, keyHex) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyHex, 'hex'),
    Buffer.from(body.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(body.tag, 'base64'))
  const buf = Buffer.concat([
    decipher.update(Buffer.from(body.ciphertext, 'base64')),
    decipher.final()
  ])
  return JSON.parse(buf.toString('utf8'))
}`

const PYTHON_DECRYPT_SNIPPET = `import json, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def decrypt_callback(body: dict, key_hex: str) -> dict:
    key = bytes.fromhex(key_hex)
    iv = base64.b64decode(body["iv"])
    tag = base64.b64decode(body["tag"])
    ct = base64.b64decode(body["ciphertext"])
    plain = AESGCM(key).decrypt(iv, ct + tag, None)
    return json.loads(plain)`

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(okMsg)
  } catch {
    ElMessage.warning('复制失败，请手动复制')
  }
}

async function copyEncryptKey() {
  const key = String(formData.callback_encrypt_key || '').trim()
  if (!isValidCallbackEncryptKey(key)) {
    ElMessage.warning('请先生成有效密钥')
    return
  }
  await copyText(key, '密钥已复制')
}

async function regenerateEncryptKey() {
  try {
    await ElMessageBox.confirm(
      '重新生成后，旧密钥无法解密之后的推送。请同步更新你的回调服务，并点击「保存修改」。',
      '重新生成解密密钥',
      { type: 'warning', confirmButtonText: '重新生成', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  formData.callback_encrypt_key = generateCallbackEncryptKey()
  ElMessage.success('已生成新密钥，保存后生效')
}

async function copyDecryptSnippet(kind) {
  if (kind === 'python') {
    await copyText(PYTHON_DECRYPT_SNIPPET, 'Python 解密示例已复制')
    return
  }
  await copyText(NODE_DECRYPT_SNIPPET, 'Node 解密示例已复制')
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

  if (formData.callback_encrypt && !isValidCallbackEncryptKey(formData.callback_encrypt_key)) {
    ElMessage.warning('消息加密已开启，请填写有效的 64 位十六进制密钥，或点击「重新生成」')
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
        callback_encrypt: String(formData.callback_encrypt),
        callback_encrypt_key: String(formData.callback_encrypt_key || '').trim().toLowerCase(),
        wecom_version: formData.wecom_version || DEFAULT_WECOM_VERSION,
        wecom_exe_path_v4: String(formData.wecom_exe_path_v4 || '').trim(),
        wecom_exe_path_v5: String(formData.wecom_exe_path_v5 || '').trim(),
        wecom_version_selected: 'true',
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
      const listenPortChanged =
        String(oldPortBeforeSave) !== String(formData.server_port)
      if (listenPortChanged && window.electronAPI) {
        const restartRes = await window.electronAPI.restartFastAPIServer(
          parseInt(formData.server_port, 10)
        )
        if (!restartRes?.success) {
          ElMessage.error(
            `HTTP 服务未在端口 ${formData.server_port} 启动：${restartRes?.message || '未知错误'}。请检查端口是否被占用，或完全退出框架后重新打开。`
          )
          isDirty.value = false
          return
        }
      }
      isDirty.value = false
      if (listenPortChanged) {
        ElMessage.success('监听端口已切换。外部请改用新端口调用接口；已登录企微无需重新添加')
      } else {
        ElMessage.success('保存成功')
      }
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
  const hasLoaded =
    configStore.config.sys?.server_port &&
    configStore.config.sys?.callback !== undefined

  if (!hasLoaded) {
    await configStore.loadConfig()
  }
  loadConfig()
  loadWecomVersionOptions()
  loadWecomRegistryHint()
  loadAppVersion()
  setupUpdateListeners()
  themeMode.value = getStoredThemeMode()
  window.electronAPI?.getLogDirectory?.().then((res) => {
    if (res?.success) logDirectoryPath.value = res.path
  })
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
  padding: 16px 10px;
  border-right: 1px solid var(--sp-border);
  background: var(--sp-surface);
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
  padding: 20px 24px 100px;
  scroll-behavior: smooth;
}

.settings-section {
  scroll-margin-top: 12px;
  margin-bottom: 16px;
}

.settings-section-last {
  margin-bottom: 8px;
}

.section-card {
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius);
  box-shadow: var(--sp-shadow);
  overflow: hidden;
  transition: box-shadow 0.25s ease, border-color 0.25s ease;
}

.section-card:hover {
  border-color: #dce3ec;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
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
  color: #67c23a;
}

.section-title {
  margin: 0;
  font-size: 15px;
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
  padding: 20px;
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
  grid-template-columns: 108px minmax(0, 1fr);
  gap: 20px 16px;
  align-items: start;
}

.field-label {
  padding-top: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--sp-muted);
  text-align: right;
}

.field-control {
  min-width: 0;
}

.field-input {
  max-width: 280px;
}

.field-input-wide {
  max-width: 480px;
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

.wecom-registry-hint {
  color: var(--el-text-color-secondary);
}

.switch-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.switch-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--sp-border);
  border-radius: 10px;
  background: var(--sp-toolbar-bg);
  transition: border-color 0.2s, background 0.2s, transform 0.15s ease;
}

.switch-card.active {
  border-color: rgba(64, 158, 255, 0.35);
  background: var(--sp-accent-soft);
}

.switch-card.disabled {
  opacity: 0.55;
}

.switch-card-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.switch-card-title {
  font-size: 14px;
  font-weight: 500;
}

.switch-card-desc {
  font-size: 12px;
  color: var(--sp-muted);
}

.section-footnote {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--sp-muted);
}

.log-dir-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.log-dir-path {
  font-size: 11px;
  padding: 4px 8px;
  background: var(--sp-accent-soft);
  border-radius: 6px;
  word-break: break-all;
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
  border-color: #c6d4e3;
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
  border: 2px solid #c0c4cc;
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

.settings-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 24px;
  border-top: 1px solid var(--sp-border);
  background: var(--sp-footer-bg);
  backdrop-filter: blur(8px);
  transition: box-shadow 0.3s ease, border-color 0.3s ease;
}

.settings-footer.is-dirty {
  border-top-color: #fde68a;
  box-shadow: 0 -4px 20px rgba(245, 158, 11, 0.08);
}

.footer-status {
  margin: 0;
  font-size: 13px;
  color: var(--sp-muted);
}

.footer-status-ok {
  color: #67c23a;
}

.save-btn.pulse:not(.is-loading) {
  animation: save-pulse 2s ease-in-out infinite;
}

/* API test (preserved layout) */
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

@media (max-width: 960px) {
  .settings-body {
    flex-direction: column;
  }

  .settings-nav {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--sp-border);
    padding: 10px 16px;
    overflow-x: auto;
  }

  .nav-list {
    flex-direction: row;
    position: static;
    gap: 6px;
  }

  .nav-item {
    flex-shrink: 0;
    padding: 8px 12px;
  }

  .nav-indicator {
    display: none;
  }

  .option-cards {
    grid-template-columns: 1fr;
  }

  .api-test-split {
    grid-template-columns: 1fr;
  }

  .field-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .field-label {
    text-align: left;
    padding-top: 0;
  }
}

@media (max-width: 640px) {
  .settings-main,
  .settings-footer {
    padding-left: 16px;
    padding-right: 16px;
  }

  .settings-footer {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
  }

  .save-btn {
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
</style>

