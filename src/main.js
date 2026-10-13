import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerUI } from './ui'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/shell-theme.css'
import App from './App.vue'
import { applyThemeMode, getStoredThemeMode } from './utils/theme'

// 首次渲染前应用主题，弹窗和顶栏也能立即获得正确配色。
applyThemeMode(getStoredThemeMode())
const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
registerUI(app)

app.mount('#app')

