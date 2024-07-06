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
        <div style="position: fixed; bottom: -30px; width: 200px;">
          <a-button id="uploadFile">打开本地文件</a-button>
        </div>
      </a-layout-sider>
      <a-layout>
        <a-layout-header :style="headerStyle">
          <div class="top-not-show">{{ title }}</div>
        </a-layout-header>
        <a-layout-content :style="contentStyle">
          <RouterView />
        </a-layout-content>
        <!--      <a-layout-footer :style="footerStyle">Footer</a-layout-footer>-->
      </a-layout>
    </a-layout>
  </a-space>
</template>

<script setup>
import { reactive, ref, watch, h } from 'vue'
import { AppstoreAddOutlined, BookOutlined, HistoryOutlined, FileTextOutlined } from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const title = ref('新建')

const selectedKeys = ref(['add'])
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

function getItem(label, key, icon, children, type) {
  return {
    key,
    icon,
    children,
    label,
    type
  }
}

const items = reactive([
  getItem('新建', 'add', () => h(AppstoreAddOutlined)),
  getItem('最近', 'history', () => h(HistoryOutlined)),
  getItem('图库', 'gallery', () => h(BookOutlined)),
  // getItem('测试页面', 'chart', () => h(BookOutlined)),
  getItem('我的文件', 'myFiles', () => h(FileTextOutlined))
])


window.electronAPI.openView((value) => {
  console.log(value)
  router.push(value)
})

const handleClick = e => {
  // console.log('click', e)
  const itemObj = items.find((item) => item.key === e.key)
  title.value = itemObj.label
  router.push(e.key)
}
watch(openKeys, val => {
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

.move-show {
  display: flex;
  align-items: center; /* 垂直居中 */
  justify-content: center; /* 水平居中 */
  -webkit-app-region: drag; /* 可拖动 */
  background-color: #f5f5f5;
  width: 100%;
  height: 30px;
  font: 13px sans-serif;
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
