<template>
  <!-- 自绘窗口控制按钮（替代原生 titleBarOverlay：原生按钮带贴顶贴右、
       无法上下居中也无法与右缘留隙）。绝对定位于 53px 头部内：上下居中、
       右缘留隙。macOS 不渲染——那里保留原生红绿灯按钮，自绘会重复 -->
  <div v-if="!isDarwin" class="xk-window-controls">
    <button v-if="sizable" class="xk-wc-btn" title="最小化" @click="onMinimize">
      <MinusOutlined />
    </button>
    <button
      v-if="sizable"
      class="xk-wc-btn"
      :title="maximized ? '向下还原' : '最大化'"
      @click="onToggleMaximize"
    >
      <CopyOutlined v-if="maximized" />
      <BorderOutlined v-else />
    </button>
    <button class="xk-wc-btn" title="关闭" @click="onClose">
      <CloseOutlined />
    </button>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { BorderOutlined, CloseOutlined, CopyOutlined, MinusOutlined } from '@ant-design/icons-vue'

/**
 * sizable：是否显示最小化/最大化（图表页与世界树页经 enterXxxMode 解锁
 * 窗口尺寸后才有这两个能力；首页窗口锁定 900x670，只有关闭）。
 * 最大化图标状态经 APP_MAXIMIZE_CHANGED 推送同步（点击按钮与双击拖拽区
 * 两条路径都覆盖）；初始必为非最大化——回首页会 lockSizing→unmaximize，
 * 新窗口创建即非最大化。
 */
defineProps({
  sizable: { type: Boolean, default: false }
})

const isDarwin = window.electronAPI.platform === 'darwin'
const maximized = ref(false)
let offMaximizeChanged = null

onMounted(() => {
  offMaximizeChanged = window.electronAPI.onMaximizeChanged((v) => {
    maximized.value = v
  })
})
onUnmounted(() => offMaximizeChanged?.())

/** 关闭走 close() 而非 destroy()：图表页「未保存确认」拦截照常触发 */
const onMinimize = () => window.electronAPI.minimizeWindow()
const onToggleMaximize = () => window.electronAPI.toggleMaximizeWindow()
const onClose = () => window.electronAPI.closeWindowRequest()
</script>

<style scoped>
/* 父级头部（.title-bar/.move-show/.world-header）均为 position:relative
   的 53px 拖动区，本组件在其内绝对定位；no-drag 恢复按钮点击 */
.xk-window-controls {
  position: absolute;
  top: 50%;
  right: 10px; /* 与窗口右缘的间隙 */
  transform: translateY(-50%); /* 上下居中于头部 */
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
  z-index: 10;
}

.xk-wc-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--xk-text-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.xk-wc-btn:hover {
  background: var(--xk-hover);
  color: var(--xk-text);
}
</style>
