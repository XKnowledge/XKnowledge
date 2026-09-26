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

// 模态开/关同步窗口按钮条暗化；卸载兜底还原（开着弹窗切路由的场景）
watch(open, (v) => window.electronAPI.setOverlayDimmed(v))
onUnmounted(() => window.electronAPI.setOverlayDimmed(false))

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
