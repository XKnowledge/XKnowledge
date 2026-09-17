<template>
  <a-space direction="vertical" :style="{ width: '100%' }" :size="[0, 48]">
    <a-layout style="height: 100vh">
      <a-layout-sider :style="siderStyle">
        <div style="height: 50px" />
        <a-menu
          id="left-menu"
          v-model:openKeys="openKeys"
          v-model:selectedKeys="selectedKeys"
          style="width: 200px"
          mode="inline"
          :items="items"
          @click="handleClick"
        />
        <div style="position: fixed; bottom: -30px; width: 200px">
          <a-button id="uploadFile" @click="openFile">打开本地文件</a-button>
        </div>
      </a-layout-sider>
      <a-layout>
        <a-layout-header :style="headerStyle">
          <div class="top-not-show">{{ title }}</div>
        </a-layout-header>
        <a-layout-content :style="contentStyle">
          <RouterView />
        </a-layout-content>
      </a-layout>
    </a-layout>
  </a-space>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { setPendingChart } from '../store/chartStore'

const router = useRouter()
const route = useRoute()
const title = ref('新建')

const selectedKeys = ref([])
const openKeys = ref([])

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

// 侧边菜单目前只放已实现的页面；"最近/我的文件"等仍预留，
// 未来恢复时在此追加 items（参考 git 历史）
const items = reactive([{ key: '/gallery', label: '图库' }])

// 菜单高亮跟随路由（/gallery）；首页等无菜单项的页面不高亮。
// 注意必须在 items 声明之后（immediate 立即执行回调会访问 items，
// 放在声明前是 TDZ 引用错误，BasicLayout 挂载失败即整页白屏）。
// watch 随组件卸载自动停止（chart 页会卸载 BasicLayout）
watch(
  () => route.path,
  (p) => {
    selectedKeys.value = items.some((item) => item.key === p) ? [p] : []
  },
  { immediate: true }
)

const handleClick = (e) => {
  const itemObj = items.find((item) => item.key === e.key)
  if (!itemObj) return // 菜单项缺失时不应连带抛错
  title.value = itemObj.label
  router.push(e.key)
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

watch(openKeys, (val) => {
  console.log('openKeys', val)
})
</script>

<style>
#uploadFile {
  height: 30px;
  padding: 4px 30px;
}

#left-menu {
  border-inline-end: 0 solid rgba(5, 5, 5, 0.06);
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

.ant-menu {
  background-color: transparent;
}

.ant-menu > .ant-menu-item {
  height: 30px;
  border-radius: 4px; /* 弧度 */
  margin-inline: 10px; /* 左边距 */
  margin-block: 0; /* 上下间隔 */
  width: calc(100% - 20px); /* 总长度 */
}

.ant-menu > .ant-menu-item-selected {
  background-color: #e2e2e2;
}

.ant-menu > .ant-menu-item {
  color: black;
}

.ant-layout-content {
  text-align: left !important;
}
</style>
