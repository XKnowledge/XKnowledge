<template>
  <a-space direction="vertical" :style="{ width: '100%' }" :size="[0, 48]">
    <a-layout style="height: 100vh">
      <a-layout-header :style="headerStyle" class="move-show">
        <a-button class="no-move-button" @click="createNode">创建节点</a-button>
        <a-button class="no-move-button" @click="createSide">创建边</a-button>

        <a-button class="no-move-button" @click="toggleSider">Toggle Sider</a-button>
        <!-- 控制按钮 -->
      </a-layout-header>
      <a-layout>
        <a-layout-content :style="contentStyle">
          <div id="chart" :style="echartsStyle" />
        </a-layout-content>
        <a-layout-sider v-show="siderVisible" class="sider-style">
          Sider
        </a-layout-sider>
      </a-layout>
      <a-layout-footer class="footerStyle">Footer</a-layout-footer>
    </a-layout>
  </a-space>
</template>

<script setup>
import { onMounted, ref, nextTick } from 'vue'
import * as echarts from 'echarts'
import myAxios from '../utils/myAxios'
import createOption from '../utils/myOption.ts'

const chatData = ref()

// 基于准备好的dom，初始化echarts实例
let chartDom = null
let myChart = null

onMounted(() => {
  myAxios.get('http://127.0.0.1:5000/XKMainView').then(response => {
    if (response) {
      // 获取数据
      chatData.value = response
      const chatDataValue = chatData.value
      if (chatDataValue) {
        const option = createOption(chatDataValue)
        // 调用渲染图表逻辑
        getCharts(option)
      }
    }
  })
  window.addEventListener('resize', myResize)
})

const getCharts = (option) => {
  console.log('option')

  // 基于准备好的dom，初始化echarts实例
  chartDom = document.getElementById('chart')
  console.log(option)
  if (!chartDom) {
    console.error('chart图表容器不存在，请检查HTML代码！')
  } else {
    // 初始化 ECharts 图表
    myChart = echarts.init(chartDom)
    if (!option) {
      console.error('图表信息为空，请联系管理员！')
    } else {
      // 使用刚指定的配置项和数据显示图表。
      myChart.setOption(option)
    }
  }
}

const siderVisible = ref(true) // 初始状态为显示

const echartsWidth = ref('100vh')

const toggleSider = () => {
  siderVisible.value = !siderVisible.value // 切换侧边栏的显示状态
  echartsWidth.value = siderVisible.value ? `calc(100vw - ${270}px)` : '100vw'
  console.log(echartsWidth.value)
  // 使用 nextTick 等待DOM更新完成后执行resize
  nextTick(() => {
    myChart.resize()
  })
}

// 观察echartsWidth的变化
// watch(echartsWidth, (newVal, oldVal) => {
//   if (newVal !== oldVal) {
//     // 确保只有在值真正改变时才调用resize
//     myChart.resize() // 执行echarts图表的resize方法
//   }
// })

const myResize = () => {
  myChart.resize()
}

const createNode = () => {
  myChart.resize()
}

const createSide = () => {
  myChart.resize()
}


const headerStyle = {
  textAlign: 'center',
  height: 50,
  paddingInline: 50,
  lineHeight: '64px',
  backgroundColor: '#f5f5f5'
}
const contentStyle = {
  textAlign: 'center',
  minHeight: 120,
  lineHeight: '120px',
  backgroundColor: '#ffffff',
  width: echartsWidth.value,
  height: 'calc(100vh - 86px)'
}
const echartsStyle = {
  width: '100%',
  height: '100%'
  // width: echartsWidth.value,
  // height: 'calc(100vh - 86px)'
}

</script>

<style>

.echarts-style {
  width: 100%;
  height: 100%;
  /* background-color: #fff; */
  margin-top: 10px;
  margin-bottom: 10px;
  /* border: 1.5px solid rgb(228, 228, 234); */
}

.move-show {
  display: flex;
  align-items: center; /* 垂直居中 */
  justify-content: center; /* 水平居中 */
  -webkit-app-region: drag; /* 可拖动 */
  background-color: #f5f5f5;
  width: 100%;
  height: 53px !important;
  font: 13px sans-serif;
  border-bottom: 1px solid rgba(5, 5, 5, 0.06);

}

.no-move-button {
  -webkit-app-region: no-drag;
}

.footerStyle {
  padding: 0 !important;
  text-align: center;
  background-color: #f5f5f5;
  height: 33px !important;
  border-top: 1px solid rgba(5, 5, 5, 0.06);
}

.sider-style {
  text-align: center;
  line-height: 120px;
  width: 270px !important;
  max-width: 270px !important;
  min-width: 270px !important;
  background-color: #f5f5f5 !important;
}
</style>
