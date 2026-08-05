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
    <WecomVersionDialog
      v-model="showWecomVersionDialog"
      @confirmed="handleWecomVersionConfirmed"
    />
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
import WecomVersionDialog from './components/WecomVersionDialog.vue'
import { getCloseConfirmAutoAction } from './utils/closeConfirmPrefs'
import { useConfigStore } from './stores/config'
import { VWorkApi } from './utils/api'
import { confirmLoggedIn } from './utils/loginStatusRetry'
import { pickPersonalRecord } from './utils/personalInfo'
import { AUTH_FETCH_FAILED_EXPIRE, resolveAuthFieldsAfterAuthFetch } from './utils/authExpire'
import { initTheme, setThemeMode } from './utils/theme'

const TAB_STORAGE_KEY = 'vwork_active_tab'

const activeTab = ref(localStorage.getItem(TAB_STORAGE_KEY) || 'index')
const vworkManagerRef = ref(null)
const closeConfirmVisible = ref(false)
const showWecomVersionDialog = ref(false)
const isDark = ref(false)

provide('activeTab', activeTab)
provide('setThemeMode', (mode) => {
  setThemeMode(mode, (dark) => {
    isDark.value = dark
  })
})

/** 取消 fastapi-message 中退出登录逻辑订阅（与其它页面监听互不干扰） */
let removeFastapiLogoutListener = null
let removeWecomVersionRequiredListener = null

/** 同一端口切换账号时，避免重复启动后台等待任务 */
const accountSwitchWatchers = new Map()

/** 通过 HTTP 启动企微时主进程推送端口，由企微管理页消费（与界面添加企微一致） */
const wecomApiInjectPorts = ref([])
provide('wecomApiInjectPorts', wecomApiInjectPorts)

// 初始化配置
const configStore = useConfigStore()

async function ensureWecomVersionSelected() {
  await configStore.loadConfig()
  const res = await window.electronAPI?.needsWecomVersionSelection?.()
  if (res?.needed) {
    showWecomVersionDialog.value = true
  }
}

async function handleWecomVersionConfirmed(version) {
  const currentConfig = JSON.parse(JSON.stringify(configStore.config))
  currentConfig.sys = {
    ...(currentConfig.sys || {}),
    wecom_version: version,
    wecom_version_selected: 'true'
  }
  const result = await configStore.saveConfig(currentConfig)
  if (result.success) {
    ElMessage.success(`已选择 ${version === 'v5' ? '企微 v5' : '企微 v4'}，后续添加企微将使用该版本注入`)
  } else {
    ElMessage.error(result.msg || '保存企微版本失败')
    showWecomVersionDialog.value = true
  }
}

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
  window.electronAPI?.markWecomPortAccountSwitch?.(portNum)

  ;(async () => {
    try {
      const sync = vworkManagerRef.value?.syncPortLogin
      if (sync) {
        const ok = await sync(portNum)
        if (ok) {
          ElMessage.success({
            message: `端口 ${portNum} 账号信息已同步到企微管理`,
            duration: 3000,
            showClose: true
          })
        } else {
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
          }
        }
        return
      }

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
      const isSameUser = prev.user_id === data.user_id
      const prevExpireForAuth = isSameUser ? prev.expire : undefined
      const prevAuthActiveForAuth = isSameUser ? prev.auth_active : undefined
      const prevCardKeyForAuth = isSameUser ? prev.card_key || '' : ''
      const updated = {
        ...prev,
        nick_name: data.nick_name || prev.nick_name || '-',
        user_id: data.user_id,
        port: portStr,
        pid: pid != null ? String(pid) : prev.pid || '-',
        expire:
          prevExpireForAuth &&
          prevExpireForAuth !== '未授权' &&
          prevExpireForAuth !== AUTH_FETCH_FAILED_EXPIRE
            ? prevExpireForAuth
            : AUTH_FETCH_FAILED_EXPIRE,
        auth_active: prevAuthActiveForAuth === true,
        card_key: prevCardKeyForAuth
      }

      const persistUpdatedLoginInfo = async () => {
        if (index >= 0) {
          loginInfoList[index] = updated
        } else {
          const idx = loginInfoList.findIndex((item) => item.user_id === data.user_id)
          if (idx >= 0) {
            loginInfoList[idx] = updated
          } else {
            loginInfoList.push(updated)
          }
        }
        await configStore.updateLoginInfo(loginInfoList)
      }

      if (index >= 0) {
        loginInfoList[index] = updated
      } else {
        loginInfoList.push(updated)
      }
      await configStore.updateLoginInfo(loginInfoList)

      // 切换账号后重新拉取授权，避免沿用上一账号的到期时间
      if (window.electronAPI?.getAuthInfo) {
        try {
          const authResult = await window.electronAPI.getAuthInfo(data.user_id)
          const authFields = resolveAuthFieldsAfterAuthFetch(authResult, {
            expire: prevExpireForAuth,
            auth_active: prevAuthActiveForAuth,
            card_key: prevCardKeyForAuth
          })
          updated.expire = authFields.expire
          updated.auth_active = authFields.auth_active
          updated.card_key = authFields.card_key || prevCardKeyForAuth
          if (authResult.success && authResult.data?.data) {
            await persistUpdatedLoginInfo()
          } else if (!authResult.success) {
            await persistUpdatedLoginInfo()
            ElMessage.warning(
              authResult.msg || '切换账号后获取授权失败，请关闭 VPN/代理 或检查网络后右键刷新授权'
            )
          }
        } catch (e) {
          console.warn('[切换账号] 刷新授权失败:', e)
          const authFields = resolveAuthFieldsAfterAuthFetch(
            { success: false },
            {
              expire: prevExpireForAuth,
              auth_active: prevAuthActiveForAuth,
              card_key: prevCardKeyForAuth
            }
          )
          updated.expire = authFields.expire
          updated.auth_active = authFields.auth_active
          updated.card_key = authFields.card_key || prevCardKeyForAuth
          await persistUpdatedLoginInfo()
          ElMessage.warning('切换账号后获取授权失败，请关闭 VPN/代理 或检查网络后右键刷新授权')
        }
      }
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
  // 900 = 账号切换或重新登录通知，不是退出；登录成功时也会推送，绝不能删配置
  if (data.type === 900) {
    const portNum = resolveWecomPortFromMessage(data)
    if (!Number.isNaN(portNum) && portNum > 0) {
      watchAccountSwitchOnPort(portNum)
      ElMessage.info({
        message: `检测到端口 ${portNum} 账号变更，正在等待重新登录…`,
        duration: 4000,
        showClose: true
      })
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
    watchAccountSwitchOnPort(portNum)
    ElMessage.info({
      message: `检测到端口 ${portNum} 账号变更，正在等待重新登录…`,
      duration: 4000,
      showClose: true
    })
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
  ensureWecomVersionSelected()

  removeWecomVersionRequiredListener =
    window.electronAPI?.onWecomVersionRequired?.(() => {
      showWecomVersionDialog.value = true
    }) || null

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
  removeWecomVersionRequiredListener?.()
  removeWecomVersionRequiredListener = null
  window.electronAPI?.removeWecomVersionRequiredListener?.()
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

