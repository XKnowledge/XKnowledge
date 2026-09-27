<!-- 窗口标题文本：主进程经 app:title-changed 推送（文件名同名消歧在主进程全局算），
     渲染端纯展示、不自算；初始值与主进程默认标题一致。
     首页标题条（BasicLayout）与图表页头部（ChartView）共用。 -->
<template>
  <span class="xk-title-text" :class="{ 'xk-title-compact': compact }">
    <template v-if="compact">
      <span v-if="dirty" class="xk-title-dirty">•</span>
      <span class="xk-title-label">{{ compactLabel }}</span>
    </template>
    <template v-else>{{ title }}</template>
  </span>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const { compact = false } = defineProps({ compact: Boolean })
const title = ref('XKnowledge')
const dirty = computed(() => title.value.endsWith(' • — XKnowledge'))
const compactLabel = computed(() => title.value.replace(/ •(?= — XKnowledge$)/, ''))
let offTitleChanged = null
onMounted(() => {
  offTitleChanged = window.electronAPI.onTitleChanged((t) => {
    title.value = t
  })
})
onUnmounted(() => offTitleChanged?.())
</script>

<style scoped>
.xk-title-text {
  color: #8c8c8c;
  font: 13px sans-serif;
  user-select: none; /* 拖动区文字不可选中 */
  white-space: nowrap;
}

.xk-title-compact {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}

.xk-title-dirty {
  flex: none;
  margin-right: 4px;
}

.xk-title-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
