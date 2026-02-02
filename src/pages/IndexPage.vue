<template>
  <div class="index-page">
    <div class="logo-section">
      <img src="../assets/bg.png" alt="LOGO" class="logo-img" />
      <h2 class="frame-name">{{ frameName }}</h2>
    </div>
    
    <div class="button-section">
      <el-button type="primary" size="large" @click="openDocs">开发文档</el-button>
      <el-button type="success" size="large" @click="showWechatPay">购买/续费授权</el-button>
    </div>

    <div class="statement-section">
      <p class="statement-text">{{ statement }}</p>
      <p class="version-text">当前框架版本: {{ version }}</p>
    </div>

    <!-- 微信支付二维码弹窗 -->
    <el-dialog
      v-model="showPayDialog"
      title="购买/续费授权"
      width="400px"
      center
    >
      <div class="pay-dialog-content">
        <img src="../assets/wechat_pay.png" alt="微信支付二维码" class="pay-qr-img" />
        <p class="pay-tip">请使用微信扫码支付</p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const frameName = '北极熊企微框架'
const version = ref('')
const statement = '—— 本框架仅供学习测试，请勿用于商业用途、违法内容、生成环境等 ——'
const showPayDialog = ref(false)

// 获取应用版本
const loadAppVersion = async () => {
  if (window.electronAPI) {
    try {
      version.value = await window.electronAPI.getAppVersion()
    } catch (error) {
      console.error('获取版本失败:', error)
      version.value = '未知'
    }
  } else {
    // 开发环境或非 Electron 环境，使用默认值
    version.value = '开发版'
  }
}

onMounted(() => {
  loadAppVersion()
})

const openDocs = async () => {
  if (window.electronAPI) {
    await window.electronAPI.openExternal('https://23t2z5j37i.apifox.cn')
  } else {
    window.open('https://23t2z5j37i.apifox.cn', '_blank')
  }
}

const showWechatPay = () => {
  showPayDialog.value = true
}
</script>

<style scoped>
.index-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 40px 20px;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 40px;
}

.logo-img {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  margin-bottom: 20px;
}

.frame-name {
  font-size: 32px;
  font-weight: bold;
  color: #333;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

.button-section {
  display: flex;
  gap: 20px;
  margin-bottom: 40px;
}

.button-section .el-button {
  padding: 12px 32px;
  font-size: 16px;
}

.statement-section {
  text-align: center;
}

.statement-text {
  font-size: 14px;
  font-weight: bold;
  color: #666;
  margin-bottom: 10px;
}

.version-text {
  font-size: 14px;
  color: #999;
}

.pay-dialog-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.pay-qr-img {
  width: 300px;
  height: 300px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 20px;
}

.pay-tip {
  color: #666;
  font-size: 14px;
}
</style>

