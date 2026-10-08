<template>
  <div
    class="page-shell vwork-manager-page"
    @contextmenu="handleTableBlankContextMenu"
  >
    <div class="page-body">
      <div class="section-card">
        <div class="login-notice" role="status">
          <div class="login-notice-copy">
            <strong>右键添加企微后登录</strong>
            <span>检测运行中的企微，恢复可接入的账号；普通方式启动的企微需完全退出后，由框架添加启动。</span>
            <div v-if="discoveryNotice || unmanagedPids.length" class="unmanaged-wecom-alert" role="alert">
              <p v-if="discoveryNotice">{{ discoveryNotice }}</p>
              <p v-if="unmanagedPids.length">已发现 {{ unmanagedPids.length }} 个尚未接入的企微进程，PID：{{ unmanagedPids.join('、') }}。重新检测不会对这些进程执行注入。</p>
            </div>
          </div>
          <el-button size="small" :loading="discovering" @click="discoverRunningWecom">重新检测</el-button>
        </div>
        <div class="table-wrap">
          <el-table
            :data="tableData"
            style="width: 100%"
            height="100%"
            stripe
            highlight-current-row
            class="data-table"
            @row-contextmenu="handleContextMenu"
          >
            <template #empty>
              <div class="login-empty">
                <strong>{{ unmanagedPids.length ? '已发现企微进程，尚未接入' : '尚未添加企微' }}</strong>
                <span>{{ unmanagedPids.length ? '请在企微托盘菜单中选择退出，再在本页右键添加企微。' : '在页面空白处右键，选择「添加企微」。' }}</span>
              </div>
            </template>
            <el-table-column prop="nick_name" label="昵称" width="150" align="center" />
            <el-table-column prop="user_id" label="ID" width="200" align="center" show-overflow-tooltip />
            <el-table-column prop="port" label="HTTP端口" width="120" align="center" />
            <el-table-column prop="pid" label="PID" width="100" align="center" />
            <el-table-column prop="expire" label="授权到期时间" width="180" align="center" />
            <el-table-column
              prop="card_key"
              label="卡密"
              min-width="200"
              align="center"
              show-overflow-tooltip
            />
            <el-table-column prop="label" label="标签" align="center" min-width="120" />
          </el-table>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="showAddDialog"
      width="420px"
      align-center
      class="port-add-dialog"
      :show-close="true"
    >
      <template #header>
        <div class="port-add-head">
          <strong>添加企微</strong>
          <span>指定一个未被占用的 HTTP 端口</span>
        </div>
      </template>
      <div class="port-add-body">
        <label class="port-add-label" for="custom-wecom-port">端口号</label>
        <el-input
          id="custom-wecom-port"
          v-model="customPort"
          size="large"
          clearable
          placeholder="例如 6272"
          @keyup.enter="handleAddWechat"
        />
        <p class="port-add-hint">可用范围 1025–10000。该端口会作为这个企微实例的 HTTP 端口。</p>
      </div>
      <template #footer>
        <div class="port-add-footer">
          <el-button @click="showAddDialog = false">取消</el-button>
          <el-button type="primary" @click="handleAddWechat">确定</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 设置标签对话框 -->
    <el-dialog
      v-model="showTagDialog"
      title="设置标签"
      width="400px"
    >
      <el-input v-model="tagValue" placeholder="请输入标签" />
      <template #footer>
        <el-button @click="showTagDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSetTag">确定</el-button>
      </template>
    </el-dialog>

    <!-- 授权绑定 / 取消：卡密输入 -->
    <el-dialog
      v-model="showCardKeyDialog"
      :title="cardKeyDialogMode === 'bind' ? '授权绑定' : '授权取消'"
      width="420px"
      align-center
      destroy-on-close
      @closed="cardKeyValue = ''"
    >
      <div v-if="cardKeyDialogRow" class="card-key-dialog-body">
        <p class="card-key-account">
          账号：{{ cardKeyDialogRow.nick_name || '—' }}（{{ cardKeyDialogRow.user_id }}）
        </p>
        <el-input
          v-model="cardKeyValue"
          type="password"
          show-password
          maxlength="128"
          clearable
          placeholder="请输入卡密"
          @keyup.enter="submitCardKeyDialog"
        />
      </div>
      <template #footer>
        <el-button @click="showCardKeyDialog = false">取消</el-button>
        <el-button type="primary" :loading="cardKeySubmitting" @click="submitCardKeyDialog">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 自定义右键菜单 -->
    <div 
      v-if="contextMenuVisible"
      class="custom-context-menu"
      :style="{
        left: contextMenuPosition.x + 'px',
        top: contextMenuPosition.y + 'px'
      }"
    >
      <div
        class="context-menu-item context-menu-parent"
        @click.stop="toggleSubMenu('add')"
      >
        添加企微
        <span class="submenu-arrow">▶</span>
        <div
          v-if="activeSubMenu === 'add'"
          class="context-submenu"
          @click.stop
        >
          <div
            class="context-menu-item"
            @click="handleMenuCommand('add-random')"
          >
            随机端口
          </div>
          <div
            class="context-menu-item"
            @click="handleMenuCommand('add-custom')"
          >
            指定端口
          </div>
        </div>
      </div>
      <div 
        class="context-menu-item context-menu-parent"
        @click.stop="toggleSubMenu('auth')"
      >
        授权管理
        <span class="submenu-arrow">▶</span>
        <div 
          v-if="activeSubMenu === 'auth'"
          class="context-submenu"
          @click.stop
        >
          <div 
            class="context-menu-item" 
            :class="{ disabled: !selectedRow }"
            @click="selectedRow && handleMenuCommand('refresh-auth')"
          >
            刷新授权
          </div>
          <div 
            class="context-menu-item" 
            :class="{ disabled: !selectedRow }"
            @click="selectedRow && handleMenuCommand('auth-bind')"
          >
            授权绑定
          </div>
          <div 
            class="context-menu-item" 
            :class="{ disabled: !selectedRowHasCardKey }"
            @click="selectedRowHasCardKey && handleMenuCommand('auth-unbind')"
          >
            授权取消
          </div>
          <div 
            class="context-menu-item" 
            :class="{ disabled: !selectedRowAuthorized }"
            @click="selectedRowAuthorized && handleMenuCommand('auth-convert')"
          >
            授权迁移
          </div>
        </div>
      </div>
      <div class="context-menu-divider"></div>
      <div 
        class="context-menu-item" 
        :class="{ disabled: !selectedRow }"
        @click="selectedRow && handleMenuCommand('copy-id')"
      >
        复制ID
      </div>
      <div class="context-menu-divider"></div>
      <div 
        class="context-menu-item" 
        :class="{ disabled: !selectedRow }"
        @click="selectedRow && handleMenuCommand('set-tag')"
      >
        设置标签
      </div>
      <div 
        class="context-menu-item" 
        :class="{ disabled: !selectedRow }"
        @click="selectedRow && handleMenuCommand('exit-wechat')"
      >
        退出微信
      </div>
    </div>
  </div>
</template>

<script setup>
import { createDiagnostics } from '../utils/diagnostics.mjs'
const diagnostics = createDiagnostics('pages/VWorkManagerPage.vue')
import { createFeedback } from '../utils/feedback.mjs'
const feedback = createFeedback('pages/VWorkManagerPage.vue')

import { ref, computed, reactive, onMounted, onUnmounted, nextTick, inject, watch } from 'vue'
import { singleFlight } from '../utils/singleFlight.mjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  isAuthorizedAuthState,
  pickCardKeyFromPayload,
  resolveAuthFieldsAfterAuthFetch
} from '../utils/authExpire'
import { isValidAuthDatetime } from '../utils/authCheck'
import {
  bindAuthorization,
  convertAuthorizationByWxid,
  pickCardKeyFromConvertResult,
  unbindAuthorization
} from '../services/authBindingService'
import { useConfigStore } from '../stores/config'
import { VWorkApi } from '../utils/api'
import { DEFAULT_SERVER_PORT_STRING } from '../utils/constants'
import { confirmLoggedIn } from '../utils/loginStatusRetry'
import { pickPersonalRecord } from '../utils/personalInfo'
import { isWecomHookBodyOk } from '../utils/wecomHookBody.mjs'

const configStore = useConfigStore()
/** 来自 App.vue：企微注入成功后的端口队列 */
const wecomApiInjectPorts = inject('wecomApiInjectPorts', ref([]))
const tableData = ref([])
const discovering = ref(false)
const discoveryNotice = ref('')
const unmanagedPids = ref([])
const selectedRow = ref(null)
const showAddDialog = ref(false)
const customPort = ref('')
const showTagDialog = ref(false)
const tagValue = ref('')
const showCardKeyDialog = ref(false)
const cardKeyDialogMode = ref('bind')
const cardKeyDialogRow = ref(null)
const cardKeyValue = ref('')
const cardKeySubmitting = ref(false)
const selectedRowIndex = ref(-1)
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
/** 右键子菜单：'add' | 'auth' | null */
const activeSubMenu = ref(null)
/** 授权绑定 / 取消请求中（按 wxid） */
const authBindingLoading = reactive({})

const isRowAuthorized = (row) => {
  if (!row?.user_id || row.user_id === '-') return false
  return isAuthorizedAuthState(row.expire, row.auth_active)
}

const selectedRowAuthorized = computed(() =>
  selectedRow.value ? isRowAuthorized(selectedRow.value) : false
)

/** 避免同一端口重复启动登录轮询 */
const loginPollingPorts = new Set()
const loginPollTimers = new Map()
const autoUpdateTimers = new Map()
let disposed = false
/** 已退出的端口：阻止进行中的登录轮询把行加回来 */
const stoppedPorts = new Set()
/** 自动接入后尚未写入配置的端口（用于恢复表格） */
const PENDING_PORTS_KEY = 'vwork_pending_wecom_ports'
/** 每次应用会话仅做一次启动清理，避免 HMR/重复挂载误删正在登录的企微 */
const STARTUP_CLEANUP_DONE_KEY = 'vwork_startup_cleanup_done'

const getPendingPortSet = () => {
  try {
    return new Set(
      JSON.parse(sessionStorage.getItem(PENDING_PORTS_KEY) || '[]')
        .map(Number)
        .filter((p) => !Number.isNaN(p) && p > 0)
    )
  } catch {
    return new Set()
  }
}

const trackPendingPort = (port) => {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return
  try {
    const set = new Set(JSON.parse(sessionStorage.getItem(PENDING_PORTS_KEY) || '[]'))
    set.add(p)
    sessionStorage.setItem(PENDING_PORTS_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

const untrackPendingPort = (port) => {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return
  try {
    const set = new Set(JSON.parse(sessionStorage.getItem(PENDING_PORTS_KEY) || '[]'))
    set.delete(p)
    sessionStorage.setItem(PENDING_PORTS_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

const findRowIndexByPort = (port) =>
  tableData.value.findIndex((r) => r.port === String(port))

const ensureTableRowForPort = (port, defaults = {}) => {
  const ps = String(port)
  const existing = findRowIndexByPort(port)
  if (existing >= 0) return existing
  return addTableItem({
    nick_name: defaults.nick_name || '登录中',
    port: ps,
    ...defaults
  })
}

const deleteTableRowByPort = (port) => {
  const idx = findRowIndexByPort(port)
  if (idx >= 0) deleteTableItem(idx)
}

const serverPort = computed(() => configStore.config.sys?.server_port || DEFAULT_SERVER_PORT_STRING)

/** 已请求关闭自动更新的企微端口，避免 completePortLogin 重复触发时打两次 */
const autoUpdateOffRequestedPorts = new Set()

/**
 * 新实例登录并写入配置后，默认调用框架接口关闭企微端自动更新（POST /api，type=7000，state=0）
 */
async function invokeDefaultAutoUpdateOff(wecomHttpPort) {
  const p = parseInt(String(wecomHttpPort), 10)
  if (Number.isNaN(p) || p < 1) {
    diagnostics.warn('L001', '[auto-update] 跳过：企微端口无效', { wecomHttpPort })
    return
  }
  if (autoUpdateOffRequestedPorts.has(p)) {
    return
  }
  autoUpdateOffRequestedPorts.add(p)
  if (!window.electronAPI?.callAPI) {
    diagnostics.warn('L002', '[auto-update] 跳过：electronAPI.callAPI 不可用')
    return
  }

  let sp
  try {
    if (window.electronAPI.readConfig) {
      const cfg = await window.electronAPI.readConfig()
      const raw = cfg?.sys?.server_port ?? DEFAULT_SERVER_PORT_STRING
      sp = parseInt(String(raw).trim(), 10)
    } else {
      sp = parseInt(String(serverPort.value || DEFAULT_SERVER_PORT_STRING).trim(), 10)
    }
  } catch (e) {
    diagnostics.warn('L003', '[auto-update] 读取监听端口失败，使用本地缓存:', e)
    sp = parseInt(String(serverPort.value || DEFAULT_SERVER_PORT_STRING).trim(), 10)
  }

  if (Number.isNaN(sp) || sp <= 1024 || sp > 10000) {
    diagnostics.warn('L004', '[auto-update] 跳过：框架监听端口无效，请检查 ini 中 sys.server_port（有效区间 1025～10000）', {
      parsed: sp
    })
    return
  }

  const url = `http://127.0.0.1:${sp}/api`
  try {
    const result = await window.electronAPI.callAPI({
      url,
      method: 'POST',
      data: {
        port: p,
        state: 0,
        type: 7000
      }
    })
    const body = result?.data
    if (!result?.success || !isWecomHookBodyOk(body)) {
      diagnostics.warn('L005', '[auto-update] 调用失败:', body?.errmsg || result?.msg || result)
    } else {
      diagnostics.info('L006', '[auto-update] 已请求关闭企微自动更新（成功）', {
        listenPort: sp,
        wecomPort: p,
        response: body?.encrypted === true ? { encrypted: true } : body
      })
    }
  } catch (e) {
    diagnostics.warn('L007', '[auto-update] 调用异常:', e?.message || e)
  }
}

// 从配置加载并合并表格：保留「登录中」/轮询中的行，避免 reload 把刚添加的企微清掉
const loadLoginInfo = async () => {
  const loginInfo = configStore.getLoginInfo()
  const byPort = new Map()

  for (const row of tableData.value) {
    const port = row?.port
    if (!port || port === '-') continue
    const p = parseInt(port, 10)
    if (row.nick_name === '登录中' || loginPollingPorts.has(p)) {
      byPort.set(String(port), { ...row })
    }
  }

  for (const item of loginInfo) {
    if (!item.port) continue
    const port = String(item.port)
    byPort.set(port, {
      nick_name: item.nick_name || '-',
      user_id: item.user_id || '-',
      port,
      pid: String(item.pid || '-'),
      expire: item.expire || '未授权',
      auth_active: item.auth_active === true,
      card_key: item.card_key || '',
      label: item.label || ''
    })
  }

  tableData.value = Array.from(byPort.values())
}

/** 仅从配置重载表格，不做端口探测（避免切换账号后误删） */
const reloadLoginInfoFromConfig = async () => {
  await configStore.loadConfig()
  await loadLoginInfo()
}

/** 企微 HTTP 是否仍可访问（比 bind 探测更准确） */
const isWecomPortReachable = async (port) => {
  try {
    const result = await VWorkApi.getLoginStatus(port)
    return result?.data != null
  } catch {
    return false
  }
}

/** 进程或 Hook 是否仍在（避免登录过程中误杀企微） */
const isWecomProcessAlive = async (port) => {
  if (await isWecomPortReachable(port)) return true
  if (window.electronAPI?.isPortInUse) {
    try {
      const check = await window.electronAPI.isPortInUse(port)
      if (check?.inUse) return true
    } catch {
      /* ignore */
    }
  }
  if (window.electronAPI?.findPidByPort) {
    try {
      const pid = await window.electronAPI.findPidByPort(port)
      if (pid > 0) return true
    } catch {
      /* ignore */
    }
  }
  // 端口消失不能证明企微已退出；必须核对记录的 PID。
  const row = tableData.value.find(item => Number(item.port) === Number(port))
  const saved = configStore.getLoginInfo().find(item => Number(item.port) === Number(port))
  const pid = Number(row?.pid) > 0 ? row.pid : saved?.pid
  try {
    const state = await window.electronAPI?.getProcessState?.(pid)
    return state !== 'exited'
  } catch {
    return true // 检测失败保留条目，不能当成进程退出。
  }
}

// 启动时检查登录状态：未登录且进程已退出时才从配置移除（不主动杀仍在运行的进程）
const cleanupUnloggedOnMount = async () => {
  if (!window.electronAPI) return
  if (sessionStorage.getItem(STARTUP_CLEANUP_DONE_KEY) === '1') {
    return
  }

  const snapshotList = configStore.getLoginInfo()
  if (!Array.isArray(snapshotList) || snapshotList.length === 0) {
    sessionStorage.setItem(STARTUP_CLEANUP_DONE_KEY, '1')
    return
  }

  const pendingPorts = getPendingPortSet()
  const remainList = []
  const removedItems = []

  for (const item of snapshotList) {
    if (!item.port) {
      remainList.push(item)
      continue
    }

    const port = parseInt(item.port, 10)
    if (!port || Number.isNaN(port)) continue

    if (pendingPorts.has(port) || loginPollingPorts.has(port)) {
      diagnostics.info('L008', `[启动清理] 端口 ${port} 正在登录中，跳过清理`)
      remainList.push(item)
      continue
    }

    const row = tableData.value.find((r) => r.port === String(port))
    if (row?.nick_name === '登录中') {
      diagnostics.info('L009', `[启动清理] 端口 ${port} 表格状态为登录中，跳过清理`)
      remainList.push(item)
      continue
    }

    const ok = await confirmLoggedIn(() => VWorkApi.getLoginStatus(port), {
      attempts: 3,
      intervalMs: 1500
    })

    if (ok) {
      remainList.push(item)
      continue
    }

    if (await isWecomProcessAlive(port)) {
      diagnostics.warn('L010',
        `端口 ${port} 暂未登录但进程/Hook 仍在，保留配置（可能正在登录或切换账号）`
      )
      remainList.push(item)
      continue
    }

    diagnostics.warn('L011', `端口 ${port} 未登录且进程已退出，从配置中移除`)
    removedItems.push(item)
  }

  // 清理过程中若有新登录写入配置，合并保留，避免自动登录时被误删。
  const currentList = configStore.getLoginInfo()
  const remainPorts = new Set(
    remainList.map((item) => String(item.port)).filter((p) => p && p !== 'undefined')
  )
  for (const item of currentList) {
    if (!item?.port) continue
    const ps = String(item.port)
    if (remainPorts.has(ps)) continue
    const port = parseInt(item.port, 10)
    if (pendingPorts.has(port) || loginPollingPorts.has(port)) {
      remainList.push(item)
      remainPorts.add(ps)
    }
  }

  if (remainList.length !== snapshotList.length) {
    try {
      await configStore.updateLoginInfo(remainList)
      // 配置已清理时同步表格，否则 UI 仍显示已移除的行
      await loadLoginInfo()
      if (removedItems.length > 0) {
        const labels = removedItems.map((item) => {
          const name = item.nick_name && item.nick_name !== '-' ? item.nick_name : '未知账号'
          return `${name}（端口 ${item.port}）`
        })
        ElMessage({
          type: 'info',
          duration: 4500,
          showClose: true,
          message:
            labels.length === 1
              ? `检测到 ${labels[0]} 已退出，已从列表中移除`
              : `检测到 ${labels.length} 个企微已退出，已从列表中移除：${labels.join('、')}`
        })
      }
    } catch (e) {
      diagnostics.error('L012', '更新配置以移除未登录进程失败:', e)
    }
  }

  sessionStorage.setItem(STARTUP_CLEANUP_DONE_KEY, '1')
}

// 添加表格项
const addTableItem = (item) => {
  const newItem = {
    nick_name: item.nick_name || '-',
    user_id: item.user_id || '-',
    port: String(item.port || '-'),
    my_port: item.my_port != null && String(item.my_port).trim() !== ''
      ? String(item.my_port)
      : String(serverPort.value || ''),
    pid: String(item.pid || '-'),
    expire: item.expire || '未授权',
    auth_active: item.auth_active === true,
    card_key: item.card_key || '',
    label: item.label || ''
  }
  tableData.value.push(newItem)
  return tableData.value.length - 1 // 返回新添加项的索引
}

// 更新表格项
const updateTableItem = (index, updates) => {
  if (index >= 0 && index < tableData.value.length) {
    tableData.value[index] = { ...tableData.value[index], ...updates }
  }
}

// 删除表格项
const deleteTableItem = (index) => {
  if (index >= 0 && index < tableData.value.length) {
    tableData.value.splice(index, 1)
  }
}

// 右键菜单处理（表格行）
const handleContextMenu = (row, column, event) => {
  event.preventDefault()
  event.stopPropagation()
  
  const index = tableData.value.findIndex(item => item === row)
  selectedRow.value = row
  selectedRowIndex.value = index
  
  // 保存鼠标位置
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  
  // 显示菜单，重置子菜单状态
  contextMenuVisible.value = true
  activeSubMenu.value = null
}

const handleTableBlankContextMenu = (event) => {
  const target = event.target
  const trElement = target.closest('tbody tr')
  if (trElement && trElement.closest('.el-table__body')) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  selectedRow.value = null
  selectedRowIndex.value = -1
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  contextMenuVisible.value = true
  activeSubMenu.value = null
}

const checkPort = async (port) => {
  if (!window.electronAPI) return false
  const result = await window.electronAPI.checkPort(parseInt(port))
  return result.inUse
}

// 切换子菜单显示状态（同一时刻只展开一个）
const toggleSubMenu = (key) => {
  activeSubMenu.value = activeSubMenu.value === key ? null : key
}

// 菜单命令处理
const handleMenuCommand = async (command) => {
  contextMenuVisible.value = false
  activeSubMenu.value = null
  
  switch (command) {
    case 'add-random':
      await executeAddWechat('random', null)
      break
    case 'add-custom':
      customPort.value = ''
      showAddDialog.value = true
      break
    case 'refresh-auth':
      await handleRefreshAuth()
      break
    case 'auth-bind':
      await handleAuthBind()
      break
    case 'auth-unbind':
      await handleAuthUnbind()
      break
    case 'auth-convert':
      await handleAuthConvert()
      break
    case 'copy-id':
      handleCopyId()
      break
    case 'set-tag':
      if (selectedRow.value) {
        tagValue.value = selectedRow.value.label || ''
        showTagDialog.value = true
      }
      break
    case 'exit-wechat':
      await handleExitWechat()
      break
  }
}

// 点击外部关闭菜单
const handleClickOutside = (event) => {
  if (contextMenuVisible.value) {
    const contextMenu = document.querySelector('.custom-context-menu')
    const isClickInMenu = contextMenu && contextMenu.contains(event.target)
    if (!isClickInMenu) {
      contextMenuVisible.value = false
      activeSubMenu.value = null
    }
  }
}

/** type=900 掉线：仍登录或进程还在则保留，避免把正常企微从列表杀掉 */
const handleWecomOfflineSignal = async (port) => {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return false
  const loggedIn = await confirmLoggedIn(() => VWorkApi.getLoginStatus(p), {
    attempts: 3,
    intervalMs: 1200
  })
  if (loggedIn) {
    diagnostics.warn('L013', `[企微退出] type=900 但端口 ${p} 仍已登录，忽略`)
    return false
  }
  if (await isWecomProcessAlive(p)) {
    diagnostics.warn('L014', `[企微退出] type=900 但端口 ${p} 进程/Hook 仍在，保留列表`)
    return false
  }
  return removeWecomFromManager(p)
}

const removeWecomFromManager = async (port, options = {}) => {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return false
  stoppedPorts.add(p)
  stopLoginPolling(p)
  untrackPendingPort(p)

  const hadRow = findRowIndexByPort(p) >= 0
  if (options.terminate === true && window.electronAPI?.killProcessByPort) {
    try {
      await window.electronAPI.killProcessByPort(p)
    } catch (error) {
      diagnostics.warn('L015', `[企微退出] 结束端口 ${p} 进程失败:`, error?.message || error)
    }
  }

  deleteTableRowByPort(p)
  const loginInfoList = configStore.getLoginInfo()
  const filtered = loginInfoList.filter((item) => parseInt(item.port, 10) !== p)
  if (filtered.length !== loginInfoList.length) {
    await configStore.updateLoginInfo(filtered)
  }

  if (!options.quiet && hadRow) {
    feedback.warning('U001', `企微已退出，已从列表移除端口 ${p}`)
  }
  return true
}

const executeAddWechat = singleFlight(async (portType, customPortValue) => {
  const discovery = await discoverRunningWecom()
  if (!discovery.success || discovery.unmanagedPids.length) {
    feedback.warning('U036', discoveryNotice.value)
    return
  }
  if (discovery.recovered > 0) {
    ElMessage.success('已找到并接入正在运行的企微，请使用列表中的账号；如需新账号，请再次添加')
    return
  }
  let port
  if (portType === 'random') {
    if (!window.electronAPI) {
      feedback.error('U002', '应用通信尚未就绪，请重启框架后重试')
      return
    }
    const result = await window.electronAPI.findAvailablePort()
    port = result.port
    if (!port) {
      feedback.error('U003', '当前没有可用端口，请关闭无用实例后重试')
      return
    }
  } else {
    port = parseInt(customPortValue)
    if (isNaN(port) || port <= 1024 || port > 10000) {
      feedback.warning('U004', '端口可用范围(1024, 10000]')
      return
    }
    const inUse = await checkPort(port)
    if (inUse) {
      feedback.warning('U005', `端口 ${port} 已被系统占用，请更换其他端口`)
      return
    }
  }

  if (!window.electronAPI) return
  try {
    const result = await window.electronAPI.runInjectTool({
      port
    })
    if (result.success) {
      ElMessage.success('企微启动成功，正在登录...')
      stoppedPorts.delete(port)
      trackPendingPort(port)
      const rowIndex = ensureTableRowForPort(port)
      checkLoginStatus(port, rowIndex)
    } else {
      feedback.error('U006', {
        message: result.output || '启动失败',
        duration: 8000,
        showClose: true
      })
    }
  } catch (error) {
    feedback.error('U007', '启动失败: ' + error.message)
  }
})

const handleAddWechat = async () => {
  await executeAddWechat('custom', customPort.value)
  showAddDialog.value = false
}

// 登录完成后写入表格与配置（按端口定位行，避免 reload 后 rowIndex 失效）
const completePortLogin = async (port, options = {}) => {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0 || stoppedPorts.has(p) || disposed) return false

  let rowIndex = options.rowIndex
  if (
    rowIndex == null ||
    rowIndex < 0 ||
    rowIndex >= tableData.value.length ||
    tableData.value[rowIndex]?.port !== String(p)
  ) {
    rowIndex = ensureTableRowForPort(p)
  }

  const personalInfo = await VWorkApi.getPersonalInfo(p)
  if (stoppedPorts.has(p) || disposed) return false
  const data = pickPersonalRecord(personalInfo)
  if (!data?.user_id) {
    diagnostics.warn('L016', '[企微管理] 已登录但 1002 返回结构异常，无法写配置，请稍后重新刷新')
    return false
  }

  const pid = await getPidByPort(p)
  if (stoppedPorts.has(p) || disposed) return false
  // 异步请求期间其它行可能已被移除，重新按端口定位。
  rowIndex = ensureTableRowForPort(p)
  updateTableItem(rowIndex, {
    nick_name: data.nick_name || '-',
    user_id: data.user_id || '-',
    port: String(p),
    pid: String(pid || '-')
  })

  await refreshAuthForRow(rowIndex, data.user_id, {
    ...data,
    port: p,
    pid
  })

  untrackPendingPort(p)
  window.electronAPI?.markWecomPortLoggedIn?.(p)
  if (stoppedPorts.has(p) || disposed) return false
  clearTimeout(autoUpdateTimers.get(p))
  autoUpdateTimers.set(p, setTimeout(() => {
    autoUpdateTimers.delete(p)
    if (!disposed && !stoppedPorts.has(p)) invokeDefaultAutoUpdateOff(p)
  }, 20000))
  return true
}

/** 供 App.vue 在 900/切换账号 后同步表格（不整表 reload） */
const syncPortLogin = async (port) => {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return false
  if (loginPollingPorts.has(p)) {
    return false
  }
  const loggedIn = await confirmLoggedIn(() => VWorkApi.getLoginStatus(p), {
    attempts: 3,
    intervalMs: 1500
  })
  if (!loggedIn) return false
  return completePortLogin(p)
}

// 检查登录状态
const stopLoginPolling = (port) => {
  const p = Number(port)
  clearTimeout(autoUpdateTimers.get(p))
  autoUpdateTimers.delete(p)
  const timer = loginPollTimers.get(p)
  if (timer) {
    clearInterval(timer)
    loginPollTimers.delete(p)
  }
  loginPollingPorts.delete(p)
}

const checkLoginStatus = async (port, rowIndex) => {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return
  if (disposed) return
  if (stoppedPorts.has(p)) return
  if (loginPollingPorts.has(p)) return
  loginPollingPorts.add(p)

  const finishPolling = () => {
    if (loginPollTimers.get(p) !== checkInterval) return
    loginPollingPorts.delete(p)
    loginPollTimers.delete(p)
  }

  const maxAttempts = 90 // 最多检查90次（3分钟，每2秒一次）
  let attempts = 0
  let consecutiveErrors = 0
  const maxConsecutiveErrors = 20 // 连续 20 次失败（约 40 秒）才判定不可用
  let loginCacheExpire = Date.now() + 180000 // 3分钟缓存
  let aliveExtendCount = 0
  const maxAliveExtend = 3 // 进程仍在时最多延长 3 次（共约 6 分钟）

  const checkInterval = setInterval(singleFlight(async () => {
    if (disposed || loginPollTimers.get(p) !== checkInterval || stoppedPorts.has(p)) {
      clearInterval(checkInterval)
      finishPolling()
      return
    }
    attempts++

    if (Date.now() > loginCacheExpire) {
      const alive = await isWecomProcessAlive(port)
      if (disposed || stoppedPorts.has(p) || loginPollTimers.get(p) !== checkInterval) return
      if (alive) {
        if (aliveExtendCount < maxAliveExtend) {
          aliveExtendCount++
          loginCacheExpire = Date.now() + 60000
          diagnostics.warn('L017', `[登录轮询] 端口 ${port} 超时但进程仍在，延长等待 (${aliveExtendCount}/${maxAliveExtend})`)
          return
        }
        clearInterval(checkInterval)
        finishPolling()
        feedback.warning('U008', '暂未确认登录，已暂停检测并保留企微，请登录后刷新列表')
        return
      }
      clearInterval(checkInterval)
      finishPolling()
      feedback.warning('U009', '进程已退出，已移除登录条目')
      deleteTableRowByPort(port)
      untrackPendingPort(port)
      return
    }

    try {
      const result = await VWorkApi.getLoginStatus(port)
      if (disposed || stoppedPorts.has(p) || loginPollTimers.get(p) !== checkInterval) return
      consecutiveErrors = 0
      if (result?.data) {
        const status = result.data.status
        const loggedIn = Number(status) === 1 || status === true
        if (loggedIn) {
          clearInterval(checkInterval)
          finishPolling()
          const ok = await completePortLogin(port, { rowIndex })
          if (!ok) {
            feedback.warning('U010', '已登录但未能写入企微管理，请右键刷新授权或重新添加')
          }
          return
        }
      }

      if (attempts >= maxAttempts) {
        const alive = await isWecomProcessAlive(port)
        if (disposed || stoppedPorts.has(p) || loginPollTimers.get(p) !== checkInterval) return
        if (alive) {
          if (aliveExtendCount < maxAliveExtend) {
            aliveExtendCount++
            attempts = 0
            loginCacheExpire = Date.now() + 60000
            diagnostics.warn('L018', `[登录轮询] 端口 ${port} 多次未登录但进程仍在，延长等待`)
            return
          }
          clearInterval(checkInterval)
          finishPolling()
          feedback.warning('U011', '暂未确认登录，已暂停检测并保留企微，请登录后刷新列表')
          return
        }
        clearInterval(checkInterval)
        finishPolling()
        feedback.warning('U012', '登录等待超时，请确认企微已完成登录后刷新列表')
        deleteTableRowByPort(port)
        untrackPendingPort(port)
      }
    } catch (error) {
      consecutiveErrors++
      diagnostics.warn('L019',
        `检查登录状态失败 (${consecutiveErrors}/${maxConsecutiveErrors}):`,
        error?.message || error
      )
      if (consecutiveErrors < maxConsecutiveErrors) {
        return
      }
      const alive = await isWecomProcessAlive(port)
      if (disposed || stoppedPorts.has(p) || loginPollTimers.get(p) !== checkInterval) return
      if (alive) {
        consecutiveErrors = 0
        diagnostics.warn('L020', `[登录轮询] 端口 ${port} 探测失败但进程仍在，继续等待登录`)
        return
      }
      clearInterval(checkInterval)
      finishPolling()
      deleteTableRowByPort(port)
      untrackPendingPort(port)
      feedback.warning('U013', `企微端口 ${port} 对应进程已退出，已移除条目`)
    }
  }), 2000)
  loginPollTimers.set(p, checkInterval)
}

// 由 HTTP 接口或主进程检测到企微启动后，加行并开始轮询登录。
const handleApiInjectPort = (port) => {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return
  stoppedPorts.delete(p)
  trackPendingPort(p)
  const ps = String(p)
  const existingIndex = tableData.value.findIndex((r) => r.port === ps)
  if (existingIndex >= 0) {
    updateTableItem(existingIndex, { nick_name: '登录中' })
    checkLoginStatus(p, existingIndex)
    return
  }
  const rowIndex = addTableItem({ nick_name: '登录中', port: ps })
  checkLoginStatus(p, rowIndex)
}

/** 挂载后：Hook 已就绪但未登录的端口（如崩溃恢复注入）补开登录轮询 */
const resumePendingLoginPolling = async () => {
  for (let i = 0; i < tableData.value.length; i++) {
    const row = tableData.value[i]
    const port = parseInt(row.port, 10)
    if (!port || Number.isNaN(port)) continue
    if (loginPollingPorts.has(port)) continue

    const loggedIn = await confirmLoggedIn(() => VWorkApi.getLoginStatus(port), {
      attempts: 1,
      intervalMs: 0
    })
    if (loggedIn) {
      if (!row.user_id || row.user_id === '-') {
        await completePortLogin(port, { rowIndex: i })
      }
      continue
    }

    const hookAlive = await isWecomPortReachable(port)
    if (!hookAlive) continue

    updateTableItem(i, { nick_name: '登录中' })
    checkLoginStatus(port, i)
  }
}

/** 从操作系统发现实例，不依赖上一次保存的端口或登录回调。 */
const discoverRunningWecom = singleFlight(async () => {
  discovering.value = true
  let recovered = 0
  try {
    const result = await window.electronAPI?.discoverRunningWecom?.()
    if (!result?.success) throw new Error(result?.message || '无法检测正在运行的企微，请稍后点击重新检测')
    if (disposed) return { success: false, unmanagedPids: [] }
    unmanagedPids.value = result.unmanagedPids
    discoveryNotice.value = result.unmanagedPids.length
      ? '检测到尚未接入框架的企微。请从企微托盘菜单完全退出（仅关闭窗口不够），然后在框架中添加，避免账号重复登录。'
      : ''
    for (const item of result.instances) {
      if (disposed) break
      const existing = tableData.value.find(row => Number(row.port) === item.port)
      if (existing && Number(existing.pid) === item.pid && existing.user_id && existing.user_id !== '-') continue
      stoppedPorts.delete(item.port)
      const index = ensureTableRowForPort(item.port, { pid: String(item.pid) })
      trackPendingPort(item.port)
      recovered++
      let complete = false
      if (item.loggedIn) {
        try { complete = await completePortLogin(item.port, { rowIndex: index }) }
        catch (error) { diagnostics.warn('L038', '恢复运行中的企微账号失败，将继续检测', error) }
      }
      if (!complete) checkLoginStatus(item.port, index)
    }
    return { ...result, recovered }
  } catch (error) {
    discoveryNotice.value = error.message || '检测企微失败，请稍后重试'
    return { success: false, unmanagedPids: [], recovered }
  } finally { discovering.value = false }
})

/** 已登录但表格缺失时恢复（配置/session 中的端口） */
const recoverOrphanedLoggedInPorts = async () => {
  const portsToCheck = new Set()

  for (const item of configStore.getLoginInfo()) {
    const p = parseInt(item.port, 10)
    if (!Number.isNaN(p) && p > 0) portsToCheck.add(p)
  }
  try {
    for (const p of JSON.parse(sessionStorage.getItem(PENDING_PORTS_KEY) || '[]')) {
      const n = Number(p)
      if (!Number.isNaN(n) && n > 0) portsToCheck.add(n)
    }
  } catch {
    /* ignore */
  }

  for (const port of portsToCheck) {
    const ps = String(port)
    const row = tableData.value.find((r) => r.port === ps)
    if (row?.user_id && row.user_id !== '-') continue

    const loggedIn = await confirmLoggedIn(() => VWorkApi.getLoginStatus(port), {
      attempts: 2,
      intervalMs: 1500
    })
    if (!loggedIn) continue

    if (loginPollingPorts.has(port)) continue

    diagnostics.info('L021', `[企微管理] 恢复已登录端口 ${port} 到表格`)
    await completePortLogin(port)
  }
}

watch(
  wecomApiInjectPorts,
  (arr) => {
    if (!arr?.length) return
    const batch = [...arr]
    arr.splice(0, arr.length)
    batch.forEach((port) => handleApiInjectPort(port))
  },
  { deep: true }
)

// 获取PID
const getPidByPort = async (port) => {
  if (!window.electronAPI) return null
  try {
    const result = await window.electronAPI.findPidByPort(parseInt(port))
    return result > 0 ? result : null
  } catch (error) {
    diagnostics.error('L022', '获取PID失败:', error)
    return null
  }
}

// 刷新授权
const handleRefreshAuth = async () => {
  if (selectedRowIndex.value < 0) return
  
  const row = tableData.value[selectedRowIndex.value]
  if (!row.user_id || row.user_id === '-') {
    feedback.warning('U014', '尚未获取到该企微账号的信息，请完成登录后刷新列表')
    return
  }

  await refreshAuthForRow(selectedRowIndex.value, row.user_id, row)
}

function ensureRowAuthorizedForAction(row, actionLabel) {
  if (!row) {
    feedback.warning('U015', '请先选择一行企微')
    return false
  }
  if (!row.user_id || row.user_id === '-') {
    feedback.warning('U016', '尚未获取到该企微账号的信息，请完成登录后刷新列表')
    return false
  }
  if (!isRowAuthorized(row)) {
    feedback.warning('U017', `当前账号未授权或授权已失效，无法${actionLabel}，请先刷新授权或购买/续费`)
    return false
  }
  return true
}

function buildAuthBindingPayload(row, cardKey) {
  return {
    wxid: row.user_id,
    port: row.port,
    nickName: row.nick_name,
    cardKey: cardKey.trim()
  }
}

function pickBoundCardKey(row) {
  const fromRow = typeof row?.card_key === 'string' ? row.card_key.trim() : ''
  if (fromRow) return fromRow
  const wxid = row?.user_id
  if (!wxid || wxid === '-') return ''
  const fromConfig = configStore.getLoginInfo().find((item) => item.user_id === wxid)?.card_key
  return typeof fromConfig === 'string' ? fromConfig.trim() : ''
}

const selectedRowHasCardKey = computed(() =>
  selectedRow.value ? Boolean(pickBoundCardKey(selectedRow.value)) : false
)

const openCardKeyDialog = (mode) => {
  const row = selectedRow.value
  if (!row) {
    feedback.warning('U018', '请先选择一行企微')
    return
  }
  if (!row.user_id || row.user_id === '-') {
    feedback.warning('U019', '尚未获取到该企微账号的信息，请完成登录后刷新列表')
    return
  }

  cardKeyDialogMode.value = mode
  cardKeyDialogRow.value = row
  cardKeyValue.value = ''
  showCardKeyDialog.value = true
}

/** 绑定 / 取消授权（mode: bind | unbind） */
const runAuthBindingAction = async (row, mode, cardKey, options = {}) => {
  const key = String(cardKey || '').trim()
  if (!row || !key) {
    feedback.warning('U020', '请输入卡密')
    return false
  }

  const wxid = row.user_id
  if (authBindingLoading[wxid] || cardKeySubmitting.value) return false

  const actionLabel = mode === 'bind' ? '授权绑定' : '授权取消'
  const closeDialog = options.closeDialog !== false
  cardKeySubmitting.value = true
  authBindingLoading[wxid] = true
  try {
    const payload = buildAuthBindingPayload(row, key)
    const result =
      mode === 'bind' ? await bindAuthorization(payload) : await unbindAuthorization(payload)
    if (!result.success) {
      feedback.warning('U021', result.msg || `${actionLabel}失败`)
      return false
    }
    if (closeDialog) {
      showCardKeyDialog.value = false
    }
    ElMessage.success(result.msg || `${actionLabel}成功`)

    const nextCardKey = mode === 'bind' ? key : ''
    const rowIndex = selectedRowIndex.value
    updateTableItem(rowIndex, { card_key: nextCardKey })
    await persistRowCardKey(wxid, row, nextCardKey)
    // 解绑后必然无有效授权，刷新列表时不再弹出「未查到有效授权」提示
    await refreshAuthForRow(rowIndex, wxid, { ...row, card_key: nextCardKey }, {
      quiet: mode === 'unbind'
    })
    return true
  } catch (error) {
    diagnostics.error('L023', `[${actionLabel}] 失败:`, error)
    feedback.error('U022', error.message || `${actionLabel}失败`)
    return false
  } finally {
    cardKeySubmitting.value = false
    delete authBindingLoading[wxid]
  }
}

const submitCardKeyDialog = async () => {
  const row = cardKeyDialogRow.value
  const mode = cardKeyDialogMode.value
  if (!row) return
  await runAuthBindingAction(row, mode, cardKeyValue.value)
}

/** 将卡密写入配置 login_info，便于重启后仍显示 */
async function persistRowCardKey(wxid, row, cardKey, extra = {}) {
  const loginInfoList = configStore.getLoginInfo()
  const index = loginInfoList.findIndex((item) => item.user_id === wxid)
  const base = index >= 0 ? loginInfoList[index] : { ...row, user_id: wxid }
  const updated = { ...base, ...extra, card_key: cardKey || '' }
  if (index >= 0) {
    loginInfoList[index] = updated
  } else {
    loginInfoList.push(updated)
  }
  await configStore.updateLoginInfo(loginInfoList)
}

const handleAuthBind = () => {
  openCardKeyDialog('bind')
}

const handleAuthUnbind = async () => {
  const row = selectedRow.value
  if (!row) {
    feedback.warning('U023', '请先选择一行企微')
    return
  }
  if (!row.user_id || row.user_id === '-') {
    feedback.warning('U024', '尚未获取到该企微账号的信息，请完成登录后刷新列表')
    return
  }

  const boundCardKey = pickBoundCardKey(row)
  if (!boundCardKey) {
    feedback.warning('U025', '当前账号未绑定卡密，无法授权取消')
    return
  }

  // 已绑定卡密：直接取消，无需再输入
  await runAuthBindingAction(row, 'unbind', boundCardKey, { closeDialog: false })
}

const handleAuthConvert = async () => {
  const row = selectedRow.value
  if (!ensureRowAuthorizedForAction(row, '执行授权迁移')) return

  const wxid = row.user_id
  if (authBindingLoading[wxid]) return

  const nick = row.nick_name || wxid
  try {
    await ElMessageBox.confirm(
      `将为账号 ${nick}（${wxid}）生成新卡密：新卡密继承当前到期时间，当前授权将立即过期。是否继续？`,
      '授权迁移',
      { type: 'warning', confirmButtonText: '确定迁移', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  authBindingLoading[wxid] = true
  try {
    const result = await convertAuthorizationByWxid({ wxid, port: row.port })
    const cardKey =
      pickCardKeyFromConvertResult(result?.data) ||
      pickCardKeyFromConvertResult(result)

    if (!result?.success || !cardKey) {
      feedback.error('U026', result?.msg || '授权迁移失败')
      return
    }

    // 迁移成功后，用响应卡密自动解绑当前 wxid，使新卡密可再次绑定
    const unbindResult = await unbindAuthorization(buildAuthBindingPayload(row, cardKey))
    if (!unbindResult?.success) {
      feedback.warning('U027', unbindResult?.msg || '迁移成功，但自动解绑失败，请手动授权取消')
    }

    try {
      await navigator.clipboard.writeText(cardKey)
    } catch {
      // 剪贴板不可用时仍展示卡密
    }
    await ElMessageBox.alert(
      `新卡密：\n${cardKey}\n\n已尝试复制到剪贴板。请立即妥善保存，关闭后将无法再次查看。`,
      '授权迁移成功',
      {
        type: 'success',
        confirmButtonText: '我已保存'
      }
    )

    // 原 wxid 授权已解绑，列表先置为未授权；再静默刷新与服务器对齐
    const rowIndex = selectedRowIndex.value
    const cleared = { expire: '未授权', auth_active: false, card_key: '' }
    updateTableItem(rowIndex, cleared)
    await persistRowCardKey(wxid, row, '', cleared)
    await refreshAuthForRow(rowIndex, wxid, { ...row, ...cleared }, { quiet: true })
  } catch (error) {
    diagnostics.error('L024', '[授权迁移] 失败:', error)
    feedback.error('U028', error.message || '授权迁移失败')
  } finally {
    delete authBindingLoading[wxid]
  }
}

// 刷新授权（内部方法）
// options.quiet：解绑/迁移等预期变为未授权的场景，只更新列表不弹「未授权」提示
const refreshAuthForRow = async (rowIndex, userId, loginInfo, options = {}) => {
  const quiet = options.quiet === true
  try {
    if (!window.electronAPI) {
      feedback.error('U029', '应用通信尚未就绪，请重启框架后重试')
      return
    }

    const prevLoginInfo =
      loginInfo ||
      tableData.value[rowIndex] ||
      configStore.getLoginInfo().find((item) => item.user_id === userId) ||
      {}
    const prevExpire = prevLoginInfo.expire

    const result = await window.electronAPI.getAuthInfo(userId, prevLoginInfo.port)
    if (disposed || stoppedPorts.has(Number(prevLoginInfo.port))) return
    const { expire, auth_active: authActive, card_key: resolvedCardKey } =
      resolveAuthFieldsAfterAuthFetch(result, {
        expire: prevExpire,
        auth_active: prevLoginInfo.auth_active,
        card_key: prevLoginInfo.card_key
      })
    const cardKey =
      resolvedCardKey ||
      pickCardKeyFromPayload(result?.data) ||
      (typeof prevLoginInfo.card_key === 'string' ? prevLoginInfo.card_key : '') ||
      ''

    if (result.success && result.data?.data) {
      if (!quiet && !isAuthorizedAuthState(expire, authActive)) {
        if (authActive === false) {
          feedback.warning('U030', `账号 ${userId} 授权已停用`)
        } else if (expire === '未授权') {
          feedback.warning('U031', `账号 ${userId} 在授权服务器上未查到有效授权，请确认已购买/续费后再刷新`)
        } else {
          feedback.warning('U032', `账号 ${userId} 授权未生效，请确认后台状态后刷新`)
        }
      }
    } else if (!quiet) {
      feedback.error('U033', result.msg || '获取授权信息失败，请检查网络或代理设置后重试')
    }
    
    updateTableItem(rowIndex, { expire, auth_active: authActive, card_key: cardKey })

    const portNum = parseInt(loginInfo?.port ?? tableData.value[rowIndex]?.port, 10)
    if (
      (rowIndex < 0 || rowIndex >= tableData.value.length || !tableData.value[rowIndex]) &&
      !Number.isNaN(portNum)
    ) {
      rowIndex = ensureTableRowForPort(portNum)
    }

    // 更新配置：新登录的企微数据保存到配置中
    // 注意：这里会基于当前配置列表（已过滤掉已关闭进程）进行更新或添加
    const loginInfoList = configStore.getLoginInfo()
    const index = loginInfoList.findIndex(item => item.user_id === userId)
    const existing = index >= 0 ? loginInfoList[index] : {}
    const myPort =
      existing.my_port ||
      loginInfo?.my_port ||
      String(serverPort.value || '')
    const updatedInfo = {
      ...existing,
      ...loginInfo,
      expire,
      auth_active: authActive,
      card_key: cardKey,
      my_port: myPort
    }
    
    if (index >= 0) {
      // 如果已存在相同 user_id，更新数据（可能来自历史数据）
      loginInfoList[index] = updatedInfo
    } else {
      // 如果是新登录的企微，添加到配置中
      loginInfoList.push(updatedInfo)
    }
    
    await configStore.updateLoginInfo(loginInfoList)

    // 构建授权刷新日志数据
    const row = tableData.value[rowIndex]
    const nickName = row?.nick_name || loginInfo?.nick_name || '-'
    const port = row?.port || loginInfo?.port || '-'
    const logData = {
      content: `刷新授权: ${nickName}(${userId}) - 授权到期时间: ${expire}`,
      sys: true,
      time_stamp: Math.floor(Date.now() / 1000)
    }

    // 读取本地日志设置，授权回调由企微原生推送
    const config = configStore.config
    const openLog = config.sys?.open_log === 'true' || config.sys?.open_log === true
    const saveLog = config.sys?.save_log === 'true' || config.sys?.save_log === true

    // 如果开启了日志，保存日志到文件
    if (openLog && saveLog) {
      try {
        await window.electronAPI.saveLogToFile(logData)
      } catch (error) {
        diagnostics.error('L025', '保存授权刷新日志失败:', error)
      }
    }

  } catch (error) {
    const prevLoginInfo =
      loginInfo ||
      tableData.value[rowIndex] ||
      configStore.getLoginInfo().find((item) => item.user_id === userId) ||
      {}
    feedback.error('U034', '获取授权信息失败: ' + (error.message || '请检查网络或代理设置后重试'))
    const { expire, auth_active: authActive, card_key: cardKey } =
      resolveAuthFieldsAfterAuthFetch(
        { success: false },
        {
          expire: prevLoginInfo.expire,
          auth_active: prevLoginInfo.auth_active,
          card_key: prevLoginInfo.card_key
        }
      )
    updateTableItem(rowIndex, { expire, auth_active: authActive, card_key: cardKey || '' })

    const loginInfoList = configStore.getLoginInfo()
    const configIndex = loginInfoList.findIndex((item) => item.user_id === userId)
    if (configIndex >= 0) {
      loginInfoList[configIndex] = {
        ...loginInfoList[configIndex],
        expire,
        auth_active: authActive,
        card_key: cardKey || loginInfoList[configIndex].card_key || ''
      }
      await configStore.updateLoginInfo(loginInfoList)
    }
  }
}

// 复制ID
const handleCopyId = () => {
  if (selectedRow.value && selectedRow.value.user_id) {
    navigator.clipboard.writeText(selectedRow.value.user_id).then(() => {
      ElMessage.success('已复制到剪贴板')
    })
  }
}

// 设置标签
const handleSetTag = async () => {
  if (selectedRowIndex.value < 0) return
  
  updateTableItem(selectedRowIndex.value, { label: tagValue.value })
  showTagDialog.value = false

  // 更新配置
  const row = tableData.value[selectedRowIndex.value]
  const loginInfoList = configStore.getLoginInfo()
  const index = loginInfoList.findIndex(item => item.user_id === row.user_id)
  
  if (index >= 0) {
    loginInfoList[index].label = tagValue.value
    await configStore.updateLoginInfo(loginInfoList)
  }
}

// 退出微信
const handleExitWechat = async () => {
  if (selectedRowIndex.value < 0) return

  try {
    await ElMessageBox.confirm('确定要退出该微信吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const row = tableData.value[selectedRowIndex.value]
    const port = parseInt(row.port, 10)

    try {
      if (row.user_id && row.user_id !== '-') {
        await VWorkApi.logout(port)
      }
    } catch (error) {
      diagnostics.error('L028', '调用退出登录API失败:', error)
    }

    await removeWecomFromManager(port, { quiet: true, terminate: true })
    ElMessage.success('已退出微信')
  } catch (error) {
    if (error !== 'cancel') {
      feedback.error('U035', '退出失败: ' + error.message)
    }
  }
}

onMounted(async () => {
  // 强制等待配置加载完成（无论配置是否已存在，都重新加载确保最新）
  if (window.electronAPI) {
    await configStore.loadConfig()
  }

  await loadLoginInfo()

  await discoverRunningWecom()

  // 先恢复「登录中」/pending 端口，再启动清理，避免与自动登录竞态。
  if (wecomApiInjectPorts.value.length) {
    const batch = [...wecomApiInjectPorts.value]
    wecomApiInjectPorts.value.splice(0, wecomApiInjectPorts.value.length)
    batch.forEach((port) => handleApiInjectPort(port))
  }
  await resumePendingLoginPolling()

  if (window.electronAPI) {
    await cleanupUnloggedOnMount()
  }

  // 确保表格渲染
  await nextTick()

  await recoverOrphanedLoggedInPorts()
  
  // 添加点击外部关闭菜单的监听
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('contextmenu', handleClickOutside)
})

onUnmounted(() => {
  disposed = true
  for (const timer of loginPollTimers.values()) clearInterval(timer)
  loginPollTimers.clear()
  loginPollingPorts.clear()
  for (const timer of autoUpdateTimers.values()) clearTimeout(timer)
  autoUpdateTimers.clear()
  // 移除监听
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('contextmenu', handleClickOutside)
})

// 暴露刷新列表方法，供父组件调用
const refreshList = async () => {
  // 重新加载配置
  await configStore.loadConfig()
  // 从配置中加载登录信息
  await loadLoginInfo()
  await discoverRunningWecom()
  
  // 验证表格中的进程是否还在运行，移除已退出的进程
  if (window.electronAPI) {
    const validRows = []
    for (let i = 0; i < tableData.value.length; i++) {
      const row = tableData.value[i]
      const port = parseInt(row.port)

      // 正在登录中的行不清理（避免登录/重启过程中被误删）
      if (row.nick_name === '登录中' || loginPollingPorts.has(port)) {
        validRows.push(row)
        continue
      }
      
      if (!isNaN(port) && port > 0) {
        try {
          // 检查端口是否还在使用
          const portCheck = await window.electronAPI.isPortInUse(port)
            if (portCheck && portCheck.inUse) {
            const ok = await confirmLoggedIn(() => VWorkApi.getLoginStatus(port), {
              attempts: 3,
              intervalMs: 2000
            })
            if (ok) {
              validRows.push(row)
            } else {
              // 端口仍在但暂未登录（如切换账号中），保留条目，不杀进程
              validRows.push(row)
            }
          } else {
            // bind 探测可能误判（企微常仅监听 127.0.0.1），用 1000 再确认
            const reachable = await isWecomPortReachable(port)
            if (reachable) {
              validRows.push(row)
            } else {
              const mayReturn = await confirmLoggedIn(() => VWorkApi.getLoginStatus(port), {
                attempts: 5,
                intervalMs: 2000
              })
              if (mayReturn || (await isWecomPortReachable(port)) || (await isWecomProcessAlive(port))) {
                validRows.push(row)
              } else {
                diagnostics.info('L029', `端口 ${port} 已不再使用，从表格中移除`)
              }
            }
          }
        } catch (error) {
          diagnostics.error('L030', `检查端口 ${port} 状态失败:`, error)
          // 检查失败时，保留该行（可能是临时网络问题）
          validRows.push(row)
        }
      } else {
        // 没有有效端口，保留该行
        validRows.push(row)
      }
    }
    
    // 更新表格数据
    if (validRows.length !== tableData.value.length) {
      tableData.value = validRows
      
      // 更新配置，移除已退出的进程
      const loginInfoList = configStore.getLoginInfo()
      const validPorts = new Set(validRows.map(row => parseInt(row.port)).filter(p => !isNaN(p) && p > 0))
      const filtered = loginInfoList.filter(item => {
        if (!item.port) return true // 保留没有端口信息的（兼容旧数据）
        const port = parseInt(item.port)
        return isNaN(port) || validPorts.has(port)
      })
      
      if (filtered.length !== loginInfoList.length) {
        await configStore.updateLoginInfo(filtered)
      }
    }
  } else {
    // 如果没有 electronAPI，只从配置加载
    await loadLoginInfo()
  }
}

defineExpose({
  refreshList,
  reloadLoginInfoFromConfig,
  syncPortLogin,
  recoverOrphanedLoggedInPorts,
  removeWecomFromManager,
  handleWecomOfflineSignal,
  /** 供调试或父组件直接触发，与 HTTP 回调等价 */
  handleInjectStartedFromApi: handleApiInjectPort
})
</script>

<style scoped>
.page-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--sp-bg);
  color: var(--sp-text);
  position: relative;
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

.login-notice {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 16px;
  padding: 14px 16px;
  border: 1px solid rgba(64, 158, 255, 0.24);
  border-radius: 12px;
  background: linear-gradient(135deg, var(--sp-accent-soft), var(--sp-surface));
}

.login-notice:has(.unmanaged-wecom-alert) {
  align-items: flex-start;
}

.login-notice:has(.unmanaged-wecom-alert) :deep(.el-button) {
  margin-top: 8px;
}

.login-notice-icon {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #fff;
  background: var(--sp-accent);
  font-size: 20px;
  font-weight: 700;
  box-shadow: 0 6px 16px rgba(64, 158, 255, 0.2);
}

.login-notice-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  color: var(--sp-muted);
  font-size: 13px;
  line-height: 1.5;
}

.login-notice-copy strong {
  color: var(--sp-text);
  font-size: 15px;
  font-weight: 700;
}

.unmanaged-wecom-alert {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  padding: 8px 10px 8px 12px;
  border: 1px solid var(--sp-warning-border);
  border-left: 3px solid #d97706;
  border-radius: 8px;
  background: var(--sp-warning-bg);
  color: #92400e;
  font-size: 12px;
  line-height: 1.55;
}

.unmanaged-wecom-alert p {
  margin: 0;
}

:global(html.dark) .unmanaged-wecom-alert {
  color: var(--sp-warning-text);
  border-left-color: #fbbf24;
}

.service-status {
  flex-shrink: 0;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--sp-accent);
  background: var(--sp-surface);
  border: 1px solid rgba(64, 158, 255, 0.24);
  border-radius: 999px;
}

.table-wrap {
  flex: 1;
  min-height: 0;
  padding: 0 8px 8px;
}

.login-empty {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--sp-muted);
}

.login-empty strong {
  color: var(--sp-text);
  font-size: 15px;
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

.custom-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 168px;
  padding: 6px 0;
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  font-size: 13px;
}

.context-menu-item {
  padding: 9px 16px;
  cursor: pointer;
  color: var(--sp-text);
  transition: background 0.15s ease, color 0.15s ease;
}

.context-menu-item:hover:not(.disabled) {
  background: var(--sp-accent-soft);
  color: var(--sp-accent);
}

.context-menu-item.disabled {
  color: var(--sp-disabled);
  cursor: not-allowed;
}

.context-menu-divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--sp-border);
}

.context-menu-parent {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.submenu-arrow {
  font-size: 10px;
  color: var(--sp-muted);
  margin-left: 8px;
}

.context-submenu {
  position: absolute;
  left: 100%;
  top: -6px;
  margin-left: 4px;
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  padding: 6px 0;
  min-width: 128px;
  z-index: 10000;
}

.card-key-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-key-account {
  margin: 0;
  font-size: 13px;
  color: var(--sp-muted);
  line-height: 1.5;
  word-break: break-all;
}

@media (max-width: 640px) {
  .page-body {
    padding: 12px;
  }

  .login-notice {
    align-items: flex-start;
    flex-wrap: wrap;
    margin: 12px;
  }

  .service-status {
    margin-left: 50px;
  }
}
</style>

<style>
.port-add-dialog.el-dialog {
  padding: 0;
  border: 1px solid var(--sp-border);
  border-radius: 14px;
  overflow: hidden;
  background: var(--sp-surface);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.16);
}

.port-add-dialog .el-dialog__header {
  margin: 0;
  padding: 18px 48px 0 20px;
}

.port-add-dialog .el-dialog__headerbtn {
  top: 14px;
  right: 14px;
  width: 28px;
  height: 28px;
  border-radius: 8px;
}

.port-add-dialog .el-dialog__headerbtn:hover {
  background: var(--sp-subtle-bg);
}

.port-add-dialog .el-dialog__body {
  padding: 16px 20px 4px;
}

.port-add-dialog .el-dialog__footer {
  padding: 12px 20px 18px;
}

.port-add-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.port-add-head strong {
  color: var(--sp-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.port-add-head span {
  color: var(--sp-muted);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
}

.port-add-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.port-add-label {
  color: var(--sp-text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.port-add-hint {
  margin: 0;
  color: var(--sp-muted);
  font-size: 12px;
  line-height: 1.5;
}

.port-add-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.port-add-footer .el-button {
  min-width: 76px;
  margin: 0;
}
</style>

