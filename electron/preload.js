const { contextBridge, ipcRenderer } = require('electron')

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
  
  // 消息监听（用于接收FastAPI推送的消息）
  onFastAPIMessage: (callback) => {
    ipcRenderer.on('fastapi-message', (event, data) => callback(data))
  },
  
  // 移除消息监听
  removeFastAPIMessageListener: () => {
    ipcRenderer.removeAllListeners('fastapi-message')
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
  sendCallback: (url, data) => ipcRenderer.invoke('send-callback', { url, data })
})

