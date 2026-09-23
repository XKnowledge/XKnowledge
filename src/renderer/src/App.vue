<template>
  <a-config-provider :theme="antdTheme">
    <BasicLayout v-if="$route.name !== 'chart'" />
    <RouterView v-if="$route.name === 'chart'" />
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { theme } from 'ant-design-vue'
import BasicLayout from './layouts/BasicLayout.vue'
import { effective } from './store/themeStore.js'

// antd 组件算法随生效主题切换；深色基准底 #141414 与 theme.css/3D 场景一致
const antdTheme = computed(() => ({
  algorithm: effective.value === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm
}))
</script>
