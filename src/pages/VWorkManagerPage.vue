<template>
  <div
    class="page-shell vwork-manager-page"
    @contextmenu="handleTableBlankContextMenu"
  >
    <div class="page-body">
      <div class="section-card">
        <div class="section-toolbar">
          <span class="toolbar-hint">在表格空白处或行上<strong>右键</strong>：添加企微、刷新授权、设置标签等</span>
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
            <el-table-column prop="nick_name" label="昵称" width="150" align="center" />
            <el-table-column prop="user_id" label="ID" width="200" align="center" show-overflow-tooltip />
            <el-table-column prop="port" label="HTTP端口" width="120" align="center" />
            <el-table-column prop="pid" label="PID" width="100" align="center" />
            <el-table-column prop="expire" label="授权到期时间" width="180" align="center" />
            <el-table-column prop="label" label="标签" align="center" min-width="120" />
          </el-table>
        </div>
      </div>
    </div>

    <!-- 添加企微对话框 -->
    <el-dialog
      v-model="showAddDialog"
      title="添加企微（指定端口）"
      width="400px"
    >
      <el-input
        v-model="customPort"
        placeholder="请输入端口号(1024-10000)"
      />
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleAddWechat">确定</el-button>
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
        @click.stop="toggleSubMenu"
      >
        添加企微
        <span class="submenu-arrow">▶</span>
        <!-- 子菜单 -->
        <div 
          v-if="showSubMenu"
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
      <div class="context-menu-divider"></div>
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
import { ref, computed, onMounted, onUnmounted, nextTick, defineExpose, inject, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  isAuthFetchFailedExpire,
  resolveExpireAfterAuthFetch
} from '../utils/authExpire'
import { useConfigStore } from '../stores/config'
import { VWorkApi } from '../utils/api'
import { DEFAULT_SERVER_PORT_STRING } from '../utils/constants'
import { confirmLoggedIn } from '../utils/loginStatusRetry'
import { pickPersonalRecord } from '../utils/personalInfo'

const configStore = useConfigStore()
/** 来自 App.vue：HTTP /api/other/start-wecom 成功后的端口队列 */
const wecomApiInjectPorts = inject('wecomApiInjectPorts', ref([]))
const tableData = ref([])
const selectedRow = ref(null)
const showAddDialog = ref(false)
const customPort = ref('')
const showTagDialog = ref(false)
const tagValue = ref('')
const selectedRowIndex = ref(-1)
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const showSubMenu = ref(false)
/** 避免同一端口重复启动登录轮询 */
const loginPollingPorts = new Set()
/** 用户主动添加、尚未写入配置的端口（用于恢复表格） */
const PENDING_PORTS_KEY = 'vwork_pending_wecom_ports'
/** 每次应用会话仅做一次启动清理，避免 HMR/重复挂载误删刚添加的企微 */
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
// 注入 key 由主进程在 read-config 中从 defaults 注入，见 electron/configs/defaults.js
const injectKey = computed(() => configStore.config.sys?.inject_key || '')

/** 已请求关闭自动更新的企微端口，避免 completePortLogin 重复触发时打两次 */
const autoUpdateOffRequestedPorts = new Set()

/**
 * 新实例登录并写入配置后，默认调用框架接口关闭企微端自动更新（POST /api/settings/auto-update，state=0）
 */
async function invokeDefaultAutoUpdateOff(wecomHttpPort) {
  const p = parseInt(String(wecomHttpPort), 10)
  if (Number.isNaN(p) || p < 1) {
    console.warn('[auto-update] 跳过：企微端口无效', { wecomHttpPort })
    return
  }
  if (autoUpdateOffRequestedPorts.has(p)) {
    return
  }
  autoUpdateOffRequestedPorts.add(p)
  if (!window.electronAPI?.callAPI) {
    console.warn('[auto-update] 跳过：electronAPI.callAPI 不可用')
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
    console.warn('[auto-update] 读取监听端口失败，使用本地缓存:', e)
    sp = parseInt(String(serverPort.value || DEFAULT_SERVER_PORT_STRING).trim(), 10)
  }

  if (Number.isNaN(sp) || sp <= 1024 || sp > 10000) {
    console.warn('[auto-update] 跳过：框架监听端口无效，请检查 ini 中 sys.server_port（有效区间 1025～10000）', {
      parsed: sp
    })
    return
  }

  const url = `http://127.0.0.1:${sp}/api/settings/auto-update`
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
    if (!result?.success) {
      console.warn('[auto-update] 调用失败:', result?.msg || result)
    } else {
      console.info('[auto-update] 已请求关闭企微自动更新（成功）', { listenPort: sp, wecomPort: p, response: result?.data })
    }
  } catch (e) {
    console.warn('[auto-update] 调用异常:', e?.message || e)
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
  return false
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

  for (const item of snapshotList) {
    if (!item.port) {
      remainList.push(item)
      continue
    }

    const port = parseInt(item.port, 10)
    if (!port || Number.isNaN(port)) continue

    if (pendingPorts.has(port) || loginPollingPorts.has(port)) {
      console.info(`[启动清理] 端口 ${port} 正在登录中，跳过清理`)
      remainList.push(item)
      continue
    }

    const row = tableData.value.find((r) => r.port === String(port))
    if (row?.nick_name === '登录中') {
      console.info(`[启动清理] 端口 ${port} 表格状态为登录中，跳过清理`)
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
      console.warn(
        `端口 ${port} 暂未登录但进程/Hook 仍在，保留配置（可能正在登录或切换账号）`
      )
      remainList.push(item)
      continue
    }

    console.warn(`端口 ${port} 未登录且进程已退出，从配置中移除`)
  }

  // 清理过程中若有新登录写入配置，合并保留（避免与「添加企微」竞态导致误删）
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
    } catch (e) {
      console.error('更新配置以移除未登录进程失败:', e)
    }
  }

  sessionStorage.setItem(STARTUP_CLEANUP_DONE_KEY, '1')
}

// 检查端口是否在使用
const checkPort = async (port) => {
  if (!window.electronAPI) return false
  const result = await window.electronAPI.checkPort(parseInt(port))
  return result.inUse
}

// 添加表格项
const addTableItem = (item) => {
  const newItem = {
    nick_name: item.nick_name || '-',
    user_id: item.user_id || '-',
    port: String(item.port || '-'),
    pid: String(item.pid || '-'),
    expire: item.expire || '未授权',
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
  showSubMenu.value = false
}

// 右键菜单处理（表格空白区域）
const handleTableBlankContextMenu = (event) => {
  // 检查是否点击在表格行上
  const target = event.target
  const trElement = target.closest('tbody tr')
  
  // 如果点击在表格行上（tbody内的tr），不处理（由 row-contextmenu 处理）
  // row-contextmenu 事件会先触发并阻止事件冒泡
  if (trElement && trElement.closest('.el-table__body')) {
    return
  }
  
  // 点击在空白区域（表格外部区域或表头等）
  event.preventDefault()
  event.stopPropagation()
  
  // 清空选中行
  selectedRow.value = null
  selectedRowIndex.value = -1
  
  // 保存鼠标位置
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  
  // 显示菜单（只显示"添加企微"选项，其他项会被禁用），重置子菜单状态
  contextMenuVisible.value = true
  showSubMenu.value = false
}

// 切换子菜单显示状态
const toggleSubMenu = () => {
  showSubMenu.value = !showSubMenu.value
}

// 菜单命令处理
const handleMenuCommand = async (command) => {
  // 关闭菜单和子菜单
  contextMenuVisible.value = false
  showSubMenu.value = false
  
  switch (command) {
    case 'add-random':
      // 随机端口直接执行，不打开弹窗
      await executeAddWechat('random', null)
      break
    case 'add-custom':
      // 指定端口打开弹窗
      customPort.value = ''
      showAddDialog.value = true
      break
    case 'refresh-auth':
      await handleRefreshAuth()
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
    const subMenu = document.querySelector('.context-submenu')
    // 如果点击不在菜单内（包括子菜单），关闭菜单和子菜单
    const isClickInMenu = contextMenu && contextMenu.contains(event.target)
    const isClickInSubMenu = subMenu && subMenu.contains(event.target)
    if (!isClickInMenu && !isClickInSubMenu) {
      contextMenuVisible.value = false
      showSubMenu.value = false
    }
  }
}

// 执行添加企微的核心逻辑
const executeAddWechat = async (portType, customPortValue) => {
  let port
  if (portType === 'random') {
    // 查找可用端口
    if (window.electronAPI) {
      const result = await window.electronAPI.findAvailablePort()
      port = result.port
      if (!port) {
        ElMessage.error('未找到可用端口')
        return
      }
    } else {
      ElMessage.error('Electron API不可用')
      return
    }
  } else {
    port = parseInt(customPortValue)
    if (isNaN(port) || port <= 1024 || port > 10000) {
      ElMessage.warning('端口可用范围(1024, 10000]')
      return
    }
    const inUse = await checkPort(port)
    if (inUse) {
      ElMessage.warning(`端口 ${port} 已被系统占用，请更换其他端口`)
      return
    }
  }

  // 运行注入工具
  if (window.electronAPI) {
    try {
      const result = await window.electronAPI.runInjectTool({
        port,
        serverPort: serverPort.value,
        key: injectKey.value
      })

      if (result.success || (result.output && result.output.includes('注入成功'))) {
        ElMessage.success('企微启动成功，正在登录...')
        trackPendingPort(port)
        const rowIndex = addTableItem({ nick_name: '登录中', port: String(port) })
        checkLoginStatus(port, rowIndex)
      } else {
        ElMessage.error(result.output || '启动失败')
      }
    } catch (error) {
      ElMessage.error('启动失败: ' + error.message)
    }
  }
}

// 添加企微（从弹窗调用）
const handleAddWechat = async () => {
  await executeAddWechat('custom', customPort.value)
  showAddDialog.value = false
}

// 登录完成后写入表格与配置（按端口定位行，避免 reload 后 rowIndex 失效）
const completePortLogin = async (port, options = {}) => {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return false

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
  const data = pickPersonalRecord(personalInfo)
  if (!data?.user_id) {
    console.warn('[企微管理] 已登录但 1002 返回结构异常，无法写配置', personalInfo)
    return false
  }

  const pid = await getPidByPort(p)
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
  setTimeout(() => invokeDefaultAutoUpdateOff(p), 20000)
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
const checkLoginStatus = async (port, rowIndex) => {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return
  if (loginPollingPorts.has(p)) return
  loginPollingPorts.add(p)

  const finishPolling = () => {
    loginPollingPorts.delete(p)
  }

  const maxAttempts = 90 // 最多检查90次（3分钟，每2秒一次）
  let attempts = 0
  let consecutiveErrors = 0
  const maxConsecutiveErrors = 20 // 连续 20 次失败（约 40 秒）才判定不可用
  let loginCacheExpire = Date.now() + 180000 // 3分钟缓存
  let aliveExtendCount = 0
  const maxAliveExtend = 3 // 进程仍在时最多延长 3 次（共约 6 分钟）

  const checkInterval = setInterval(async () => {
    attempts++

    if (Date.now() > loginCacheExpire) {
      if (await isWecomProcessAlive(port)) {
        if (aliveExtendCount < maxAliveExtend) {
          aliveExtendCount++
          loginCacheExpire = Date.now() + 60000
          console.warn(`[登录轮询] 端口 ${port} 超时但进程仍在，延长等待 (${aliveExtendCount}/${maxAliveExtend})`)
          return
        }
      }
      clearInterval(checkInterval)
      finishPolling()
      ElMessage.warning('登录超时，已关闭')
      deleteTableRowByPort(port)
      untrackPendingPort(port)
      if (window.electronAPI) {
        await window.electronAPI.killProcessByPort(port)
      }
      return
    }

    try {
      const result = await VWorkApi.getLoginStatus(port)
      consecutiveErrors = 0
      if (result?.data) {
        const status = result.data.status
        const loggedIn = Number(status) === 1 || status === true
        if (loggedIn) {
          clearInterval(checkInterval)
          finishPolling()
          const ok = await completePortLogin(port, { rowIndex })
          if (!ok) {
            ElMessage.warning('已登录但未能写入企微管理，请右键刷新授权或重新添加')
          }
          return
        }
      }

      if (attempts >= maxAttempts) {
        if (await isWecomProcessAlive(port)) {
          if (aliveExtendCount < maxAliveExtend) {
            aliveExtendCount++
            attempts = 0
            loginCacheExpire = Date.now() + 60000
            console.warn(`[登录轮询] 端口 ${port} 多次未登录但进程仍在，延长等待`)
            return
          }
        }
        clearInterval(checkInterval)
        finishPolling()
        ElMessage.warning('登录超时')
        deleteTableRowByPort(port)
        untrackPendingPort(port)
        if (window.electronAPI) {
          await window.electronAPI.killProcessByPort(port)
        }
      }
    } catch (error) {
      consecutiveErrors++
      console.warn(
        `检查登录状态失败 (${consecutiveErrors}/${maxConsecutiveErrors}):`,
        error?.message || error
      )
      if (consecutiveErrors < maxConsecutiveErrors) {
        return
      }
      if (await isWecomProcessAlive(port)) {
        consecutiveErrors = 0
        console.warn(`[登录轮询] 端口 ${port} 探测失败但进程仍在，继续等待登录`)
        return
      }
      clearInterval(checkInterval)
      finishPolling()
      if (window.electronAPI) {
        await window.electronAPI.killProcessByPort(port)
      }
      deleteTableRowByPort(port)
      untrackPendingPort(port)
      ElMessage.warning(`进程${port}登录失败，已关闭`)
    }
  }, 2000)
}

// 由 HTTP 接口或主进程自动注入成功时，与「添加企微」相同：加行并开始轮询登录
const handleApiInjectPort = (port) => {
  const p = Number(port)
  if (Number.isNaN(p) || p <= 0) return
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

    console.info(`[企微管理] 恢复已登录端口 ${port} 到表格`)
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
    console.error('获取PID失败:', error)
    return null
  }
}

// 刷新授权
const handleRefreshAuth = async () => {
  if (selectedRowIndex.value < 0) return
  
  const row = tableData.value[selectedRowIndex.value]
  if (!row.user_id || row.user_id === '-') {
    ElMessage.warning('该行数据无效')
    return
  }

  await refreshAuthForRow(selectedRowIndex.value, row.user_id, row)
}

// 判断授权是否有效
const validAuthDatetime = (dateStr) => {
  try {
    if (!dateStr || dateStr === '未授权' || isAuthFetchFailedExpire(dateStr)) {
      return false
    }
    const dt = new Date(dateStr.replace(/-/g, '/'))
    const now = new Date()
    return now <= dt
  } catch (error) {
    return false
  }
}

// 刷新授权（内部方法）
const refreshAuthForRow = async (rowIndex, userId, loginInfo) => {
  try {
    if (!window.electronAPI) {
      ElMessage.error('Electron API不可用')
      return
    }

    const prevExpire =
      loginInfo?.expire ||
      tableData.value[rowIndex]?.expire ||
      configStore.getLoginInfo().find((item) => item.user_id === userId)?.expire

    const result = await window.electronAPI.getAuthInfo(userId)
    const expire = resolveExpireAfterAuthFetch(result, prevExpire)

    if (result.success && result.data?.data) {
      if (expire === '未授权') {
        ElMessage.warning(`账号 ${userId} 在授权服务器上未查到有效授权，请确认已购买/续费后再刷新`)
      }
    } else {
      ElMessage.error(result.msg || '获取授权信息失败，请检查网络或代理设置后重试')
    }
    
    updateTableItem(rowIndex, { expire })

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
    const updatedInfo = { ...loginInfo, expire }
    
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

    // 读取配置以获取日志和回调设置
    const config = configStore.config
    const openLog = config.sys?.open_log === 'true' || config.sys?.open_log === true
    const saveLog = config.sys?.save_log === 'true' || config.sys?.save_log === true
    const callback = config.sys?.callback || ''
    const validAuth = validAuthDatetime(expire)

    // 如果开启了日志，保存日志到文件
    if (openLog && saveLog) {
      try {
        await window.electronAPI.saveLogToFile(logData)
      } catch (error) {
        console.error('保存授权刷新日志失败:', error)
      }
    }

    // 如果授权有效且配置了回调地址，发送回调
    if (validAuth && callback && callback.includes('http') && callback.includes('://')) {
      try {
        // 构建回调数据（包含授权信息）
        const callbackData = {
          type: 'auth_refresh',
          user_id: userId,
          nick_name: nickName,
          port: port,
          expire: expire,
          time_stamp: Math.floor(Date.now() / 1000)
        }
        
        const callbackResult = await window.electronAPI.sendCallback(callback, callbackData)
        
        // 如果开启了日志且回调失败，记录回调失败日志
        if (openLog && !callbackResult.success) {
          const callbackLogData = {
            content: `回调发送失败: ${callbackResult.message}`,
            sys: true,
            time_stamp: Math.floor(Date.now() / 1000)
          }
          
          if (saveLog) {
            try {
              await window.electronAPI.saveLogToFile(callbackLogData)
            } catch (error) {
              console.error('保存回调失败日志失败:', error)
            }
          }
        }
      } catch (error) {
        console.error('发送授权刷新回调失败:', error)
      }
    }
  } catch (error) {
    const prevExpire =
      loginInfo?.expire ||
      tableData.value[rowIndex]?.expire ||
      configStore.getLoginInfo().find((item) => item.user_id === userId)?.expire
    ElMessage.error('获取授权信息失败: ' + (error.message || '请检查网络或代理设置后重试'))
    const expire = resolveExpireAfterAuthFetch({ success: false }, prevExpire)
    updateTableItem(rowIndex, { expire })

    const loginInfoList = configStore.getLoginInfo()
    const configIndex = loginInfoList.findIndex((item) => item.user_id === userId)
    if (configIndex >= 0) {
      loginInfoList[configIndex] = { ...loginInfoList[configIndex], expire }
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
    const port = parseInt(row.port)

    // 先尝试调用退出登录API
    try {
      if (row.user_id && row.user_id !== '-') {
        await VWorkApi.logout(port, row.user_id)
      }
    } catch (error) {
      console.error('调用退出登录API失败:', error)
    }
    
    // 杀死进程
    if (window.electronAPI) {
      const killed = await window.electronAPI.killProcessByPort(port)
      if (!killed) {
        console.warn('杀死进程失败，可能进程已不存在')
      }
    }
    
    // 从配置中移除
    const loginInfoList = configStore.getLoginInfo()
    const filtered = loginInfoList.filter(item => item.user_id !== row.user_id)
    await configStore.updateLoginInfo(filtered)
    
    deleteTableItem(selectedRowIndex.value)
    ElMessage.success('已退出微信')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('退出失败: ' + error.message)
    }
  }
}

onMounted(async () => {
  // 强制等待配置加载完成（无论配置是否已存在，都重新加载确保最新）
  if (window.electronAPI) {
    await configStore.loadConfig()
  }

  await loadLoginInfo()

  // 先恢复「登录中」/pending 端口，再启动清理，避免与「添加企微」竞态
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
              if (mayReturn || (await isWecomPortReachable(port))) {
                validRows.push(row)
              } else {
                console.log(`端口 ${port} 已不再使用，从表格中移除`)
              }
            }
          }
        } catch (error) {
          console.error(`检查端口 ${port} 状态失败:`, error)
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

.section-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sp-border);
  background: var(--sp-toolbar-bg);
}

.toolbar-hint {
  font-size: 12px;
  color: var(--sp-muted);
  line-height: 1.5;
}

.toolbar-hint strong {
  color: var(--sp-text);
  font-weight: 600;
}

.toolbar-badge {
  flex-shrink: 0;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--sp-accent);
  background: var(--sp-accent-soft);
  border: 1px solid rgba(64, 158, 255, 0.2);
  border-radius: 999px;
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
  color: #c0c4cc;
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

@media (max-width: 640px) {
  .page-body {
    padding: 12px;
  }
}
</style>

