<template>
  <a-space direction="vertical" :style="{ width: '100%' }" :size="[0, 48]">
    <a-layout style="height: 100vh">
      <a-layout-header :style="headerStyle" class="move-show">
        <a-layout>

          <XkMenu v-model:shortcutActive="shortcutActive"
                  v-model:shortcutWatch="shortcutWatch"
                  v-model:filePath="filePath"

                  v-model:xkContext="xkContext"></XkMenu>

          <a-layout-content :style="headerStyle" class="move-show">
            <a-button class="no-move-button" @click="createNode">创建节点</a-button>
            <a-button class="no-move-button" @click="deleteNode">删除节点</a-button>
            <a-button class="no-move-button" @click="createEdge">创建连接</a-button>
            <a-button class="no-move-button" @click="deleteEdge">删除连接</a-button>
            <a-button class="no-move-button" @click="toggleSider">编辑框</a-button>
            <!-- 控制按钮 -->
          </a-layout-content>

        </a-layout>
      </a-layout-header>
      <a-layout>
        <a-layout-content :style="contentStyle">
          <div :style="echartsStyle" ref="chartDom"></div>
        </a-layout-content>
        <a-layout-sider v-show="siderVisible" class="sider-style">

          <a-space v-show="xkContext.errorMessage !== ''" direction="vertical" style="width: 80%">
            <a-alert :message="xkContext.errorMessage" type="error" />
          </a-space>

          <XkCreateNode v-show="createNodeVisible"
                        v-model:newNode="newNode"
                        v-model:categoryItems="categoryItems"
                        v-model:categoryName="categoryName"
                        v-model:currentNode="currentNode"

                        v-model:xkContext="xkContext"></XkCreateNode>

          <XkCurrentNode v-show="currentNodeVisible"
                         v-model:currentNode="currentNode"
                         v-model:categoryItems="categoryItems"
                         v-model:categoryName="categoryName"
                         v-model:currentNodeDataIndex="currentNodeDataIndex"

                         v-model:xkContext="xkContext"></XkCurrentNode>

          <XkCreateEdge v-show="createEdgeVisible"
                        v-model:newEdge="newEdge"
                        v-model:highlightNodeList="highlightNodeList"

                        v-model:xkContext="xkContext"></XkCreateEdge>

          <XkCurrentEdge v-show="currentEdgeVisible"
                         v-model:currentEdge="currentEdge"
                         v-model:currentEdgeDataIndex="currentEdgeDataIndex"

                         v-model:xkContext="xkContext"></XkCurrentEdge>

        </a-layout-sider>
      </a-layout>
      <a-layout-footer class="footer-style" v-show=false>Footer</a-layout-footer>
    </a-layout>
  </a-space>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from "vue";
import * as echarts from "echarts";
import { jsonReactive, resetEdgeRef, resetNodeRef } from "../utils/XkUtils";

import XkCreateNode from "../components/XkCreateNode.vue";
import XkCurrentNode from "../components/XkCurrentNode.vue";
import XkCreateEdge from "../components/XkCreateEdge.vue";
import XkCurrentEdge from "../components/XkCurrentEdge.vue";
import XkMenu from "../components/XkMenu.vue";

const xkContext = ref({
  "errorMessage": "",
  "chartData": null,
  "updateChart": false,
  "historyList": [], // 记录历史
  "historySequenceNumber": -1 // HSN：历史操作对应的目前的位置
});

const echartsWidth = ref("100vh");
const siderVisible = ref(true); // 初始状态为显示

const createNodeVisible = ref(false);
const newNode = ref({
  "name": "",
  "des": "",
  "symbolSize": 50,
  // placeholder 只有在 value = undefined 才会显示
  "category": undefined
});

const currentNodeVisible = ref(false);
const currentNode = ref({
  "name": "",
  "des": "",
  "symbolSize": 50,
  "category": ""
});
const currentNodeDataIndex = ref(-1); // todo 这块有一个优化，可以和highlightNodeList合并，相当于highlightNodeList的最后一个值，不确定能不能替换，替换之后如果highlightNodeList中没有节点，会有问题？

const createEdgeVisible = ref(false);
const newEdge = ref({
  "source": "",
  "target": "",
  "name": "",
  "des": ""
});

const currentEdgeVisible = ref(false);
const currentEdge = ref({
  "source": "",
  "target": "",
  "name": "",
  "des": ""
});
const currentEdgeDataIndex = ref(-1);

// 新增时的类目
const categoryItems = ref([]);
const categoryName = ref();

// 基于准备好的dom，初始化echarts实例
const chartDom = ref(null);
let chartInstance = null;

const highlightNodeList = ref([]); // 高亮节点记录
let highlightEdge = null;

const filePath = ref("");
const shortcutActive = ref("");
const shortcutWatch = ref(false);

onMounted(async () => {
  // 调用渲染图表逻辑
  window.addEventListener("resize", resizeChart);
  window.addEventListener("keydown", shortcut);
});

window.electronAPI.receiveData((data) => {
  xkContext.value.chartData = JSON.parse(data.value);
  filePath.value = data.path;
  console.log(data.path);
  // 图表初始化
  console.log("option");
  // 基于准备好的dom，初始化echarts实例
  if (chartDom.value) {
    // 初始化 ECharts 图表
    chartInstance = echarts.init(chartDom.value);
    if (xkContext.value.chartData) {
      // 使用刚指定的配置项和数据显示图表。
      xkContext.value.updateChart = true;
      chartInstance.on("click", clickChart);
    }
  }
});

watch(() => xkContext.value.updateChart, () => {
  // 自动监听，刷新图表
  // 保证chartInstance在当前文件中
  console.log("updateChart", xkContext.value.updateChart);
  // 让操作变重了，但是为了后面文件拆分做准备
  if (xkContext.value.updateChart) {
    // 更新图例，比如节点类别
    // 生成类目和图例
    let categories = [...new Set(xkContext.value.chartData.series[0].data.map((x) => {
      return x.category;
    }))]; // 将类型去重
    xkContext.value.chartData.series[0].categories = categories.map((x) => {
      return { "name": x };
    });
    xkContext.value.chartData.legend[0].data = categories.map((x) => {
      return x;
    });
    // 增加水印
    xkContext.value.chartData.graphic = [
      {
        "type": "text",
        "left": "center",
        "bottom": "5%",
        "style": {
          "fill": "rgba(0,0,0,1)",
          "text": "By XKnowledge",
          "font": "bold 18px sans-serif"
        }
      }
    ];
    // 提示框的配置
    xkContext.value.chartData.tooltip = {
      formatter: function(x) {
        return x.data.des;
      }
    };
    // 更新选择下拉框类目
    categoryItems.value = categories;
    chartInstance.setOption(xkContext.value.chartData);
    xkContext.value.updateChart = false;
  }
});

watch(shortcutActive, () => {
  resetSider();
  resetRefData();
});

const shortcut = (event) => {
  /**
   * 实现快捷键
   * 分为两个部分，一个部分是聚焦于编辑栏的时候，此时的redo和undo都是针对于输入的文字的
   * 当提交之后，聚焦于chart的时候，redo和undo就针对对图的修改进行操作。
   */
  const tagName = event.target.tagName;
  // 全局的快捷键
  if (event.ctrlKey && event.key === "s") {
    shortcutActive.value = "save_file";
    shortcutWatch.value = !shortcutWatch.value;
  }

  if (event.ctrlKey && event.key === "r") {
  }

  // 只有chart的快捷键
  if (tagName === "BODY") {
    if (event.key === "Insert") {
      shortcutActive.value = "insert";
      // shortcutWatch.value = !shortcutWatch.value;
      createNode();
    }

    if (event.key === "Delete") {
      shortcutActive.value = "delete";
      // shortcutWatch.value = !shortcutWatch.value;
      deleteNode();
    }

    if (event.ctrlKey && event.key === "z") {
      shortcutActive.value = "undo";
      shortcutWatch.value = !shortcutWatch.value;
    }

    if (event.ctrlKey && event.key === "y") {
      shortcutActive.value = "redo";
      shortcutWatch.value = !shortcutWatch.value;
    }
  }
};

const resetRefData = () => {
  /**
   * 重置各种ref，配合侧边栏显示一块用
   */
  resetNodeRef(newNode);
  resetEdgeRef(newEdge);
  currentNodeDataIndex.value = -1;
  resetNodeRef(currentNode);
  currentEdgeDataIndex.value = -1;
  resetEdgeRef(currentEdge);
};

const resetSider = () => {
  /**
   * 将侧边栏中显示的信息全部隐藏
   */
  xkContext.value.errorMessage = "";
  createNodeVisible.value = false;
  currentNodeVisible.value = false;
  createEdgeVisible.value = false;
  currentEdgeVisible.value = false;
};

const clickChart = event => {
  /**
   * 点击表格，产生事件，对事件进行响应
   */
  console.log(event);
  resetSider();
  if (event.dataType === "node") {
    currentNodeVisible.value = true;
    currentNode.value = jsonReactive(event.data); // 一定要用深拷贝
    newNode.value.symbolSize = currentNode.value.symbolSize;
    currentNodeDataIndex.value = event.dataIndex;
    console.log("currentNode", currentNode.value);

    const pos = highlightNodeList.value.indexOf(event.dataIndex);
    if (pos !== -1 && highlightNodeList.value.length !== 0) {
      // 当重复点击节点的时候，将节点高亮去掉，并且更新highlightNodeList
      if (highlightNodeList.value.length === 1) {
        operateChart(event.dataIndex, "node", "downplay");
        highlightNodeList.value = [];
      } else {
        operateChart(event.dataIndex, "node", "downplay");
        highlightNodeList.value = [highlightNodeList.value[(pos + 1) % 2]];// 取pos对应的另一个节点
      }
    } else {
      if (highlightNodeList.value.length < 2) {
        // 点击第一个节点时，高亮点击的那个节点，点击第二个节点时，高亮新点击的节点
        highlightNodeList.value[highlightNodeList.value.length] = event.dataIndex;
        operateChart(event.dataIndex, "node", "highlight");
      } else {
        // 点击第三个节点时，将第一个节点高亮取消，并把第二个节点放到第一个位置上，为了后面的有向链接做准备
        operateChart(highlightNodeList.value[0], "node", "downplay");
        operateChart(event.dataIndex, "node", "highlight");
        highlightNodeList.value = [highlightNodeList.value[1], event.dataIndex];
      }
    }
    console.log(highlightNodeList.value);
  } else if (event.dataType === "edge") {
    currentEdgeVisible.value = true;
    currentEdge.value = jsonReactive(event.data);
    currentEdgeDataIndex.value = event.dataIndex;

    if (highlightEdge === null) {
      highlightEdge = event.dataIndex;
      operateChart(highlightEdge, "edge", "highlight");
    } else {
      if (highlightEdge !== event.dataIndex) {
        operateChart(highlightEdge, "edge", "downplay");
        highlightEdge = event.dataIndex;
        operateChart(highlightEdge, "edge", "highlight");
      } else {
        operateChart(highlightEdge, "edge", "downplay");
        highlightEdge = null;
      }
    }
  }
};

const operateChart = (dataIndex, dataType, action) => {
  /**
   * 操作图表内的节点，根据数据类型和位置来高亮或者去除高亮
   */
  chartInstance.dispatchAction({
    type: action,
    seriesIndex: 0,
    dataType: dataType,
    dataIndex: dataIndex
  });
};

const resizeChart = () => {
  chartInstance.resize();
};

const toggleSider = () => {
  /**
   * 显示侧边栏
   */
  siderVisible.value = !siderVisible.value; // 切换侧边栏的显示状态
  echartsWidth.value = siderVisible.value ? `calc(100vw - ${270}px)` : "100vw";
  // 使用 nextTick 等待DOM更新完成后执行resize
  nextTick(resizeChart);
  if (!siderVisible.value) {
    // 收起编辑框，就可以重置图表
    for (let i = 0; i < highlightNodeList.value.length; i++) {
      operateChart(highlightNodeList.value[i], "node", "downplay");
    }
    operateChart(currentEdgeDataIndex.value, "edge", "downplay");

    resetRefData();
    resetSider();
  }
};

const createNode = () => {
  /**
   * 创建新节点
   */
  resetSider();
  siderVisible.value = true; // 切换侧边栏的显示状态
  echartsWidth.value = siderVisible.value ? `calc(100vw - ${270}px)` : "100vw";
  createNodeVisible.value = true;
  nextTick(resizeChart);
};

const deleteNode = () => {
  /**
   * 删除新节点
   */
  resetSider();
  if (currentNodeDataIndex.value >= 0) {
    const series = xkContext.value.chartData.series[0];

    xkContext.value.historySequenceNumber++;
    xkContext.value.historyList[xkContext.value.historySequenceNumber] = {
      "act": "deleteNode",
      "data": jsonReactive(series.data[currentNodeDataIndex.value]),
      "links": []
    };

    const oldName = series.data[currentNodeDataIndex.value].name;

    // 删除节点
    let data = [];
    let length = series.data.length;
    for (let i = 0; i < length; i++) {
      if (i !== currentNodeDataIndex.value) {
        data.push(series.data[i]);
      }
    }
    xkContext.value.chartData.series[0].data = data;

    // 删除节点所在的边
    let links = [];
    length = series.links.length;
    for (let i = 0; i < length; i++) {
      if (series.links[i].source !== oldName && series.links[i].target !== oldName) {
        links.push(series.links[i]);
      } else {
        xkContext.value.historyList[xkContext.value.historySequenceNumber].links.push(jsonReactive(series.links[i]));
      }
    }
    xkContext.value.chartData.series[0].links = links;
    xkContext.value.updateChart = true;
  }
  resetRefData();
};

const createEdge = () => {
  /**
   * 创建新连接
   */
  resetSider();
  siderVisible.value = true; // 切换侧边栏的显示状态
  echartsWidth.value = siderVisible.value ? `calc(100vw - ${270}px)` : "100vw";
  createEdgeVisible.value = true;
  nextTick(resizeChart);
};

const deleteEdge = () => {
  /**
   * 删除连接
   */
  if (currentEdgeDataIndex.value >= 0) {
    const series = xkContext.value.chartData.series[0];
    xkContext.value.historySequenceNumber++;
    xkContext.value.historyList[xkContext.value.historySequenceNumber] = {
      "act": "deleteEdge",
      "data": jsonReactive(series.links[currentEdgeDataIndex.value])
    };

    // 删除连接
    let links = [];
    let length = series.links.length;
    for (let i = 0; i < length; i++) {
      if (i !== currentEdgeDataIndex.value) {
        links.push(series.links[i]);
      }
    }
    xkContext.value.chartData.series[0].links = links;
    xkContext.value.updateChart = true;
  }
  resetSider();
  resetRefData();
};

const headerStyle = {
  textAlign: "center",
  height: 50,
  paddingInline: 50,
  lineHeight: "64px",
  backgroundColor: "#f5f5f5"
};

const contentStyle = {
  textAlign: "center",
  minHeight: 120,
  lineHeight: "120px",
  backgroundColor: "#ffffff",
  width: echartsWidth.value,
  height: "calc(100vh - 86px)"
};

const echartsStyle = {
  width: "100%",
  height: "100%"
};

</script>

<style>
.echarts-style {
  width: 100%;
  height: 100%;
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
  overflow-y: scroll; /* 添加垂直滚动条 */
  overflow-x: hidden; /* 隐藏水平滚动条 */
  box-sizing: border-box; /* 使宽度包括内容、内边距和边框 */
}

/* 针对Webkit内核浏览器的滚动条样式 */
.sider-style::-webkit-scrollbar {
  width: 5px; /* 设置滚动条的宽度为2px */
}

/* 滚动条轨道的样式 */
.sider-style::-webkit-scrollbar-track {
  background-color: transparent; /* 轨道颜色，可以设置为透明或你想要的颜色 */
}

/* 滚动条滑块的样式 */
.sider-style::-webkit-scrollbar-thumb {
  background-color: #888; /* 滑块颜色，可以设置为你想要的颜色 */
}

/* 解决框架本身获取高度错误而显示进度条Bug */
.ant-layout .ant-layout-sider-children {
  height: calc(100% - 33px);
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
