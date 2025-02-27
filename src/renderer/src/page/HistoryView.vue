<template>
  <div class="inner-div">
    <div class="content">
      <a-typography-title :level="1">最近</a-typography-title>
      <XkCardList :fileList="templates" />
      <!--      <button type="button" id="btn" @click="ipcHandle">Open a File</button>-->
      <!--      File path: <strong id="filePath">{{ filePath }}</strong>-->
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import XkCardList from '../components/XkCardList.vue'

const templates = ref([
  {
    id: 'template1',
    name: '知识图谱1',
    src: 'https://img0.baidu.com/it/u=365878481,4199784825&fm=253&fmt=auto&app=120&f=JPEG?w=750&h=500'
  },
  {
    id: 'template2',
    name: '知识图谱2',
    src: 'https://img0.baidu.com/it/u=365878481,4199784825&fm=253&fmt=auto&app=120&f=JPEG?w=750&h=500'
  },
  {
    id: 'template3',
    name: '知识图谱3',
    src: 'https://img0.baidu.com/it/u=365878481,4199784825&fm=253&fmt=auto&app=120&f=JPEG?w=750&h=500'
  }
])
</script>

<style scoped>
.content {
  padding-top: 10px; /* 上边距为 10px */
  padding-left: 30px; /* 左边距为 30px */
  padding-right: 30px; /* 右边距为 30px */
}

.inner-div {
  overflow: auto; /* 当内容超出容器尺寸时显示滚动条 */
  height: 100%; /* 例如，设置一个固定的高度 */
  width: calc(100% - 2px); /* 或者设置为父元素宽度的一部分 */
}

.inner-div::-webkit-scrollbar-track {
  background: #ffffff; /* 设置滚动条轨道背景颜色 */
}

.inner-div::-webkit-scrollbar-thumb {
  background: #e5e5e5; /* 设置滚动条滑块颜色 */
}

.inner-div::-webkit-scrollbar-button {
  display: none; /* 隐藏滚动条按钮 */
}

.inner-div::-webkit-scrollbar-thumb:hover {
  background: #b2b2b2; /* 设置滚动条滑块鼠标悬停时的颜色 */
}

.inner-div::-webkit-scrollbar-corner {
  background: #f1f1f1; /* 设置滚动条角落颜色 */
}
</style>
