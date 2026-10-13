// 仅注册实际使用的组件；服务式消息/确认框的样式也需要显式加载。
import {
  ElButton, ElCheckbox, ElContainer, ElDialog, ElIcon, ElInput,
  ElInputNumber, ElMain, ElOption, ElProgress, ElRadio, ElRadioGroup,
  ElSelect, ElSwitch, ElTable, ElTableColumn, ElTabPane, ElTabs,
  ElTag, ElTooltip
} from 'element-plus'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/checkbox/style/css'
import 'element-plus/es/components/container/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/icon/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/input-number/style/css'
import 'element-plus/es/components/main/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/progress/style/css'
import 'element-plus/es/components/radio/style/css'
import 'element-plus/es/components/radio-group/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/switch/style/css'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/table-column/style/css'
import 'element-plus/es/components/tab-pane/style/css'
import 'element-plus/es/components/tabs/style/css'
import 'element-plus/es/components/tag/style/css'
import 'element-plus/es/components/tooltip/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'

export function registerUI(app) {
  for (const component of [
    ElButton, ElCheckbox, ElContainer, ElDialog, ElIcon, ElInput,
    ElInputNumber, ElMain, ElOption, ElProgress, ElRadio, ElRadioGroup,
    ElSelect, ElSwitch, ElTable, ElTableColumn, ElTabPane, ElTabs,
    ElTag, ElTooltip
  ]) app.use(component)
}
