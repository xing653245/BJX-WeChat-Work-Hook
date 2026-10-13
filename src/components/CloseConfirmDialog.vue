<template>
  <el-dialog
    :model-value="modelValue"
    width="480px"
    align-center
    append-to-body
    class="close-confirm-dialog"
    :show-close="true"
    :close-on-click-modal="false"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @closed="handleClosed"
  >
    <template #header>
      <div class="ccd-header">
        <span class="ccd-header-title">您点击了关闭按钮，您想要：</span>
      </div>
    </template>

    <div class="ccd-body">
      <el-radio-group v-model="choice" class="ccd-radio-group">
        <el-radio label="minimize" class="ccd-radio-item" size="large">
          最小化到托盘
        </el-radio>
        <el-radio label="quit" class="ccd-radio-item" size="large">
          退出
        </el-radio>
      </el-radio-group>
    </div>

    <template #footer>
      <div class="ccd-footer-row">
        <el-checkbox v-model="dontRemind" class="ccd-dont-remind" size="large">
          不再提醒
        </el-checkbox>
        <div class="ccd-actions">
          <button type="button" class="ccd-btn-cancel" @click="onCancel">取消</button>
          <button type="button" class="ccd-btn-confirm" @click="onConfirm">确认</button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { setCloseConfirmPrefs } from '../utils/closeConfirmPrefs'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

/** 是否已通过按钮/逻辑明确应答（避免与标题栏×、遮罩、Esc 重复上报） */
const answered = ref(false)
const choice = ref('minimize')
const dontRemind = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      answered.value = false
      choice.value = 'minimize'
      dontRemind.value = false
    }
  }
)

function onConfirm() {
  answered.value = true
  setCloseConfirmPrefs(dontRemind.value, choice.value)
  window.electronAPI?.respondCloseConfirm?.(choice.value)
  emit('update:modelValue', false)
}

function onCancel() {
  answered.value = true
  window.electronAPI?.respondCloseConfirm?.('cancel')
  emit('update:modelValue', false)
}

function handleClosed() {
  if (!answered.value) {
    window.electronAPI?.respondCloseConfirm?.('cancel')
  }
  answered.value = false
}
</script>

<style scoped>
.ccd-header {
  width: 100%;
  padding-right: 36px;
}

.ccd-header-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--sp-text);
  letter-spacing: 0.01em;
}

.ccd-body {
  padding: 8px 0 4px;
  min-height: 88px;
}

.ccd-radio-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 20px;
  width: 100%;
}

.ccd-radio-item {
  margin: 0;
  height: auto;
  white-space: normal;
}

.ccd-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  flex-wrap: wrap;
}

.ccd-dont-remind {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
  --el-checkbox-checked-text-color: var(--el-text-color-regular);
}

.ccd-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.ccd-btn-cancel {
  min-width: 72px;
  padding: 8px 18px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: 6px;
}

.ccd-btn-cancel:hover {
  color: var(--sp-text);
  border-color: var(--sp-control-border);
  background: var(--sp-subtle-bg);
}

.ccd-btn-confirm {
  min-width: 72px;
  padding: 8px 20px;
  font-size: 14px;
  color: #fff;
  background: #8a76e5;
  border: 1px solid #8a76e5;
  border-radius: 6px;
}

.ccd-btn-confirm:hover {
  background: #7a66d5;
  border-color: #7a66d5;
}

.ccd-btn-confirm:focus-visible,
.ccd-btn-cancel:focus-visible {
  outline: 2px solid var(--ccd-purple);
  outline-offset: 3px;
}
</style>

<style>
/* 紫色选态，卡片和文字跟随全局主题。 */
.close-confirm-dialog.el-dialog {
  --ccd-purple: #8a76e5;
  --ccd-purple-hover: #7a66d5;
  padding: 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--sp-surface);
  box-shadow:
    0 12px 32px rgba(15, 23, 42, 0.12),
    0 2px 8px rgba(15, 23, 42, 0.06);
}

.close-confirm-dialog .el-dialog__header {
  margin: 0;
  padding: 22px 26px 12px;
  border-bottom: none;
}

.close-confirm-dialog .el-dialog__headerbtn {
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border-radius: 6px;
}

.close-confirm-dialog .el-dialog__headerbtn .el-dialog__close {
  color: var(--sp-muted);
  font-size: 16px;
}

.close-confirm-dialog .el-dialog__headerbtn:hover {
  background: var(--sp-subtle-bg);
}

.close-confirm-dialog .el-dialog__body {
  padding: 12px 26px 8px;
}

.close-confirm-dialog .el-dialog__footer {
  padding: 16px 26px 22px;
  border-top: none;
  background: var(--sp-surface);
}

/* 单选：紫色选态 */
.close-confirm-dialog .ccd-radio-group .el-radio {
  height: auto;
}

.close-confirm-dialog .ccd-radio-item .el-radio__label {
  font-size: 14px;
  color: var(--sp-text);
  line-height: 22px;
  padding-left: 10px;
}

.close-confirm-dialog .ccd-radio-item .el-radio__inner {
  width: 18px;
  height: 18px;
  border-width: 2px;
  border-color: var(--sp-control-border);
}

.close-confirm-dialog .ccd-radio-item .el-radio__input.is-checked .el-radio__inner {
  border-color: var(--ccd-purple);
  background: var(--ccd-purple);
}

.close-confirm-dialog
  .ccd-radio-item
  .el-radio__input.is-checked
  .el-radio__inner::after {
  width: 6px;
  height: 6px;
  background: #fff;
}

.close-confirm-dialog .ccd-radio-item .el-radio__input.is-checked + .el-radio__label {
  color: var(--sp-text);
}

/* 不再提醒：圆角勾选框 + 紫色选态 */
.close-confirm-dialog .ccd-dont-remind.el-checkbox {
  margin-right: 0;
}

.close-confirm-dialog .ccd-dont-remind .el-checkbox__label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  padding-left: 8px;
}

.close-confirm-dialog .ccd-dont-remind .el-checkbox__inner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border-width: 2px;
  border-color: var(--sp-control-border);
}

.close-confirm-dialog .ccd-dont-remind .el-checkbox__input.is-checked .el-checkbox__inner {
  background: var(--ccd-purple);
  border-color: var(--ccd-purple);
}

.close-confirm-dialog .ccd-dont-remind .el-checkbox__input.is-checked .el-checkbox__inner::after {
  border-color: #fff;
  width: 3px;
  height: 6px;
  left: 5px;
  top: 2px;
}

.close-confirm-dialog .ccd-dont-remind .el-checkbox__input.is-checked + .el-checkbox__label {
  color: var(--el-text-color-regular);
}
</style>
