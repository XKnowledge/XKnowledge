<template>
  <!-- 根节点必须是块级（a-layout），勿再用 a-space 等行内级组件包裹：
       inline-flex 的基线对齐会把行框撑到 100vh 之外，导致页面级滚动条 -->
  <a-layout class="xk-shell" style="height: 100vh">
    <a-layout-sider class="xk-sider" :width="184">
      <!-- 顶组：世界树（主导航）居卡顶；底组：设置/打开本地文件（工具项）贴卡底 -->
      <div class="sider-buttons sider-top">
        <a-button id="openWorld" @click="router.push('/world')">
          <template #icon><Network :size="16" /></template>
          世界树
        </a-button>
      </div>
      <div class="sider-buttons sider-bottom">
        <a-button id="openSettings" @click="settingsRef?.open()">
          <template #icon><Settings :size="16" /></template>
          设置
        </a-button>
        <a-button id="uploadFile" @click="openFile">
          <template #icon><FolderOpen :size="16" /></template>
          打开本地文件
        </a-button>
      </div>
      <XkSettings ref="settingsRef" />
    </a-layout-sider>
    <a-layout>
      <a-layout-header class="xk-header">
        <div class="title-bar">
          <XkTitleText />
          <!-- 首页窗口锁定 900x670（不可最小化/最大化），控制按钮只有关闭 -->
          <XkWindowControls />
        </div>
      </a-layout-header>
      <a-layout-content class="xk-content">
        <RouterView />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup>
import { FolderOpen, Network, Settings } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { ref } from 'vue'
import { setPendingChart } from '../store/chartStore'
import XkTitleText from '../components/XkTitleText.vue'
import XkSettings from '../components/XkSettings.vue'
import XkWindowControls from '../components/XkWindowControls.vue'

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
/* 侧栏按钮组：分顶/底两组——世界树居卡顶（主导航），设置/打开本地文件
   贴卡底（工具项），children flex 列 + 底组 margin-top:auto 分居两端。
   卡内左右留 10px 不贴卡沿（flex 列默认 stretch 拉满卡内宽）。原整组
   position:fixed 贴窗口底，卡片化留边后固定坐标会压到卡沿 */
.sider-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 10px;
}

.sider-buttons.sider-top {
  padding-top: 10px;
}

.sider-buttons.sider-bottom {
  margin-top: auto;
  padding-bottom: 10px;
}

/* antd 结构 aside > .ant-layout-sider-children 是普通块（antd 只给
   height:100%）：改 flex 列让 .sider-buttons 的 margin-top:auto 生效 */
.xk-sider .ant-layout-sider-children {
  display: flex;
  flex-direction: column;
}

#uploadFile,
#openSettings,
#openWorld {
  height: 30px;
  padding: 4px 12px;
  /* 图标+文字左对齐（antd 按钮默认居中，id 选择器优先级足够覆盖） */
  text-align: left;
  /* 去边框去背景：贴侧栏的"裸"导航项观感。antd 默认按钮是白底（深色主题下
     尤其突兀）。ID 优先级高于 antd 类级 hover/active 规则，交互态背景同样
     被压住，hover 反馈只剩文字/图标变色（currentColor 跟随） */
  border: none;
  background: transparent;
}

/* lucide 图标入按钮：antd 的 icon-文本 8px 间距规则只认 .anticon 类（lucide
   的 svg 没有），需自行补间距；svg 默认基线对齐会整体偏上，按图标惯例下移
   0.125em 与文本光学居中 */
.sider-buttons .ant-btn > svg.lucide {
  margin-inline-end: 8px;
  vertical-align: -0.125em;
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
  height: 53px; /* 与图表页头部（ChartView .move-show）同高 */
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
  /* 卡片样式（同 XkExampleCard 的卡片语言）：四周留 8px 浮起 + 描边 +
     圆角；底色沿用布局底，与内容区（--xk-bg）保持层次。border 须置于
     全局 .ant-layout-sider 的 border-inline-end 之后（同优先级源序决胜）。
     宽度不变量：8 边距 + 184 卡宽 + 8 边距 = 200px，侧栏列占位与
     卡片化前完全一致——宽度多占会挤压图库列数（900px 窗口下 3 列
     仅 9px 余量，曾因多占 16px 掉成 2 列） */
  margin: 8px;
  border: 1px solid var(--xk-card-border);
  border-radius: 10px;
  /* 底部投影增立体感：同浮层搜索框的阴影档位（XkWorldSearch/
     XkGraphSearch），向下偏移只投底部 */
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
  text-align: center;
  line-height: 120px;
  background-color: var(--xk-bg-layout) !important;
}

/* 窗口底（卡片四周 gutter 露出的底）：内容底色。antd 给 .ant-layout 涂
   colorBgLayout（浅 #f5f5f5 / 深 #000）与主题 token 不一致，
   !important 压之（同 .xk-sider 背景的处理） */
.xk-shell {
  background-color: var(--xk-bg) !important;
}

.ant-layout-header {
  height: 53px !important;
  padding-inline: 0 !important;
}

.title-bar {
  display: flex;
  align-items: center; /* 垂直居中 */
  justify-content: center; /* 水平居中 */
  -webkit-app-region: drag; /* 可拖动 */
  background-color: var(--xk-bg);
  width: 100%;
  height: 53px;
  position: relative; /* 作为绝对定位子元素的上下文 */
}

.ant-layout-content {
  text-align: left !important;
}
</style>
