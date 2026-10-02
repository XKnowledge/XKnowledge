<template>
  <!-- 设置弹窗：语言 + 主题 + 快捷键自定义（5 键位录制）+ 鼠标手势只读。
       home 侧栏按钮与图表页菜单两个入口共用；mask 关闭不压暗底面；
       点击弹窗外空白 / Esc / × 均可关闭（录制态的 Esc 先被录制层
       capture 消费，只取消录制不关弹窗） -->
  <a-modal
    v-model:open="open"
    :title="$t('settings.title')"
    :footer="null"
    width="420px"
    :mask="false"
  >
    <div class="xk-settings-scroll">
      <div class="xk-settings-item" data-locale-row>
        <span class="xk-settings-label">{{ $t('settings.language') }}</span>
        <a-radio-group button-style="solid" :value="localeMode" @change="onLocaleChange">
          <!-- 语言名永远用各自语言原文显示（业内惯例）；auto 跟随系统 -->
          <a-radio-button value="auto">{{ $t('settings.followSystem') }}</a-radio-button>
          <a-radio-button value="zh-CN">中文</a-radio-button>
          <a-radio-button value="en-US">English</a-radio-button>
        </a-radio-group>
      </div>

      <div class="xk-settings-item">
        <span class="xk-settings-label">{{ $t('settings.theme') }}</span>
        <a-radio-group button-style="solid" :value="mode" @change="onThemeChange">
          <a-radio-button value="auto">{{ $t('settings.followSystem') }}</a-radio-button>
          <a-radio-button value="light">{{ $t('settings.light') }}</a-radio-button>
          <a-radio-button value="dark">{{ $t('settings.dark') }}</a-radio-button>
        </a-radio-group>
      </div>

      <a-divider class="xk-settings-divider">{{ $t('settings.keybindings') }}</a-divider>
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
            {{ recordingId === kb.id ? $t('settings.pressNewCombo') : bindingLabel(kb.id) }}
          </a-button>
          <a-button
            v-if="isCustomized(kb.id)"
            size="small"
            type="link"
            class="xk-reset-btn"
            @click="resetBinding(kb.id)"
          >
            {{ $t('settings.resetDefault') }}
          </a-button>
        </a-space>
      </div>
      <div v-if="anyCustomized" class="xk-settings-item xk-reset-all">
        <a-button size="small" type="link" @click="resetAll">
          {{ $t('settings.resetAll') }}
        </a-button>
      </div>

      <a-divider class="xk-settings-divider">{{ $t('settings.gestures') }}</a-divider>
      <div v-for="g in gestureRows" :key="g.id" class="xk-settings-item" :data-gesture-row="g.id">
        <span class="xk-settings-label">{{ g.name }}</span>
        <span class="xk-binding-text">{{ g.label }}</span>
      </div>
      <div class="xk-settings-note">{{ $t('settings.gestureNote') }}</div>
    </div>
  </a-modal>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { mode, setMode } from '../store/themeStore.js'
// 语言三态（themeStore 同构）：auto/zh-CN/en-US，此处别名为 localeMode 避开主题 mode
import { mode as localeMode, setLocaleMode } from '../store/localeStore.js'
import {
  bindings,
  isCustomized,
  resetAll,
  resetBinding,
  setBinding
} from '../store/keybindingStore.js'
import {
  KEYBINDING_IDS,
  actionName,
  findConflict,
  formatBindingLabel,
  normalizeRecordedEvent,
  validateRecording
} from '../utils/keybindings.js'
import { modifierKeyLabel } from '../utils/platformModifier.js'
import { t } from '../i18n.js'

const open = ref(false)
const isDarwin = window.electronAPI.platform === 'darwin'

// 语言切换后行名即时跟随：动作名/手势名语言相关，computed 而非常量
const keybindingRows = computed(() => KEYBINDING_IDS.map((id) => ({ id, name: actionName(id) })))
const gestureRows = computed(() => [
  { id: 'create-node', name: t('gesture.createNode'), label: t('gesture.doubleClickBlank') },
  { id: 'marquee', name: t('gesture.marquee'), label: t('gesture.shiftDrag') },
  {
    id: 'link',
    name: t('gesture.createLink'),
    label: t('gesture.linkLabel', { modifier: modifierKeyLabel(isDarwin) })
  }
])

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
    message.warning(t('settings.keybindingConflict', { name: actionName(conflictId) }))
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
const onLocaleChange = (e) => setLocaleMode(e.target.value)

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

/* 内容超出滚动（语言 1 行 + 主题 1 行 + 快捷键 5 行 + 手势 3 行） */
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
