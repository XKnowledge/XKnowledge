<template>
  <!-- 设置弹窗：主题三选一即时生效。home 侧栏按钮与图表页菜单两个入口共用。
       mask 关闭不压暗底面（全屏 wrap 层仍在，弹窗外背景不可交互）；
       点击弹窗外空白 / Esc / 右上角 × 均可关闭 -->
  <a-modal v-model:open="open" title="设置" :footer="null" width="360px" :mask="false">
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
import { ref } from 'vue'
import { mode, setMode } from '../store/themeStore.js'

const open = ref(false)

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
