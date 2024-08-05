<template>
  <a-space direction="vertical" :style="{ width: '100%' }" :size="[0, 48]">
    <a-layout style="height: 100vh">
      <a-layout-header :style="headerStyle" class="move-show">
        <a-button class="no-move-button" @click="createNode">创建节点</a-button>
        <a-button class="no-move-button" @click="createEdge">创建边</a-button>
        <a-button class="no-move-button" @click="toggleSider">编辑框</a-button>
        <!-- 控制按钮 -->
      </a-layout-header>
      <a-layout>
        <a-layout-content :style="contentStyle">
          <div id="chart" :style="echartsStyle"></div>
        </a-layout-content>
        <a-layout-sider v-show="siderVisible" class="sider-style">

          <a-space v-show="errorMessageVisible" direction="vertical" style="width: 80%">
            <a-alert :message="errorMessage" type="error" />
          </a-space>

          <a-form v-show="createNodeVisible">
            <a-form-item label="名称">
              <a-textarea v-model:value="newNode.name" />
            </a-form-item>
            <a-form-item label="描述">
              <a-textarea v-model:value="newNode.des" />
            </a-form-item>
            <a-form-item label="类目">
              <a-select
                v-model:value="newNode.category"
                placeholder="请选择类目"
                style="width: 200px"
                :options="items.map(item => ({ value: item }))"
              >
                <template #dropdownRender="{ menuNode: menu }">
                  <v-nodes :vnodes="menu" />
                  <a-divider style="margin: 4px 0" />
                  <a-space style="padding: 4px 8px">
                    <a-input ref="inputRef" v-model:value="name" placeholder="类目名称" />
                    <a-button type="text" @click="addItem">
                      <template #icon>
                        <plus-outlined />
                      </template>
                      新增类目
                    </a-button>
                  </a-space>
                </template>
              </a-select>
            </a-form-item>
            <a-form-item label="节点大小">
              <a-input-number v-model:value="currentNode.symbolSize" :min="1" :max="100" />
            </a-form-item>
            <a-form-item>
              <a-button @click="createNodeSubmit">创建节点</a-button>
            </a-form-item>
          </a-form>

          <a-form v-show="currentNodeVisible">
            <a-form-item label="名称">
              <a-textarea v-model:value="currentNode.name" />
            </a-form-item>
            <a-form-item label="描述">
              <a-textarea v-model:value="currentNode.des" />
            </a-form-item>
            <a-form-item label="类目">
              <a-select
                v-model:value="currentNode.category"
                placeholder="请选择类目"
                style="width: 200px"
                :options="items.map(item => ({ value: item }))"
              >
                <template #dropdownRender="{ menuNode: menu }">
                  <v-nodes :vnodes="menu" />
                  <a-divider style="margin: 4px 0" />
                  <a-space style="padding: 4px 8px">
                    <a-input ref="inputRef" v-model:value="name" placeholder="类目名称" />
                    <a-button type="text" @click="addItem">
                      <template #icon>
                        <plus-outlined />
                      </template>
                      新增类目
                    </a-button>
                  </a-space>
                </template>
              </a-select>
            </a-form-item>
            <a-form-item label="节点大小">
              <a-input-number v-model:value="currentNode.symbolSize" :min="1" :max="100" />
            </a-form-item>
            <a-form-item>
              <a-button @click="currentNodeSubmit">修改节点</a-button>
            </a-form-item>
          </a-form>

        </a-layout-sider>
      </a-layout>
      <a-layout-footer class="footer-style">Footer</a-layout-footer>
    </a-layout>
  </a-space>
</template>

<script setup>
import { nextTick, defineComponent, onMounted, ref } from "vue";
import * as echarts from "echarts";
import createOption from "../utils/myOption.ts";

const chartData = ref();

const errorMessageVisible = ref(false);
const errorMessage = ref("");

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
let currentDataIndex;

const VNodes = defineComponent({
  props: {
    vnodes: {
      type: Object,
      required: true,
    },
  },
  render() {
    return this.vnodes;
  },
});

let index = 0;
// 新增时的类目
const items = ref([]);
const inputRef = ref();
const name = ref();
const addItem = e => {
  e.preventDefault();
  console.log('addItem');
  items.value.push(name.value || `New item ${(index += 1)}`);
  name.value = '';
  setTimeout(() => {
    inputRef.value?.focus();
  }, 0);
};

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
  window.addEventListener("resize", resizeChart);
  // 初始化下拉框类目
  updateLegend();
});

const resetSider = () => {
  errorMessageVisible.value = false;
  createNodeVisible.value = false;
  currentNodeVisible.value = false;
};

const getChart = (option) => {
  /**
   * 图表初始化
   */
  console.log("option");

  // 基于准备好的dom，初始化echarts实例
  chartDom = document.getElementById("chart");
  console.log(option);
  if (!chartDom) {
    console.error("chart图表容器不存在，请检查HTML代码！");
  } else {
    // 初始化 ECharts 图表
    chartInstance = echarts.init(chartDom);
    if (!option) {
      console.error("图表信息为空，请联系管理员！");
    } else {
      // 使用刚指定的配置项和数据显示图表。
      chartInstance.setOption(option);

      chartInstance.on("click", clickChart);
    }
  }
};

const clickChart = event => {
  /**
   * 点击表格，产生事件，对事件进行响应
   */
  console.log(event);
  resetSider();
  if (event.dataType === "node") {
    currentNodeVisible.value = true;
    currentNode.value = event.data;
    currentDataIndex = event.dataIndex;
    console.log(currentNode);

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
};

const createNode = () => {
  /**
   * 创建新节点
   */
  resetSider();
  siderVisible.value = true; // 切换侧边栏的显示状态
  echartsWidth.value = siderVisible.value ? `calc(100vw - ${270}px)` : "100vw";
  createNodeVisible.value = true;
  resetError();
  nextTick(resizeChart);
};

const resetNewNode = () => {
  newNode.value = {
    "name": "",
    "des": "",
    "symbolSize": 50,
    "category": ""
  };
};

const resetError = () => {
  errorMessageVisible.value = false;
  errorMessage.value = "";
};

const setError = (message) => {
  errorMessageVisible.value = true;
  errorMessage.value = message;
};

const jsonReactive = (x) => {
  return JSON.parse(JSON.stringify(x));
};

const updateLegend = () => {
  /**
   * 更新图例，比如节点类别
   */
  let categories = [...new Set(chartData.value.series[0].data.map((x) => {
    return x.category;
  }))]; // 将类型去重
  chartData.value.series[0].categories = categories.map((x) => {
    return { "name": x };
  });
  chartData.value.legend[0].data = categories.map((x) => {
    return x;
  });
  // 更新选择下拉框类目
  items.value = categories;
};

const createNodeSubmit = () => {
  if (
    newNode.value.category === undefined ||
    newNode.value.category === null ||
    newNode.value.category === '' ||
    newNode.value.category.length === 0
  ) {
    setError('该节点所属类目错误')
    // 如果不 return 会导致每次都会创建一个空类目
    return
  }
  /**
   * 响应创建新节点的提交
   */
  const names = chartData.value.series[0].data.map((x) => {
    return x.name;
  });
  if (names.indexOf(newNode.value.name) === -1) {
    chartData.value.series[0].data.push(jsonReactive(newNode.value));
    updateLegend();
    chartInstance.setOption(chartData.value);
    resetError();
    resetNewNode();
  } else {
    setError("不能创建同名节点");
  }
};

const currentNodeSubmit = () => {
  /**
   * 实现节点的动态修改
   */
  let names = chartData.value.series[0].data.map((x) => {
    return x.name;
  });
  const oldName = names[currentDataIndex];
  const newName = currentNode.value.name;

  if (oldName !== newName) {
    names.slice(0, currentDataIndex).push(...names.slice(currentDataIndex + 1)); // 去掉旧节点名称
    if (names.indexOf(newName) === -1) {
      chartData.value.series[0].data[currentDataIndex] = jsonReactive(currentNode.value);
      updateLegend();

      // 修改新节点所在的边
      const links = chartData.value.series[0].links;
      const length = links.length;
      for (let i = 0; i < length; i++) {
        if (links[i].source === oldName) {
          chartData.value.series[0].links[i].source = newName;
        }
        if (links[i].target === oldName) {
          chartData.value.series[0].links[i].target = newName;
        }
      }

      chartInstance.setOption(chartData.value);
      resetError();
    } else {
      setError("不能创建同名节点");
    }
  } else {
    chartData.value.series[0].data[currentDataIndex] = jsonReactive(currentNode.value);
    updateLegend();
    chartInstance.setOption(chartData.value);
    resetError();
  }
};

const createEdge = () => {
  resizeChart();
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
  // width: echartsWidth.value,
  // height: 'calc(100vh - 86px)'
};

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
