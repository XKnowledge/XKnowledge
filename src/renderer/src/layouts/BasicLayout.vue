<template>
  <!-- 根节点必须是块级（a-layout），勿再用 a-space 等行内级组件包裹：
       inline-flex 的基线对齐会把行框撑到 100vh 之外，导致页面级滚动条 -->
  <a-layout style="height: 100vh">
    <a-layout-sider class="xk-sider">
      <div style="height: 50px" />
      <div class="sider-buttons">
        <a-button id="openSettings" @click="settingsRef?.open()">设置</a-button>
        <a-button id="uploadFile" @click="openFile">打开本地文件</a-button>
      </div>
      <XkSettings ref="settingsRef" />
    </a-layout-sider>
    <a-layout>
      <a-layout-header class="xk-header">
        <div class="title-bar">
          <XkTitleText />
        </div>
      </a-layout-header>
      <a-layout-content class="xk-content">
        <RouterView />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { ref } from 'vue'
import { setPendingChart } from '../store/chartStore'
import XkTitleText from '../components/XkTitleText.vue'
import XkSettings from '../components/XkSettings.vue'

const router = useRouter()
const settingsRef = ref(null)

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
/* 侧栏底部按钮组：设置在上、打开本地文件在下，贴 sider 底对齐。
   左右 padding 27px：flex 列默认 stretch 让两按钮统一拉到内容区宽（146px），
   与侧栏左右留距对齐旧版「打开本地文件」的内容宽；无 padding 则拉满 200px 贴边 */
.sider-buttons {
  position: fixed;
  bottom: 8px;
  width: 200px;
  display: flex;
  flex-direction: column;
  padding: 0 27px;
  gap: 8px;
}

#uploadFile,
#openSettings {
  height: 30px;
  padding: 4px 30px;
}

.ant-layout-sider {
  border-inline-end: 1px solid var(--xk-border);
}

/* 布局三区配色（变量化，随主题切换）：原 JS 内联 style 对象迁此。
   sider/header 的 background 必须 !important：antd 的
   `.ant-layout .ant-layout-sider(-header)` 规则 specificity (0,2,0)
   且 Sider 默认深色主题 #001529，单类 (0,1,0) 压不过（同 .sider-style 的
   现状用法）；content 无 antd 背景规则，不需要 */
.xk-header {
  text-align: center;
  height: 30px;
  padding-inline: 50px;
  line-height: 64px;
  background-color: var(--xk-bg) !important;
}

.xk-content {
  text-align: center;
  min-height: 120px;
  line-height: 120px;
  background-color: var(--xk-bg);
}

.xk-sider {
  text-align: center;
  line-height: 120px;
  background-color: var(--xk-bg-layout) !important;
}

.ant-layout-header {
  height: 30px !important;
  padding-inline: 0 !important;
}

.title-bar {
  display: flex;
  align-items: center; /* 垂直居中 */
  justify-content: center; /* 水平居中 */
  -webkit-app-region: drag; /* 可拖动 */
  background-color: var(--xk-bg);
  width: 100%;
  height: 30px;
  position: relative; /* 作为绝对定位子元素的上下文 */
}

.ant-layout-content {
  text-align: left !important;
}
</style>
