<template>
  <!-- 设置弹窗：主题 + 快捷键自定义（5 键位录制）+ 鼠标手势只读。
       home 侧栏按钮与图表页菜单两个入口共用；mask 关闭不压暗底面；
       点击弹窗外空白 / Esc / × 均可关闭（录制态的 Esc 先被录制层
       capture 消费，只取消录制不关弹窗） -->
  <a-modal v-model:open="open" title="设置" :footer="null" width="420px" :mask="false">
    <div class="xk-settings-scroll">
      <div class="xk-settings-item">
        <span class="xk-settings-label">主题</span>
        <a-radio-group button-style="solid" :value="mode" @change="onThemeChange">
          <a-radio-button value="auto">跟随系统</a-radio-button>
          <a-radio-button value="light">浅色</a-radio-button>
          <a-radio-button value="dark">深色</a-radio-button>
        </a-radio-group>
      </div>

      <a-divider class="xk-settings-divider">快捷键</a-divider>
      <div
        v-for="kb in keybindingRows"
        :key="kb.id"
        class="xk-settings-item"
        :data-keybinding-row="kb.id"
      >
        <span class="xk-settings-label">{{ kb.name }}</span>
        <a-space :size="4">
          <a-button
            size="small"
            class="xk-binding-btn"
            :class="{ 'is-recording': recordingId === kb.id }"
            :data-recording="recordingId === kb.id ? 'on' : 'off'"
            @click="toggleRecording(kb.id)"
          >
            {{ recordingId === kb.id ? '按下新组合…' : bindingLabel(kb.id) }}
          </a-button>
          <a-button
            v-if="isCustomized(kb.id)"
            size="small"
            type="link"
            class="xk-reset-btn"
            @click="resetBinding(kb.id)"
          >
            恢复默认
          </a-button>
        </a-space>
      </div>
      <div v-if="anyCustomized" class="xk-settings-item xk-reset-all">
        <a-button size="small" type="link" @click="resetAll">全部恢复默认</a-button>
      </div>

      <a-divider class="xk-settings-divider">鼠标手势</a-divider>
      <div v-for="g in gestureRows" :key="g.id" class="xk-settings-item" :data-gesture-row="g.id">
        <span class="xk-settings-label">{{ g.name }}</span>
        <span class="xk-binding-text">{{ g.label }}</span>
      </div>
      <div class="xk-settings-note">鼠标手势暂不支持自定义</div>
    </div>
  </a-modal>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { mode, setMode } from '../store/themeStore.js'
import {
  bindings,
  isCustomized,
  resetAll,
  resetBinding,
  setBinding
} from '../store/keybindingStore.js'
import {
  ACTION_NAMES,
  KEYBINDING_IDS,
  findConflict,
  formatBindingLabel,
  normalizeRecordedEvent,
  validateRecording
} from '../utils/keybindings.js'
import { modifierKeyLabel } from '../utils/platformModifier.js'

const open = ref(false)
const isDarwin = window.electronAPI.platform === 'darwin'

const keybindingRows = KEYBINDING_IDS.map((id) => ({ id, name: ACTION_NAMES[id] }))
const gestureRows = [
  { id: 'create-node', name: '新建节点', label: '双击空白处' },
  { id: 'marquee', name: '框选', label: 'Shift+拖拽' },
  { id: 'link', name: '新建连接', label: `${modifierKeyLabel(isDarwin)}+拖拽节点` }
]

const recordingId = ref(null)
const anyCustomized = computed(() => KEYBINDING_IDS.some((id) => isCustomized(id)))
const bindingLabel = (id) => formatBindingLabel(bindings.value[id], isDarwin)

const stopRecording = () => {
  if (!recordingId.value) return
  recordingId.value = null
  window.removeEventListener('keydown', onRecordKeydown, true)
}

const onRecordKeydown = (event) => {
  // 录制态独占键盘：window capture 抢在所有 bubble（含 a-modal 的 Esc
  // 关闭）之前，事件到此为止
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') {
    stopRecording() // Esc 只取消录制，弹窗不关
    return
  }
  const binding = normalizeRecordedEvent(event)
  if (!binding) return // 单按修饰键：继续等组合
  const id = recordingId.value
  const reject = validateRecording(id, binding)
  if (reject) {
    message.warning(reject)
    stopRecording()
    return
  }
  const conflictId = findConflict(bindings.value, id, binding)
  if (conflictId) {
    message.warning(`已被「${ACTION_NAMES[conflictId]}」占用`)
    stopRecording()
    return
  }
  setBinding(id, binding)
  stopRecording()
}

const toggleRecording = (id) => {
  if (recordingId.value === id) {
    stopRecording() // 再点一次 = 手动取消
    return
  }
  stopRecording() // 换键位录制：旧监听先卸（挂卸对称）
  recordingId.value = id
  window.addEventListener('keydown', onRecordKeydown, true)
}

// 弹窗关闭/组件卸载时录制态随之解除（监听不残留）
watch(open, (v) => {
  if (!v) stopRecording()
})
onUnmounted(stopRecording)

const onThemeChange = (e) => setMode(e.target.value)

defineExpose({ open: () => (open.value = true) })
</script>

<style scoped>
.xk-settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
}

.xk-settings-label {
  font-size: 14px;
}

/* 内容超出滚动（主题 1 行 + 快捷键 5 行 + 手势 3 行） */
.xk-settings-scroll {
  max-height: 60vh;
  overflow-y: auto;
}

.xk-settings-divider {
  margin: 4px 0;
}

.xk-binding-btn.is-recording {
  border-color: #1677ff;
  color: #1677ff;
}

.xk-binding-text {
  font-size: 13px;
}

.xk-settings-note {
  font-size: 12px;
  opacity: 0.65;
  padding: 4px;
}

.xk-reset-all {
  justify-content: flex-end;
  padding: 2px 4px;
}
</style>
