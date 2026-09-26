<template>
  <!-- 设置弹窗：主题三选一即时生效。home 侧栏按钮与图表页菜单两个入口共用。
       开/关时上报 overlay 暗化：模态遮罩压暗全窗（含标题栏），但 OS 绘制的
       窗口控制按钮条遮罩够不到，须同步换暗化配色才能全窗统一置灰 -->
  <a-modal v-model:open="open" title="设置" :footer="null" width="360px">
    <div class="xk-settings-item">
      <span class="xk-settings-label">主题</span>
      <a-radio-group button-style="solid" :value="mode" @change="onThemeChange">
        <a-radio-button value="auto">跟随系统</a-radio-button>
        <a-radio-button value="light">浅色</a-radio-button>
        <a-radio-button value="dark">深色</a-radio-button>
      </a-radio-group>
    </div>
  </a-modal>
</template>

<script setup>
import { onUnmounted, ref, watch } from 'vue'
import { mode, setMode } from '../store/themeStore.js'

const open = ref(false)

// 模态开/关同步窗口按钮条暗化。上报时机对齐遮罩动画真实起步：随 open 直接
// 上报会领先底面——菜单入口的模态挂载比 open 置位慢数十毫秒；改在
// document 捕获 animationstart（antFadeIn/antFadeOut 命中 fade，排除模态
// 本体的 antZoom），350ms 兜底防事件缺失。syncRun 令旧一轮的延迟回调失效，
// 防快速开关时旧值后到覆盖新值
let syncRun = 0
watch(open, (v) => {
  const run = ++syncRun
  const opts = { capture: true }
  const fire = () => {
    if (run !== syncRun) return // 已被更新一轮开关作废
    document.removeEventListener('animationstart', onAnim, opts)
    clearTimeout(timer)
    window.electronAPI.setOverlayDimmed(v)
  }
  const onAnim = (e) => {
    if (String(e.animationName).toLowerCase().includes('fade')) fire()
  }
  const timer = setTimeout(fire, 350)
  document.addEventListener('animationstart', onAnim, opts)
})
onUnmounted(() => {
  syncRun++ // 作废在途等待
  window.electronAPI.setOverlayDimmed(false)
})

const onThemeChange = (e) => setMode(e.target.value)

defineExpose({ open: () => (open.value = true) })
</script>

<style scoped>
.xk-settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px;
}

.xk-settings-label {
  font-size: 14px;
}
</style>
