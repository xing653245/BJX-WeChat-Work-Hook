const { contextBridge, ipcRenderer } = require('electron')

/**
 * 多个订阅者共享同一个 ipc 通道；禁止对 fastapi-message 使用 removeAllListeners，
 * 否则误删其它页面（如 App 退出登录处理）的监听，也会导致运行日志收不到推送。
 */
const fastapiMessageCallbacks = new Set()
let fastapiMessageIpcWired = false

function ensureFastapiMessageIpcWired() {
  if (fastapiMessageIpcWired) return
  fastapiMessageIpcWired = true
  ipcRenderer.on('fastapi-message', (_event, data) => {
    fastapiMessageCallbacks.forEach((cb) => {
      try {
        cb(data)
      } catch (e) {
        console.error('[fastapi-message] subscriber error:', e)
      }
    })
  })
}

contextBridge.exposeInMainWorld('electronAPI', {
  // 配置相关
  readConfig: () => ipcRenderer.invoke('read-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // API调用
  callAPI: (options) => ipcRenderer.invoke('call-api', options),
  
  // 端口相关
  checkPort: (port) => ipcRenderer.invoke('check-port', port),
  findAvailablePort: (startPort) => ipcRenderer.invoke('find-available-port', startPort),
  isPortInUse: (port) => ipcRenderer.invoke('is-port-in-use', port),
  
  // 进程管理
  findPidByPort: (port) => ipcRenderer.invoke('find-pid-by-port', port),
  killProcessByPort: (port) => ipcRenderer.invoke('kill-process-by-port', port),
  
  // 注入工具
  runInjectTool: (options) => ipcRenderer.invoke('run-inject-tool', options),
  
  // 获取授权信息
  getAuthInfo: (wxid) => ipcRenderer.invoke('get-auth-info', wxid),
  
  // 打开外部链接
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // FastAPI服务器
  restartFastAPIServer: (port) => ipcRenderer.invoke('restart-fastapi-server', port),
  
  // 消息监听（用于接收FastAPI推送的消息）。返回 () => void，仅移除本次订阅。
  onFastAPIMessage: (callback) => {
    if (typeof callback !== 'function') return () => {}
    ensureFastapiMessageIpcWired()
    fastapiMessageCallbacks.add(callback)
    return () => {
      fastapiMessageCallbacks.delete(callback)
    }
  },

  // 仅清除渲染层订阅集合（不断开 ipc）；兼容旧代码，不推荐调用
  removeFastAPIMessageListener: () => {
    fastapiMessageCallbacks.clear()
  },

  // HTTP /api/other/start-wecom 启动企微成功后，主进程转发，用于企微管理表格与登录轮询
  onWecomInjectStarted: (callback) => {
    ipcRenderer.on('wecom-inject-started', (event, data) => callback(data))
  },
  removeWecomInjectStartedListener: () => {
    ipcRenderer.removeAllListeners('wecom-inject-started')
  },
  
  // 更新相关
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 更新状态监听
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data))
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (event, data) => callback(data))
  },
  
  // 移除更新监听
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-status')
    ipcRenderer.removeAllListeners('update-progress')
  },
  
  // 日志和回调相关
  saveLogToFile: (data) => ipcRenderer.invoke('save-log-to-file', data),
  sendCallback: (url, data) => ipcRenderer.invoke('send-callback', { url, data }),

  // 关闭主窗口前：主进程通知渲染层展示自定义确认框，渲染层应答
  onCloseConfirmRequest: (callback) => {
    ipcRenderer.on('close-confirm-request', () => callback())
  },
  removeCloseConfirmRequestListener: () => {
    ipcRenderer.removeAllListeners('close-confirm-request')
  },
  respondCloseConfirm: (action) => ipcRenderer.invoke('respond-close-confirm', action)
})

