import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_SERVER_PORT_STRING } from '../utils/constants'

export const useConfigStore = defineStore('config', () => {
  const config = ref({
    sys: {
      server_port: DEFAULT_SERVER_PORT_STRING,
      callback: '',
      open_log: 'true',
      save_log: 'true',
      auto_check_update: 'true',
      window_close_action: 'ask'
    },
    custom: {
      login_info: []
    }
  })

  const loading = ref(false)

  // 加载配置
  const loadConfig = async () => {
    if (!window.electronAPI) return
    
    try {
      loading.value = true
      const result = await window.electronAPI.readConfig()
      if (result) {
        config.value = result
        // 确保 custom 对象存在
        if (!config.value.custom) {
          config.value.custom = { login_info: [] }
        }
        // 解析 login_info JSON字符串
        if (config.value.custom.login_info) {
          if (typeof config.value.custom.login_info === 'string') {
            try {
              // 移除可能的引号
              let loginInfoStr = config.value.custom.login_info.trim()
              if ((loginInfoStr.startsWith('"') && loginInfoStr.endsWith('"')) ||
                  (loginInfoStr.startsWith("'") && loginInfoStr.endsWith("'"))) {
                loginInfoStr = loginInfoStr.slice(1, -1)
              }
              config.value.custom.login_info = JSON.parse(loginInfoStr)
            } catch (e) {
              console.error('解析 login_info JSON 失败:', e, '原始值:', config.value.custom.login_info)
              config.value.custom.login_info = []
            }
          }
        } else {
          config.value.custom.login_info = []
        }
      }
    } catch (error) {
      console.error('加载配置失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 保存配置
  const saveConfig = async (newConfig) => {
    if (!window.electronAPI) return { success: false, msg: 'Electron API不可用' }
    
    try {
      loading.value = true
      // 深拷贝配置，将响应式对象转换为普通对象
      const configToSave = JSON.parse(JSON.stringify(newConfig))
      if (configToSave.custom?.login_info && Array.isArray(configToSave.custom.login_info)) {
        configToSave.custom = {
          ...configToSave.custom,
          login_info: JSON.stringify(configToSave.custom.login_info)
        }
      }
      
      const result = await window.electronAPI.saveConfig(configToSave)
      if (result.success) {
        config.value = newConfig
      }
      return result
    } catch (error) {
      console.error('保存配置失败:', error)
      return { success: false, msg: error.message }
    } finally {
      loading.value = false
    }
  }

  // 获取登录信息
  const getLoginInfo = () => {
    const loginInfoStr = config.value.custom?.login_info
    if (Array.isArray(loginInfoStr)) {
      return loginInfoStr
    }
    if (typeof loginInfoStr === 'string') {
      try {
        let parsed = loginInfoStr.trim()
        // 移除可能的引号
        if ((parsed.startsWith('"') && parsed.endsWith('"')) ||
            (parsed.startsWith("'") && parsed.endsWith("'"))) {
          parsed = parsed.slice(1, -1)
        }
        return JSON.parse(parsed)
      } catch (e) {
        console.error('getLoginInfo 解析失败:', e)
        return []
      }
    }
    return []
  }

  // 更新登录信息
  const updateLoginInfo = async (loginInfo) => {
    const currentConfig = { ...config.value }
    if (!currentConfig.custom) {
      currentConfig.custom = {}
    }
    currentConfig.custom.login_info = loginInfo
    return await saveConfig(currentConfig)
  }

  return {
    config,
    loading,
    loadConfig,
    saveConfig,
    getLoginInfo,
    updateLoginInfo
  }
})

