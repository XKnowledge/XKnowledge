<template>
  <a-config-provider :theme="antdTheme" :locale="antdLocale">
    <!-- 世界页与图表页同为全幅 3D 画布，不套首页布局 -->
    <BasicLayout v-if="$route.name !== 'chart' && $route.name !== 'world'" />
    <RouterView v-if="$route.name === 'chart' || $route.name === 'world'" />
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { theme } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import enUS from 'ant-design-vue/es/locale/en_US'
import BasicLayout from './layouts/BasicLayout.vue'
import { effective } from './store/themeStore.js'
import { locale } from './store/localeStore.js'

// antd 组件算法随生效主题切换；深色基准底 #141414 与 theme.css/3D 场景一致
const antdTheme = computed(() => ({
  algorithm: effective.value === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm
}))

// antd 内置文案（分页/空态/Modal 按钮等）随语言切换
const antdLocale = computed(() => (locale.value === 'en-US' ? enUS : zhCN))
</script>
