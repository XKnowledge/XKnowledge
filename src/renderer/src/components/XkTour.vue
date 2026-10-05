<!-- 新手教程视图：ant-design-vue 官方 Tour 的薄封装。步骤数据单源在
     utils/tourSteps（纯数据），文案在此经 t() 解析——教程进行中切换语言
     实时跟随；按钮文案（下一步/结束导览）与深浅主题由 App.vue 的
     a-config-provider 自动带出（zh_CN/en_US locale 自带 Tour 域）。
     open/close 语义归 useTour 状态机持有，本组件无自身状态。
     @finish（走完）与 @close（X/遮罩）统一转发 close——都算已看过。 -->
<template>
  <a-tour :open="open" :steps="steps" @close="emit('close')" @finish="emit('close')" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TOUR_STEPS } from '../utils/tourSteps'
import { t } from '../i18n.js'

defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

// target 返回 HTMLElement|null：断言只过类型关，运行时 null（找不到或居中
// 步未传 target）由 Tour 内部居中兜底，不会崩溃
const steps = computed(() =>
  TOUR_STEPS.map((step) => ({
    target: step.target ? () => document.querySelector(step.target) as HTMLElement : undefined,
    placement: step.placement,
    title: t(step.titleKey),
    description: t(step.descKey)
  }))
)
</script>
