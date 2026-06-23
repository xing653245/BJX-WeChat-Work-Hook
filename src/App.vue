<template>
  <el-container class="app-container">
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
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { ElMessage } from 'element-plus'
import IndexPage from './pages/IndexPage.vue'
import RunLogsPage from './pages/RunLogsPage.vue'
import VWorkManagerPage from './pages/VWorkManagerPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import CloseConfirmDialog from './components/CloseConfirmDialog.vue'
import { getCloseConfirmAutoAction } from './utils/closeConfirmPrefs'
import { useConfigStore } from './stores/config'
import { VWorkApi } from './utils/api'
import { confirmLoggedIn } from './utils/loginStatusRetry'
import { pickPersonalRecord } from './utils/personalInfo'

const activeTab = ref('index')
const vworkManagerRef = ref(null)
const closeConfirmVisible = ref(false)

/** 取消 fastapi-message 中退出登录逻辑订阅（与其它页面监听互不干扰） */
let removeFastapiLogoutListener = null

/** 同一端口切换账号时，避免重复启动后台等待任务 */
const accountSwitchWatchers = new Map()

/** 通过 HTTP 启动企微时主进程推送端口，由企微管理页消费（与界面添加企微一致） */
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

/** 企微内切换账号：端口进程仍在，仅更新配置与表格中的账号信息 */
const watchAccountSwitchOnPort = (portNum) => {
  if (accountSwitchWatchers.has(portNum)) return
  accountSwitchWatchers.set(portNum, true)

  ;(async () => {
    try {
      const loggedIn = await confirmLoggedIn(() => VWorkApi.getLoginStatus(portNum), {
        attempts: 60,
        intervalMs: 3000
      })
      if (!loggedIn) {
        ElMessage.warning({
          message: `端口 ${portNum} 长时间未重新登录，请检查企微客户端或在企微管理中手动退出`,
          duration: 5000,
          showClose: true
        })
        return
      }

      const personalInfo = await VWorkApi.getPersonalInfo(portNum)
      const data = pickPersonalRecord(personalInfo)
      if (!data?.user_id) {
        console.warn('[切换账号] 1002 返回异常，无法更新配置', personalInfo)
        return
      }

      let pid = null
      if (window.electronAPI?.findPidByPort) {
        try {
          const result = await window.electronAPI.findPidByPort(portNum)
          pid = result > 0 ? result : null
        } catch (e) {
          console.warn('[切换账号] 获取 PID 失败:', e)
        }
      }

      const loginInfoList = configStore.getLoginInfo()
      const portStr = String(portNum)
      const index = loginInfoList.findIndex((item) => parseInt(item.port, 10) === portNum)
      const prev = index >= 0 ? loginInfoList[index] : {}
      const updated = {
        ...prev,
        nick_name: data.nick_name || prev.nick_name || '-',
        user_id: data.user_id,
        port: portStr,
        pid: pid != null ? String(pid) : prev.pid || '-'
      }

      if (index >= 0) {
        loginInfoList[index] = updated
      } else {
        loginInfoList.push(updated)
      }
      await configStore.updateLoginInfo(loginInfoList)
      await refreshManagerList({ light: true })

      ElMessage.success({
        message: `端口 ${portNum} 已切换为 ${updated.nick_name}（${data.user_id}）`,
        duration: 3000,
        showClose: true
      })
    } catch (error) {
      console.error('[切换账号] 后台更新失败:', error)
    } finally {
      accountSwitchWatchers.delete(portNum)
    }
  })()
}

// 处理退出登录消息通知
const handleLogoutMessage = async (data) => {
  // 检查是否为退出登录消息
  const isLogout = data.type === 900 || 
    (data.msg && ['退出登录', 'logout', '已退出'].some(k => data.msg.includes(k)))
  
  if (!isLogout) return

  const userInfo = data.user_id || data.self_user_id || '未知用户'
  const port = data.port || data.server_port
  const portNum = port ? parseInt(port) : NaN

  // 企微内切换账号时框架会推送 900/退出类消息，但端口进程通常仍在。
  // 不自动杀进程；后台等待该端口重新登录并更新配置。
  if (!Number.isNaN(portNum) && portNum > 0) {
    watchAccountSwitchOnPort(portNum)
    ElMessage.info({
      message: `检测到端口 ${portNum} 账号变更，进程保持运行，正在等待重新登录…`,
      duration: 4000,
      showClose: true
    })
    return
  }

  // 无端口信息时仍按原逻辑清理配置（无法做切换等待）
  try {
    const loginInfoList = configStore.getLoginInfo()
    const filtered = loginInfoList.filter((item) => {
      if (userInfo !== '未知用户' && item.user_id === userInfo) return false
      return true
    })

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
})

onUnmounted(() => {
  removeFastapiLogoutListener?.()
  removeFastapiLogoutListener = null
  window.electronAPI?.removeCloseConfirmRequestListener?.()
  window.electronAPI?.removeCrashRecoverySuspendedListener?.()
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
  height: 100vh;
  overflow: hidden;
}

.app-main {
  padding: 0;
  height: calc(100vh - 60px);
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

