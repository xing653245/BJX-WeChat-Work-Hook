<template>
  <el-dialog
    :model-value="modelValue"
    width="480px"
    align-center
    append-to-body
    class="wecom-version-dialog"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    destroy-on-close
  >
    <template #header>
      <div class="wvd-header">
        <h3 class="wvd-title">选择企微版本</h3>
        <p class="wvd-desc">请选择与本机企微客户端完全一致的版本，仅对应版本可成功注入；后续「添加企微」将使用该版本的注入工具。</p>
      </div>
    </template>

    <div v-loading="loading" class="wvd-body">
      <el-radio-group v-model="selectedVersion" class="wvd-radio-group">
        <el-radio
          v-for="item in versionOptions"
          :key="item.id"
          :label="item.id"
          class="wvd-radio-item"
          size="large"
          :disabled="!item.available"
        >
          <div class="wvd-radio-content">
            <span class="wvd-radio-label">{{ item.label }}</span>
            <span class="wvd-radio-hint">{{ item.description }}</span>
            <span v-if="!item.available" class="wvd-radio-warn">注入工具未安装</span>
          </div>
        </el-radio>
      </el-radio-group>
    </div>

    <template #footer>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!canConfirm"
        @click="onConfirm"
      >
        确认并保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { isWecomVersionConfigured } from '../utils/wecomVersion'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'confirmed'])

const loading = ref(false)
const saving = ref(false)
const versionOptions = ref([])
const selectedVersion = ref('v4')

const canConfirm = computed(() => {
  if (!isWecomVersionConfigured(selectedVersion.value)) return false
  const item = versionOptions.value.find((o) => o.id === selectedVersion.value)
  return item?.available === true
})

async function loadOptions() {
  if (!window.electronAPI?.getWecomVersionOptions) {
    versionOptions.value = [
      {
        id: 'v4',
        label: '企微 v4',
        description: '适用于企微客户端 4.1.36.6012，仅该版本可成功注入',
        available: true
      },
      {
        id: 'v5',
        label: '企微 v5',
        description: '适用于企微客户端 5.0.3.6005，仅该版本可成功注入',
        available: false
      }
    ]
    selectedVersion.value = 'v4'
    return
  }

  loading.value = true
  try {
    const res = await window.electronAPI.getWecomVersionOptions()
    versionOptions.value = Array.isArray(res?.options) ? res.options : []
    const firstAvailable = versionOptions.value.find((o) => o.available)
    selectedVersion.value = firstAvailable?.id || 'v4'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      loadOptions()
    }
  }
)

async function onConfirm() {
  if (!canConfirm.value) {
    ElMessage.warning('请选择已安装注入工具的企微版本')
    return
  }

  saving.value = true
  try {
    emit('confirmed', selectedVersion.value)
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.wvd-header {
  padding-right: 8px;
}

.wvd-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.wvd-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.wvd-body {
  min-height: 120px;
}

.wvd-radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.wvd-radio-item {
  display: flex;
  align-items: flex-start;
  box-sizing: border-box;
  width: 100%;
  min-height: 78px;
  height: auto;
  margin-right: 0;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.wvd-radio-item :deep(.el-radio__label) {
  flex: 1;
  width: 100%;
  white-space: normal;
  line-height: 1.4;
}

.wvd-radio-item.is-checked {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.wvd-radio-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 4px;
  min-height: 44px;
}

.wvd-radio-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.wvd-radio-hint {
  font-size: 12px;
  line-height: 1.45;
  color: var(--el-text-color-secondary);
}

.wvd-radio-warn {
  font-size: 12px;
  color: var(--el-color-warning);
}
</style>
