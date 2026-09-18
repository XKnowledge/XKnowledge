<template>
  <a-space direction="vertical" :style="{ width: '100%' }" :size="[0, 48]">
    <a-layout style="height: 100vh">
      <a-layout-sider :style="siderStyle">
        <div style="height: 50px" />
        <div style="position: fixed; bottom: -30px; width: 200px">
          <a-button id="uploadFile" @click="openFile">打开本地文件</a-button>
        </div>
      </a-layout-sider>
      <a-layout>
        <a-layout-header :style="headerStyle">
          <div class="top-not-show"></div>
        </a-layout-header>
        <a-layout-content :style="contentStyle">
          <RouterView />
        </a-layout-content>
      </a-layout>
    </a-layout>
  </a-space>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { setPendingChart } from '../store/chartStore'

const router = useRouter()

const headerStyle = {
  textAlign: 'center',
  height: 30,
  paddingInline: 50,
  lineHeight: '64px',
  backgroundColor: '#ffffff'
}
const contentStyle = {
  textAlign: 'center',
  minHeight: 120,
  lineHeight: '120px',
  backgroundColor: '#ffffff'
}
const siderStyle = {
  textAlign: 'center',
  lineHeight: '120px',
  backgroundColor: '#f5f5f5'
}

const openFile = async () => {
  /**
   * 打开本地文件：读取与校验在主进程完成，成功后本地跳转图表页。
   */
  let res
  try {
    res = await window.electronAPI.openFile()
  } catch (err) {
    console.error('打开失败', err)
    // 不解析 err.message（跨 IPC 边界后文案不可靠），使用固定中文提示
    message.error('打开失败：文件读取失败或已损坏')
    return // 留在首页，用户可重试打开其他文件
  }
  if (res.canceled) return
  if (res.alreadyOpen) {
    message.info('该文件已在打开的窗口中')
    return
  }
  setPendingChart({ value: res.content, path: res.path })
  router.push('chart')
}
</script>

<style>
#uploadFile {
  height: 30px;
  padding: 4px 30px;
}

.ant-layout-sider {
  border-inline-end: 1px solid rgba(5, 5, 5, 0.06);
}

.ant-layout-header {
  height: 30px !important;
  padding-inline: 0 !important;
}

.top-not-show {
  display: flex;
  align-items: center; /* 垂直居中 */
  justify-content: center; /* 水平居中 */
  -webkit-app-region: drag; /* 可拖动 */
  background-color: #ffffff;
  width: 100%;
  height: 30px;
  font: 13px sans-serif;
  color: #ffffff; /* 设置字体颜色与背景相同 */
}

.ant-layout-content {
  text-align: left !important;
}
</style>
