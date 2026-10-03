<template>
  <!-- 录屏控制卡片：实时录屏进行中悬浮于画布上（仅 DOM 覆盖层，不在录制
       画面内——录的是 canvas 内容）。仅右侧 ⠿ 手柄可拖（卡片本体/按钮
       不触发拖动），首次拖动把右下角初始定位换算为 left/top 并清
       right/bottom（否则左右约束并存把卡片拉伸变宽）；data-paused/
       data-* 锚点供冒烟断言 -->
  <div
    ref="cardRef"
    class="recording-card"
    data-recording-card
    :data-paused="paused ? 'true' : 'false'"
    :style="
      pos
        ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' }
        : undefined
    "
  >
    <a-button
      type="text"
      shape="circle"
      size="small"
      class="recording-card-btn"
      data-record-pause
      :title="paused ? t('chart.resumeRecording') : t('chart.pauseRecording')"
      :aria-label="paused ? t('chart.resumeRecording') : t('chart.pauseRecording')"
      @click="emit('toggle-pause')"
    >
      <CaretRightOutlined v-if="paused" />
      <PauseOutlined v-else />
    </a-button>
    <a-button
      type="text"
      shape="circle"
      size="small"
      class="recording-card-btn"
      danger
      data-record-stop
      :title="t('chart.stopRecord')"
      :aria-label="t('chart.stopRecord')"
      @click="emit('stop')"
    >
      <!-- 结束 icon：实心红色正方形（录屏软件惯例 ■），不用 antd 的
           StopOutlined（圆角描边轮廓，观感不够「停止」）；颜色定死
           #ff4d4f（antd danger 色，与菜单 danger 项一致），不随主题变 -->
      <span class="recording-stop-icon" aria-hidden="true"></span>
    </a-button>
    <!-- ⠿ 拖动手柄：6 点 grip（录屏软件/可拖列表惯例），拖动只认这里 -->
    <span
      class="recording-drag-handle"
      data-record-drag
      :title="t('chart.dragCard')"
      :aria-label="t('chart.dragCard')"
      @pointerdown="onPointerDown"
    >
      <HolderOutlined />
    </span>
  </div>
</template>

<script setup>
import { onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CaretRightOutlined, HolderOutlined, PauseOutlined } from '@ant-design/icons-vue'

defineProps({
  // 暂停中（true 时暂停按钮切换为「继续」icon）
  paused: { type: Boolean, default: false }
})
const emit = defineEmits(['toggle-pause', 'stop'])
const { t } = useI18n()

const cardRef = ref(null)
// null = 未拖过，用 CSS 右下角初始定位；拖动后切换为 left/top（相对父容器）
const pos = ref(null)
let drag = null

const onPointerDown = (e) => {
  // 监听绑在手柄上，卡片本体/按钮不进这里（无整卡拖动）
  const el = cardRef.value
  const parent = el.parentElement
  const rect = el.getBoundingClientRect()
  const parentRect = parent.getBoundingClientRect()
  // 首次拖动：把 right/bottom 定位换算成 left/top，此后统一用 pos 驱动
  if (!pos.value) pos.value = { x: rect.left - parentRect.left, y: rect.top - parentRect.top }
  drag = {
    startX: e.clientX,
    startY: e.clientY,
    origX: pos.value.x,
    origY: pos.value.y,
    maxX: parentRect.width - rect.width, // clamp 在父容器（画布区）内
    maxY: parentRect.height - rect.height
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  e.preventDefault() // 防拖动选中文本/触发画布手势
}

const onPointerMove = (e) => {
  if (!drag) return
  pos.value = {
    x: Math.min(Math.max(0, drag.origX + e.clientX - drag.startX), drag.maxX),
    y: Math.min(Math.max(0, drag.origY + e.clientY - drag.startY), drag.maxY)
  }
}

const onPointerUp = () => {
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

onUnmounted(onPointerUp)
</script>

<style scoped>
.recording-card {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 5;
  display: flex;
  gap: 4px;
  padding: 6px;
  border-radius: 8px;
  background: var(--xk-float-bg);
  color: var(--xk-text); /* 深色下默认黑字不可见，须随主题（同 graph3d-legend） */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  align-items: center;
  user-select: none;
}

.recording-card-btn {
  color: inherit;
}

/* ⠿ 拖动手柄：grab 光标 + 阻止触摸手势劫持 pointer 拖动；高度对齐小圆
   按钮保证热区不小于按钮，icon 颜色随主题（继承卡片 color） */
.recording-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 24px;
  color: inherit;
  cursor: grab;
  touch-action: none;
}

/* 结束 icon：实心正方形（录屏惯例的红色 ■），尺寸对齐 antd icon 视觉重量 */
.recording-stop-icon {
  display: inline-block;
  width: 10px;
  height: 10px;
  background: #ff4d4f;
}
</style>
