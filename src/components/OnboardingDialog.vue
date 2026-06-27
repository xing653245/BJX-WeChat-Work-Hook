<template>
  <el-dialog
    v-model="visible"
    title="欢迎使用北极熊企微框架"
    width="520px"
    align-center
    :close-on-click-modal="false"
    class="onboarding-dialog"
    @closed="onClosed"
  >
    <el-steps :active="step" finish-status="success" align-center class="onboarding-steps">
      <el-step title="概览" />
      <el-step title="设置" />
      <el-step title="企微" />
      <el-step title="日志" />
    </el-steps>

    <div class="onboarding-body">
      <template v-if="step === 0">
        <p class="onboarding-lead">本框架在本地提供 HTTP 接口，用于驱动企微自动化与消息回调。</p>
        <ul class="onboarding-list">
          <li>顶部 Tab 切换：首页 / 运行日志 / 企微管理 / 设置</li>
          <li>建议先完成基础设置，再在企微管理中添加实例</li>
        </ul>
      </template>
      <template v-else-if="step === 1">
        <p class="onboarding-lead">在「设置」中配置监听端口与回调地址。</p>
        <ul class="onboarding-list">
          <li>监听端口：调用框架 API 的地址，如 <code>http://127.0.0.1:端口/api</code></li>
          <li>修改端口后需重启框架；回调地址修改后无需重启</li>
        </ul>
      </template>
      <template v-else-if="step === 2">
        <p class="onboarding-lead">在「企微管理」表格空白处或行上<strong>右键</strong>添加企微。</p>
        <ul class="onboarding-list">
          <li>支持随机端口或指定端口启动</li>
          <li>购买授权后请右键刷新授权</li>
        </ul>
      </template>
      <template v-else>
        <p class="onboarding-lead">「运行日志」显示实时推送；开启「保存日志」后同时写入磁盘。</p>
        <ul class="onboarding-list">
          <li>可在运行日志页打开日志文件夹查看历史记录</li>
          <li>应用仅允许单实例运行，避免端口冲突</li>
        </ul>
      </template>
    </div>

    <template #footer>
      <div class="onboarding-footer">
        <el-checkbox v-model="dontShowAgain">不再显示此引导</el-checkbox>
        <div class="onboarding-actions">
          <el-button v-if="step > 0" @click="step -= 1">上一步</el-button>
          <el-button v-if="step < 3" type="primary" @click="step += 1">下一步</el-button>
          <el-button v-else type="primary" @click="finish">开始使用</el-button>
          <el-button v-if="step === 1" link type="primary" @click="goSettings">前往设置</el-button>
          <el-button v-if="step === 2" link type="primary" @click="goManager">前往企微管理</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { markOnboardingDone } from '../utils/onboarding'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'go-tab'])

const visible = ref(false)
const step = ref(0)
const dontShowAgain = ref(true)

watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
    if (v) step.value = 0
  },
  { immediate: true }
)

watch(visible, (v) => emit('update:modelValue', v))

function finish() {
  if (dontShowAgain.value) markOnboardingDone()
  visible.value = false
}

function onClosed() {
  if (dontShowAgain.value) markOnboardingDone()
}

function goSettings() {
  emit('go-tab', 'settings')
}

function goManager() {
  emit('go-tab', 'manager')
}
</script>

<style scoped>
.onboarding-steps {
  margin-bottom: 20px;
}

.onboarding-body {
  min-height: 140px;
  padding: 4px 4px 0;
}

.onboarding-lead {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--el-text-color-primary);
}

.onboarding-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--el-text-color-regular);
}

.onboarding-list code {
  font-size: 12px;
  padding: 1px 6px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.onboarding-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.onboarding-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
