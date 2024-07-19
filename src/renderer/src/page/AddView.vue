<template>
  <div class="inner-div">
    <div class="content">
      <a-typography>
        <a-dropdown>
          <a class="ant-dropdown-link" @click.prevent>
            {{ curMenu }}
            <UnorderedListOutlined />
          </a>
          <template #overlay>
            <a-menu @click="onClick">
              <a-menu-item v-for="item in MenuList" :key="item.key">{{ item.name }}</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
        <a-typography-title :level="2">选取模板</a-typography-title>
        <a-typography-title :level="3">最近使用</a-typography-title>
        <!-- <a-typography-title :level="3">demo</a-typography-title> -->
        <my-card-list :history-list="myHistory" />
        <a-typography-title v-for="item in MenuList" :key="item.key" :level="3">{{ item.name }}</a-typography-title>
      </a-typography>
    </div>
  </div>

</template>

<script setup>
import { UnorderedListOutlined } from '@ant-design/icons-vue'

import { ref } from 'vue'
import MyCardList from '../components/MyCardList.vue'

const MENU = [
  { key: '1', name: '全部' },
  { key: '2', name: '基本' },
  // { key: '3', name: '知识管理' },
  // { key: '4', name: '会议和计划' },
  // { key: '5', name: '学习和教育' },
  // { key: '6', name: '项目管理' },
  // { key: '7', name: '娱乐和生活' },
  // { key: '8', name: '分析和决策' },
  // { key: '9', name: '创造力' }
]

const MenuList = ref(MENU)

const curMenu = ref('全部')

const onClick = ({ key }) => {
  console.log(`Click on item ${key}`)
  curMenu.value = MenuList.value[key].name
}

const myHistory = ref([
  {
    id: 'test1',
    name: '思维导图1',
    src: 'https://img0.baidu.com/it/u=365878481,4199784825&fm=253&fmt=auto&app=120&f=JPEG?w=750&h=500'
  },
  // {
  //   id: 'test2',
  //   name: '思维导图2',
  //   src: 'https://img0.baidu.com/it/u=365878481,4199784825&fm=253&fmt=auto&app=120&f=JPEG?w=750&h=500'
  // },
  // {
  //   id: 'test3',
  //   name: '思维导图3',
  //   src: 'https://img0.baidu.com/it/u=365878481,4199784825&fm=253&fmt=auto&app=120&f=JPEG?w=750&h=500'
  // }
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
