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
          <div id="chart" :style="echartsStyle"></div>
        </a-layout-content>
        <a-layout-sider v-show="siderVisible" class="sider-style">
          <a-form :model="formStat" v-show="createNodeVisible">
            <a-form-item label="名称">
              <a-input v-model:value="newNode.name" />
            </a-form-item>
            <a-form-item label="描述">
              <a-input v-model:value="newNode.des" />
            </a-form-item>
            <a-form-item label="所属类目">
              <a-input v-model:value="newNode.category" />
            </a-form-item>
            <a-form-item>
              <a-button @click="createNodeSubmit">创建</a-button>
            </a-form-item>
          </a-form>
        </a-layout-sider>
      </a-layout>
      <a-layout-footer class="footer-style">Footer</a-layout-footer>
    </a-layout>
  </a-space>
</template>

<script setup>
import { onMounted, ref, nextTick, reactive, toRaw } from 'vue'
import * as echarts from 'echarts'
import myAxios from '../utils/myAxios'
import createOption from '../utils/myOption.ts'

const chartData = ref();
const newNode = ref({
  "name": "",
  "des": "",
  "symbolSize": 50,
  "category": ""
});

// 基于准备好的dom，初始化echarts实例
let chartDom = null;
let chartInstance = null;
let highlightNodeList = []; // 高亮节点记录
let history = []; // 记录历史
let history_sequence_number = -1; // HSN：历史操作对应的目前的位置

onMounted(() => {
  // 获取数据
  chartData.value = createOption();
  // 调用渲染图表逻辑
  getChart(chartData.value);
  window.addEventListener('resize', resizeChart);
})

const getChart = (option) => {
  console.log('option');

  // 基于准备好的dom，初始化echarts实例
  chartDom = document.getElementById('chart');
  console.log(option);
  if (!chartDom) {
    console.error('chart图表容器不存在，请检查HTML代码！');
  } else {
    // 初始化 ECharts 图表
    chartInstance = echarts.init(chartDom);
    if (!option) {
      console.error('图表信息为空，请联系管理员！');
    } else {
      // 使用刚指定的配置项和数据显示图表。
      chartInstance.setOption(option);

      chartInstance.on("click", clickChart);
    }
  }
}

const clickChart = event => {
  // console.log(event);
  if (event.dataType === "node") {
    const pos = highlightNodeList.indexOf(event.dataIndex);
    if (pos !== -1 && highlightNodeList.length !== 0) {
      // 当重复点击节点的时候，将节点高亮去掉，并且更新highlightNodeList
      if (highlightNodeList.length === 1) {
        operateChart(event.dataIndex, "node", "downplay");
        highlightNodeList = [];
      } else {
        operateChart(event.dataIndex, "node", "downplay");
        highlightNodeList = [highlightNodeList[(pos + 1) % 2]];// 取pos对应的另一个节点
      }
    } else {
      if (highlightNodeList.length < 2) {
        // 点击第一个节点时，高亮点击的那个节点，点击第二个节点时，高亮新点击的节点
        highlightNodeList[highlightNodeList.length] = event.dataIndex;
        operateChart(event.dataIndex, "node", "highlight");
      } else {
        // 点击第三个节点时，将第一个节点高亮取消，并把第二个节点放到第一个位置上，为了后面的有向链接做准备
        operateChart(highlightNodeList[0], "node", "downplay");
        operateChart(event.dataIndex, "node", "highlight");
        highlightNodeList = [highlightNodeList[1], event.dataIndex];
      }
    }
    console.log(highlightNodeList);
  }
}

const operateChart = (dataIndex, dataType, action) => {
  // 高亮，根据数据类型和位置来高亮
  chartInstance.dispatchAction({
    type: action,
    seriesIndex: 0,
    dataType: dataType,
    dataIndex: dataIndex
  });
}

const siderVisible = ref(true) // 初始状态为显示\
const createNodeVisible = ref(false)

const echartsWidth = ref('100vh')

const toggleSider = () => {
  siderVisible.value = !siderVisible.value; // 切换侧边栏的显示状态
  echartsWidth.value = siderVisible.value ? `calc(100vw - ${270}px)` : '100vw';
  // 使用 nextTick 等待DOM更新完成后执行resize
  nextTick(() => {
    chartInstance.resize();
  })
}

// 观察echartsWidth的变化
// watch(echartsWidth, (newVal, oldVal) => {
//   if (newVal !== oldVal) {
//     // 确保只有在值真正改变时才调用resize
//     chartInstance.resize() // 执行echarts图表的resize方法
//   }
// })

const resizeChart = () => {
  chartInstance.resize();
}

const createNode = () => {
  siderVisible.value = true; // 切换侧边栏的显示状态
  echartsWidth.value = siderVisible.value ? `calc(100vw - ${270}px)` : '100vw';
  createNodeVisible.value = true;
  nextTick(() => {
    chartInstance.resize();
  });
}

const resetNewNode = () => {
  newNode.value = {
    "name": "",
    "des": "",
    "symbolSize": 50,
    "category": ""
  };
}

const jsonReactive = (x) => {
  return JSON.parse(JSON.stringify(x));
}

const createNodeSubmit = () => {
  chartData.value.series[0].data.push(jsonReactive(newNode.value));
  let categories = [...new Set(chartData.value.series[0].data.map((x) => {
    return x.category
  }))]; // 将类型去重
  chartData.value.series[0].categories = categories.map((x) => {
    return { "name": x }
  });
  chartData.value.legend[0].data = categories.map((x) => {
    return x
  });
  chartInstance.setOption(chartData.value);
  createNodeVisible.value = false;
  resetNewNode();
}

// const resetNewNode = () => {}

// document.getElementById("createNodeFieldForm").addEventListener("submit", (event) => {
//   // 获取表单内的所有控件
//   event.preventDefault();
//   console.log("haha");
//   console.log(this["nodeNameField"].value);
//   // dialogCreateEdge.style.display = "none"; // 当表单提交时，关闭弹窗

//   // const formData = new FormData();
//   // formData.append("highlightNode", JSON.stringify(highlightInstance.highlightNodeList));
//   // formData.append("createEdge", JSON.stringify({
//   //   name: this['edgeNameField'].value,
//   //   des: this['edgeDescribeField'].value
//   // }));
//   // sendData(formData, chartInstance);
//   // highlightInstance.reset();
// });

const createSide = () => {
  chartInstance.resize();
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
  align-items: center;
  /* 垂直居中 */
  justify-content: center;
  /* 水平居中 */
  -webkit-app-region: drag;
  /* 可拖动 */
  background-color: #f5f5f5;
  width: 100%;
  height: 53px !important;
  font: 13px sans-serif;
  border-bottom: 1px solid rgba(5, 5, 5, 0.06);

}

.no-move-button {
  -webkit-app-region: no-drag;
}

.footer-style {
  padding: 0 !important;
  text-align: center;
  background-color: #f5f5f5;
  height: 33px !important;
  border-top: 1px solid rgba(5, 5, 5, 0.06);
}

.sider-style {
  text-align: center;
  line-height: 50px;
  width: 270px !important;
  max-width: 270px !important;
  min-width: 270px !important;
  background-color: #f5f5f5 !important;
}

.form-style {
  background-color: #f5f5f5 !important;
}

.form-style input {
  width: 200px !important;
  max-width: 200px !important;
  min-width: 200px !important;
  height: 30px !important;
}

.form-style button {
  height: 30px !important;
  background-color: #0d5bc6 !important;
  color: #ffffff;
}
</style>
