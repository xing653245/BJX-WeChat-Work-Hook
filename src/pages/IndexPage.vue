<template>
  <div class="page-shell index-page">
    <main class="page-body page-body-center">
      <div class="hero-card">
        <div class="hero-brand">
          <img src="/bg.png" alt="LOGO" class="hero-logo" />
          <h2 class="hero-title">{{ frameName }}</h2>
          <p class="hero-tagline">企微自动化 · HTTP 接口 · 消息回调</p>
          <span v-if="version" class="version-badge">v{{ version }}</span>
        </div>

        <div class="hero-actions">
          <el-button type="primary" size="large" class="hero-btn" @click="openDocs">
            开发文档
          </el-button>
          <el-button type="success" size="large" class="hero-btn" @click="showWechatPay">
            购买 / 续费授权
          </el-button>
        </div>

        <div class="hero-footnote">
          <p class="statement-text">{{ statement }}</p>
        </div>
      </div>
    </main>

    <el-dialog v-model="showPayDialog" title="购买 / 续费授权" width="400px" center align-center>
      <div class="pay-dialog-content">
        <img src="../assets/wechat_pay.png" alt="微信支付二维码" class="pay-qr-img" />
        <p class="pay-tip">请使用微信扫码支付</p>
        <p class="pay-refresh-tip">购买后请务必在「企微管理」右键企微 ID 处刷新授权</p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const frameName = '北极熊企微框架'
const version = ref('')
const statement = '—— 本框架仅供学习测试，请勿用于商业用途、违法内容、生产环境等 ——'
const showPayDialog = ref(false)

const loadAppVersion = async () => {
  if (window.electronAPI) {
    try {
      version.value = await window.electronAPI.getAppVersion()
    } catch (error) {
      console.error('获取版本失败:', error)
      version.value = '未知'
    }
  } else {
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
.page-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--sp-bg);
  color: var(--sp-text);
}

.page-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
}

.page-body-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-card {
  width: min(520px, 100%);
  padding: 40px 36px 32px;
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius);
  box-shadow: var(--sp-shadow);
  text-align: center;
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}

.hero-card:hover {
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
}

.hero-brand {
  margin-bottom: 32px;
}

.hero-logo {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1);
  margin-bottom: 18px;
  transition: transform 0.3s ease;
}

.hero-card:hover .hero-logo {
  transform: scale(1.04);
}

.hero-title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--sp-text);
}

.hero-tagline {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--sp-muted);
}

.version-badge {
  display: inline-block;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--sp-accent);
  background: var(--sp-accent-soft);
  border: 1px solid rgba(64, 158, 255, 0.2);
  border-radius: 999px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-bottom: 28px;
}

.hero-btn {
  min-width: 148px;
  padding: 12px 24px;
  font-size: 15px;
  border-radius: 8px;
  transition: transform 0.15s ease;
}

.hero-btn:active {
  transform: scale(0.98);
}

.hero-footnote {
  padding-top: 20px;
  border-top: 1px dashed var(--sp-border);
}

.statement-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--sp-muted);
}

.pay-dialog-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0 4px;
}

.pay-qr-img {
  display: block;
  max-width: 100%;
  width: auto;
  height: 320px;
  object-fit: contain;
  border: 1px solid var(--sp-border);
  border-radius: 10px;
  margin-bottom: 16px;
}

.pay-tip {
  margin: 0;
  color: var(--sp-muted);
  font-size: 14px;
}

.pay-refresh-tip {
  margin: 12px 0 0;
  color: #f56c6c;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  line-height: 1.5;
}

@media (max-width: 640px) {
  .page-body {
    padding: 16px;
  }

  .hero-card {
    padding: 28px 20px 24px;
  }

  .hero-actions {
    flex-direction: column;
  }

  .hero-btn {
    width: 100%;
  }
}
</style>
