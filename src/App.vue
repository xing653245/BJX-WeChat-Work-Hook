<template>
  <el-container class="app-container" :class="{ 'is-dark': isDark }">
    <el-main class="app-main">
      <el-tabs v-model="activeTab" type="border-card" class="main-tabs">
        <el-tab-pane label="首页" name="index">
          <IndexPage />
        </el-tab-pane>
        <el-tab-pane label="运行日志" name="logs">
          <RunLogsPage />
        </el-tab-pane>
        <el-tab-pane label="企微管理" name="manager">
          <VWorkManagerPage ref="vworkManagerRef" />
        </el-tab-pane>
        <el-tab-pane label="设置" name="settings">
          <SettingsPage />
        </el-tab-pane>
      </el-tabs>
    </el-main>
    <CloseConfirmDialog v-model="closeConfirmVisible" />
  </el-container>
</template>

<script setup>
import { ref, onMounted, onUnmounted, provide, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import IndexPage from './pages/IndexPage.vue'
import RunLogsPage from './pages/RunLogsPage.vue'
import VWorkManagerPage from './pages/VWorkManagerPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import CloseConfirmDialog from './components/CloseConfirmDialog.vue'
import { getCloseConfirmAutoAction } from './utils/closeConfirmPrefs'
import { useConfigStore } from './stores/config'
import { initTheme, setThemeMode } from './utils/theme'

const TAB_STORAGE_KEY = 'vwork_active_tab'

const activeTab = ref(localStorage.getItem(TAB_STORAGE_KEY) || 'index')
const vworkManagerRef = ref(null)
const closeConfirmVisible = ref(false)
const isDark = ref(false)

provide('activeTab', activeTab)
provide('setThemeMode', (mode) => {
  setThemeMode(mode, (dark) => {
    isDark.value = dark
  })
})

/** 取消 fastapi-message 中退出登录逻辑订阅（与其它页面监听互不干扰） */
let removeFastapiLogoutListener = null

/** 主进程检测到企微启动时推送端口，由企微管理页自动显示。 */
const wecomApiInjectPorts = ref([])
provide('wecomApiInjectPorts', wecomApiInjectPorts)

// 初始化配置
const configStore = useConfigStore()

configStore.loadConfig()

const refreshManagerList = async ({ light = false } = {}) => {
  const reload = light
    ? vworkManagerRef.value?.reloadLoginInfoFromConfig
    : vworkManagerRef.value?.refreshList
  if (reload) {
    await reload()
    return
  }
  setTimeout(async () => {
    const fn = light
      ? vworkManagerRef.value?.reloadLoginInfoFromConfig
      : vworkManagerRef.value?.refreshList
    await fn?.()
  }, 100)
}

/** 从推送消息解析企微 HTTP 端口（server_port 常为框架监听端口，不能盲用） */
const parseWecomHttpPort = (value) => {
  const n = parseInt(value, 10)
  return !Number.isNaN(n) && n > 1024 && n <= 10000 ? n : NaN
}

const resolveWecomPortFromMessage = (data) => {
  const loginInfoList = configStore.getLoginInfo()

  for (const key of ['port', 'robot_port', 'http_port', 'client_port']) {
    const n = parseWecomHttpPort(data[key])
    if (!Number.isNaN(n)) return n
  }

  const userId = data.user_id || data.self_user_id
  if (userId) {
    const item = loginInfoList.find((i) => i.user_id === userId)
    if (item?.port) {
      const n = parseWecomHttpPort(item.port)
      if (!Number.isNaN(n)) return n
    }
  }

  const serverPort = parseWecomHttpPort(data.server_port)
  if (
    !Number.isNaN(serverPort) &&
    loginInfoList.some((i) => parseWecomHttpPort(i.port) === serverPort)
  ) {
    return serverPort
  }

  if (loginInfoList.length === 1 && loginInfoList[0].port) {
    return parseWecomHttpPort(loginInfoList[0].port)
  }

  return NaN
}

// 处理退出登录 / 账号切换消息
const handleLogoutMessage = async (data) => {
  // 900 = 企微退出或账号掉线。不再等待重新登录，直接结束该端口进程并移出列表。
  if (data.type === 900) {
    const portNum = resolveWecomPortFromMessage(data)
    if (!Number.isNaN(portNum) && portNum > 0) {
      await vworkManagerRef.value?.removeWecomFromManager?.(portNum)
    }
    return
  }

  const isLogout =
    data.type === 1003 ||
    (data.msg && ['退出登录', 'logout', '已退出'].some((k) => String(data.msg).includes(k)))

  if (!isLogout) return

  const userInfo = data.user_id || data.self_user_id || '未知用户'
  const portNum = resolveWecomPortFromMessage(data)

  if (!Number.isNaN(portNum) && portNum > 0) {
    await vworkManagerRef.value?.removeWecomFromManager?.(portNum)
    return
  }

  if (userInfo === '未知用户') return

  try {
    const loginInfoList = configStore.getLoginInfo()
    const filtered = loginInfoList.filter((item) => item.user_id !== userInfo)

    if (filtered.length !== loginInfoList.length) {
      await configStore.updateLoginInfo(filtered)
      await refreshManagerList()
    }

    ElMessage.warning({
      message: `用户 ${userInfo} 已退出登录`,
      duration: 3000,
      showClose: true
    })
  } catch (error) {
    console.error('处理退出登录消息时出错:', error)
    ElMessage.error(`处理退出登录失败: ${error.message}`)
  }
}

// 监听消息推送
onMounted(() => {
  initTheme((dark) => {
    isDark.value = dark
  })

  removeFastapiLogoutListener =
    window.electronAPI?.onFastAPIMessage?.(handleLogoutMessage) || null
  window.electronAPI?.onWecomInjectStarted?.((data) => {
    if (data?.port == null) return
    const p = Number(data.port)
    if (Number.isNaN(p)) return
    if (!wecomApiInjectPorts.value.includes(p)) {
      wecomApiInjectPorts.value.push(p)
    }
  })
  window.electronAPI?.onWecomSessionEnded?.((data) => {
    const p = Number(data?.port)
    if (!p) return
    vworkManagerRef.value?.removeWecomFromManager?.(p, { quiet: true })
  })
  window.electronAPI?.onCloseConfirmRequest?.(() => {
    const auto = getCloseConfirmAutoAction()
    if (auto) {
      window.electronAPI?.respondCloseConfirm?.(auto)
      return
    }
    closeConfirmVisible.value = true
  })
  window.electronAPI?.onCrashRecoverySuspended?.((data) => {
    ElMessage.warning({
      message: data?.message || '企微反复崩溃，已暂停自动重新注入，请手动处理。',
      duration: 8000,
      showClose: true
    })
  })
  window.electronAPI?.onServiceError?.((data) => {
    ElMessageBox.alert(data?.detail || data?.message || '服务启动失败', data?.message || '服务异常', {
      type: 'error',
      confirmButtonText: '知道了'
    }).catch(() => {})
  })
})

watch(activeTab, (tab) => {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab)
  } catch {
    /* ignore */
  }
  if (tab === 'manager') {
    vworkManagerRef.value?.recoverOrphanedLoggedInPorts?.()
  }
})

onUnmounted(() => {
  removeFastapiLogoutListener?.()
  removeFastapiLogoutListener = null
  window.electronAPI?.removeWecomSessionEndedListener?.()
  window.electronAPI?.removeCloseConfirmRequestListener?.()
  window.electronAPI?.removeCrashRecoverySuspendedListener?.()
  window.electronAPI?.removeServiceErrorListener?.()
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-main {
  padding: 0;
  flex: 1;
  min-height: 0;
  height: 100%;
}

.main-tabs {
  height: 100%;
  border: none;
}

.main-tabs .el-tabs__content {
  height: calc(100% - 55px);
  overflow: auto;
}

.main-tabs .el-tab-pane {
  height: 100%;
}
</style>

