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
  </el-container>
</template>

<script setup>
import { ref, onMounted, provide } from 'vue'
import { ElMessage } from 'element-plus'
import IndexPage from './pages/IndexPage.vue'
import RunLogsPage from './pages/RunLogsPage.vue'
import VWorkManagerPage from './pages/VWorkManagerPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import { useConfigStore } from './stores/config'
import { VWorkApi } from './utils/api'
import { confirmLoggedIn } from './utils/loginStatusRetry'

const activeTab = ref('index')
const vworkManagerRef = ref(null)

/** 通过 HTTP 启动企微时主进程推送端口，由企微管理页消费（与界面添加企微一致） */
const wecomApiInjectPorts = ref([])
provide('wecomApiInjectPorts', wecomApiInjectPorts)

// 初始化配置
const configStore = useConfigStore()
configStore.loadConfig()

// 处理退出登录消息通知
const handleLogoutMessage = async (data) => {
  // 检查是否为退出登录消息
  const isLogout = data.type === 900 || 
    (data.msg && ['退出登录', 'logout', '已退出'].some(k => data.msg.includes(k)))
  
  if (!isLogout) return

  const userInfo = data.user_id || data.self_user_id || '未知用户'
  const port = data.port || data.server_port
  const portNum = port ? parseInt(port) : NaN

  // 切换企业时框架可能误推 900/退出类消息；先多次确认 1000 仍非已登录再杀进程
  if (!Number.isNaN(portNum) && portNum > 0) {
    const stillLoggedIn = await confirmLoggedIn(() => VWorkApi.getLoginStatus(portNum), {
      attempts: 5,
      intervalMs: 2000
    })
    if (stillLoggedIn) return
  }

  try {
    // 杀死进程（即使进程已经退出，这里也会尝试）
    if (!Number.isNaN(portNum) && window.electronAPI?.killProcessByPort) {
      await window.electronAPI.killProcessByPort(portNum)
    }
    
    // 从配置中移除登录信息
    const loginInfoList = configStore.getLoginInfo()
    const filtered = loginInfoList.filter(item => {
      if (userInfo !== '未知用户' && item.user_id === userInfo) return false
      if (!Number.isNaN(portNum) && parseInt(item.port) === portNum) return false
      return true
    })
    
    if (filtered.length !== loginInfoList.length) {
      await configStore.updateLoginInfo(filtered)
      // 刷新列表 - 确保组件已初始化后再调用
      if (vworkManagerRef.value) {
        await vworkManagerRef.value.refreshList?.()
      } else {
        // 如果组件还没初始化，延迟调用
        setTimeout(async () => {
          if (vworkManagerRef.value) {
            await vworkManagerRef.value.refreshList?.()
          }
        }, 100)
      }
    }
    
    // 显示通知
    const message = !Number.isNaN(portNum) 
      ? `用户 ${userInfo} 已退出登录，端口 ${port} 的进程已关闭`
      : `用户 ${userInfo} 已退出登录`
    ElMessage.warning({ message, duration: 3000, showClose: true })
  } catch (error) {
    console.error('处理退出登录消息时出错:', error)
    ElMessage.error(`处理退出登录失败: ${error.message}`)
  }
}

// 监听消息推送
onMounted(() => {
  window.electronAPI?.onFastAPIMessage?.(handleLogoutMessage)
  window.electronAPI?.onWecomInjectStarted?.((data) => {
    if (data?.port == null) return
    const p = Number(data.port)
    if (Number.isNaN(p)) return
    if (!wecomApiInjectPorts.value.includes(p)) {
      wecomApiInjectPorts.value.push(p)
    }
  })
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

