<template>
  <a-space direction="vertical" :style="{ width: '100%' }" :size="[0, 48]">
    <a-layout style="height: 100vh">
      <a-layout-header :style="headerStyle" class="move-show">
        <a-button class="no-move-button" @click="createNode">创建节点</a-button>
        <a-button class="no-move-button" @click="deleteNode">删除节点</a-button>
        <a-button class="no-move-button" @click="createEdge">创建连接</a-button>
        <a-button class="no-move-button" @click="deleteEdge">删除连接</a-button>
        <a-button class="no-move-button" @click="toggleSider">编辑框</a-button>
        <!-- 控制按钮 -->
      </a-layout-header>
      <a-layout>
        <a-layout-content :style="contentStyle">
          <div id="chart" :style="echartsStyle"></div>
        </a-layout-content>
        <a-layout-sider v-show="siderVisible" class="sider-style">

          <a-space v-show="errorMessageVisible" direction="vertical" style="width: 100%">
            <a-alert :message="errorMessage" type="error" />
          </a-space>

          <a-form v-show="createNodeVisible">
            <a-form-item label="名称">
              <a-textarea v-model:value="newNode.name" />
            </a-form-item>
            <a-form-item label="描述">
              <a-textarea v-model:value="newNode.des" />
            </a-form-item>
            <a-form-item label="所属类目">
              <a-select v-model:value="newNode.category" placeholder="请选择类目" style="width: 200px"
                        :options="categoryItems.map(item => ({ value: item }))">
                <template #dropdownRender="{ menuNode: menu }">
                  <v-nodes :vnodes="menu" />
                  <a-divider style="margin: 4px 0" />
                  <a-space style="padding: 4px 8px">
                    <a-input ref="inputRef" v-model:value="categoryName" placeholder="类目名" />
                    <a-button type="text" @click="addCategory">
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
              <a-input-number v-model:value="newNode.symbolSize" :min="1" :max="100" />
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
            <a-form-item label="所属类目">
              <a-select v-model:value="currentNode.category" placeholder="请选择类目" style="width: 200px"
                        :options="categoryItems.map(item => ({ value: item }))">
                <template #dropdownRender="{ menuNode: menu }">
                  <v-nodes :vnodes="menu" />
                  <a-divider style="margin: 4px 0" />
                  <a-space style="padding: 4px 8px">
                    <a-input ref="inputRef" v-model:value="categoryName" placeholder="类目名" />
                    <a-button type="text" @click="addCategory">
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

          <a-form v-show="createEdgeVisible">
            <a-form-item label="名称">
              <a-textarea v-model:value="newEdge.name" />
            </a-form-item>
            <a-form-item label="描述">
              <a-textarea v-model:value="newEdge.des" />
            </a-form-item>
            <a-form-item>
              <a-button @click="createEdgeSubmit">创建连接</a-button>
            </a-form-item>
          </a-form>

          <a-form v-show="currentEdgeVisible">
            <a-form-item label="名称">
              <a-textarea v-model:value="currentEdge.name" />
            </a-form-item>
            <a-form-item label="描述">
              <a-textarea v-model:value="currentEdge.des" />
            </a-form-item>
            <a-form-item>
              <a-button @click="currentEdgeSubmit">修改连接</a-button>
            </a-form-item>
          </a-form>

        </a-layout-sider>
      </a-layout>
      <a-layout-footer class="footer-style" v-show=false>Footer</a-layout-footer>
    </a-layout>
  </a-space>
</template>

<script setup>
import { nextTick, defineComponent, onMounted, ref } from "vue";
import * as echarts from "echarts";
// import createOption from "../utils/myOption.ts";

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
  "category": ""
});

const currentNodeVisible = ref(false);
const currentNode = ref({
  "name": "",
  "des": "",
  "symbolSize": 50,
  "category": ""
});
let currentNodeDataIndex = -1; // todo 这块有一个优化，可以和highlightNodeList合并，相当于highlightNodeList的最后一个值，不确定能不能替换，替换之后如果highlightNodeList中没有节点，会有问题？

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
let currentEdgeDataIndex = -1;

const VNodes = defineComponent({
  props: {
    vnodes: {
      type: Object,
      required: true
    }
  },
  render() {
    return this.vnodes;
  }
});

// 新增时的类目
const categoryItems = ref([]);
const inputRef = ref();
const categoryName = ref();
const addCategory = e => {
  e.preventDefault();
  console.log(categoryName.value);
  if (categoryName.value) {
    currentNode.value.category = categoryName.value;
    const pos = categoryItems.value.indexOf(categoryName.value);
    if (pos === -1) {
      categoryItems.value.push(categoryName.value);
    }
  }
  categoryName.value = "";
  setTimeout(() => {
    inputRef.value?.focus();
  }, 0);
};

// 基于准备好的dom，初始化echarts实例
let chartDom = null;
let chartInstance = null;
let highlightNodeList = []; // 高亮节点记录

let highlightEdge = null;

let history = []; // 记录历史
let history_sequence_number = -1; // HSN：历史操作对应的目前的位置

onMounted(async () => {
  // 获取数据
  // chartData.value = createOption();
  // 调用渲染图表逻辑

  window.addEventListener("resize", resizeChart);
  window.addEventListener("keydown", shortcut);
});

window.electronAPI.receiveData((data) => {
  chartData.value = JSON.parse(data.value);
  console.log(data.path);
  // 初始化下拉框类目
  updateLegend(); // 复用了函数里面的种类去重，并且这样做不影响加载，因为getChart就已经加载完了
  getChart(chartData.value);
});

const shortcut = (event) => {
  if (event.ctrlKey && event.key === "s") {
    console.log("save file");
  }

  if (event.ctrlKey && event.key === "r") {
  }

  if (event.key === "Insert") {
    createNode();
  }

  if (event.key === "Delete") {
    deleteNode();
  }

  if (event.ctrlKey && event.key === "z") {
    undo();
  }

  if (event.ctrlKey && event.key === "y") {
    console.log("redo");
    redo();
  }
};

const undo = () => {

};

const redo = () => {

};

const resetSider = () => {
  errorMessageVisible.value = false;
  createNodeVisible.value = false;
  currentNodeVisible.value = false;
  createEdgeVisible.value = false;
  currentEdgeVisible.value = false;
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
    newNode.value.symbolSize = currentNode.value.symbolSize;
    currentNodeDataIndex = event.dataIndex;
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
  } else if (event.dataType === "edge") {
    currentEdgeVisible.value = true;
    currentEdge.value = event.data;
    currentEdgeDataIndex = event.dataIndex;

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

const refreshChart = () => {
  chartInstance.setOption(chartData.value);
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
    for (let i = 0; i < highlightNodeList.length; i++) {
      operateChart(highlightNodeList[i], "node", "downplay");
    }
    currentNodeDataIndex = -1;
    operateChart(currentEdgeDataIndex, "edge", "downplay");
    currentEdgeDataIndex = -1;
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
  resetError();
  nextTick(resizeChart);
};

const deleteNode = () => {
  /**
   * 删除新节点
   */
  resetSider();
  resetError();
  if (currentNodeDataIndex >= 0) {
    const series = chartData.value.series[0];

    history_sequence_number++;
    history[history_sequence_number] = {
      "act": "deleteNode",
      "data": jsonReactive(series.data[currentNodeDataIndex]),
      "links": []
    };

    const oldName = series.data[currentNodeDataIndex].name;

    // 删除节点
    let data = [];
    let length = series.data.length;
    for (let i = 0; i < length; i++) {
      if (i !== currentNodeDataIndex) {
        data.push(series.data[i]);
      }
    }
    chartData.value.series[0].data = data;

    // 删除节点所在的边
    let links = [];
    length = series.links.length;
    for (let i = 0; i < length; i++) {
      if (series.links[i].source !== oldName && series.links[i].target !== oldName) {
        links.push(series.links[i]);
      } else {
        history[history_sequence_number].links.push(jsonReactive(series.links[i]));
      }
    }
    chartData.value.series[0].links = links;

    console.log("chartData");
    console.log(chartData.value);

    updateLegend();
    refreshChart();
  }
  currentNodeDataIndex = -1;
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
  categoryItems.value = categories;
};

const createNodeSubmit = () => {
  /**
   * 响应创建新节点的提交
   */
  const names = chartData.value.series[0].data.map((x) => {
    return x.name;
  });
  if (names.indexOf(newNode.value.name) === -1) {
    const newNodeJson = jsonReactive(newNode.value);
    chartData.value.series[0].data.push(newNodeJson);
    history_sequence_number++;
    history[history_sequence_number] = {
      "act": "createNode",
      "data": newNodeJson
    };
    updateLegend();
    refreshChart();
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
  const oldName = names[currentNodeDataIndex];
  const newName = currentNode.value.name;
  const currentNodeJson = jsonReactive(currentNode.value);
  history_sequence_number++;
  history[history_sequence_number] = {
    "act": "changeNode",
    "old": jsonReactive(chartData.value.series[0].data[currentNodeDataIndex]),
    "new": currentNodeJson
  };

  if (oldName !== newName) {
    // 修改节点的时候修改了节点名称
    // names.slice(0, currentNodeDataIndex).push(...names.slice(currentNodeDataIndex + 1)); // 去掉旧节点名称
    // 思考：为什么不需要去掉旧的节点名称？因为本身就不重名，所以不用去掉
    // 思考：两个if是否可以合并？不可以合并，因为第二个if还有else分支
    if (names.indexOf(newName) === -1) {
      // 判断修改完的名称是否重名
      chartData.value.series[0].data[currentNodeDataIndex] = currentNodeJson;

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

      updateLegend();
      refreshChart();
      resetError();
    } else {
      setError("不能创建同名节点");
    }
  } else {
    // 修改节点时没有修改节点名称
    chartData.value.series[0].data[currentNodeDataIndex] = currentNodeJson;
    updateLegend();
    refreshChart();
    resetError();
  }
};

const resetNewEdge = () => {
  newEdge.value = {
    "source": "",
    "target": "",
    "name": "",
    "des": ""
  };
};

const createEdge = () => {
  /**
   * 创建新连接
   */
  resetSider();
  siderVisible.value = true; // 切换侧边栏的显示状态
  echartsWidth.value = siderVisible.value ? `calc(100vw - ${270}px)` : "100vw";
  createEdgeVisible.value = true;
  resetError();
  nextTick(resizeChart);
};

const createEdgeSubmit = () => {
  /**
   * 响应创建新连接的提交
   */
  if (highlightNodeList.length === 2) {
    const data = chartData.value.series[0].data;
    newEdge.value.source = data[highlightNodeList[0]].name;
    newEdge.value.target = data[highlightNodeList[1]].name;
    const newEdgeJson = jsonReactive(newEdge.value);
    history_sequence_number++;
    history[history_sequence_number] = {
      "act": "createEdge",
      "data": newEdgeJson
    };
    chartData.value.series[0].links.push(newEdgeJson);
    refreshChart();
    resetError();
    resetNewEdge();
  } else {
    setError("请选中2个节点");
  }
};

const currentEdgeSubmit = () => {
  /**
   * 实现连接的动态修改
   */
  resetError();
  const currentEdgeJson = jsonReactive(currentEdge.value);
  history_sequence_number++;
  history[history_sequence_number] = {
    "act": "changeEdge",
    "old": jsonReactive(chartData.value.series[0].links[currentEdgeDataIndex]),
    "new": currentEdgeJson
  };
  chartData.value.series[0].links[currentEdgeDataIndex] = currentEdgeJson;
  console.log(history);
  refreshChart();
};

const deleteEdge = () => {
  /**
   * 删除连接
   */
  resetSider();
  resetError();
  if (currentEdgeDataIndex >= 0) {
    const series = chartData.value.series[0];
    history_sequence_number++;
    history[history_sequence_number] = {
      "act": "deleteEdge",
      "data": jsonReactive(series.links[currentEdgeDataIndex])
    };

    // 删除连接
    let links = [];
    let length = series.links.length;
    for (let i = 0; i < length; i++) {
      if (i !== currentEdgeDataIndex) {
        links.push(series.links[i]);
      }
    }
    chartData.value.series[0].links = links;
    refreshChart();
  }
  currentEdgeDataIndex = -1;
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
  // height: "calc(100vh - 86px)"
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
