<template>
  <!-- 自绘窗口控制按钮（替代原生 titleBarOverlay：原生按钮带贴顶贴右、
       无法上下居中也无法与右缘留隙）。绝对定位于 53px 头部内：上下居中、
       右缘留隙。macOS 不渲染——那里保留原生红绿灯按钮，自绘会重复 -->
  <div v-if="!isDarwin" class="xk-window-controls">
    <button
      v-if="sizable"
      class="xk-wc-btn"
      :disabled="sizingLocked"
      :title="$t('common.minimize')"
      @click="onMinimize"
    >
      <MinusOutlined />
    </button>
    <button
      v-if="sizable"
      class="xk-wc-btn"
      :disabled="sizingLocked"
      :title="maximized ? $t('common.restore') : $t('common.maximize')"
      @click="onToggleMaximize"
    >
      <!-- Windows「向下还原」形自绘：两个等大方框错位叠放，后框被前框
           遮住只画可见 L 形（path）。antd 图标库无还原图标，此前借
           CopyOutlined 是复制语义（观感像复制按钮），改自绘与系统观感对齐 -->
      <svg v-if="maximized" class="xk-wc-restore-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4.5H19.5V15H15V9H9Z" />
        <rect x="4.5" y="9" width="10.5" height="10.5" />
      </svg>
      <BorderOutlined v-else />
    </button>
    <button class="xk-wc-btn" :title="$t('common.close')" @click="onClose">
      <CloseOutlined />
    </button>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { BorderOutlined, CloseOutlined, MinusOutlined } from '@ant-design/icons-vue'

/**
 * sizable：是否显示最小化/最大化（图表页与世界树页经 enterXxxMode 解锁
 * 窗口尺寸后才有这两个能力；首页窗口锁定 900x670，只有关闭）。
 * 最大化图标状态经 APP_MAXIMIZE_CHANGED 推送同步（点击按钮与双击拖拽区
 * 两条路径都覆盖）；初始必为非最大化——回首页会 lockSizing→unmaximize，
 * 新窗口创建即非最大化。
 */
defineProps({
  sizable: { type: Boolean, default: false },
  // 尺寸冻结（录制期间）：最小化/最大化按钮禁用。主进程另有防御拒绝
  // （APP_WINDOW_MAXIMIZE_TOGGLE 查 isResizable），双保险覆盖 Win+方向键、
  // 双击标题栏拖拽区等系统路径；最小化会暂停 rAF 使视频出现冻结段，同禁
  sizingLocked: { type: Boolean, default: false }
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

/* 自绘还原图标：16px 大于 antd 的 14px（14/15 观感偏小）；笔画 1.6
   （24 viewBox 折算 ≈1.07px，视觉粗细对齐 antd outline）；miter 方角贴合
   Windows 观感 */
.xk-wc-restore-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linejoin: miter;
}
</style>
