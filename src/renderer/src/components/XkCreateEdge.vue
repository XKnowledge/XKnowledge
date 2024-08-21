<template>
  <a-form>
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
</template>

<script setup>
import { jsonReactive, resetEdgeRef } from "../utils/XkUtils";

const newEdge = defineModel("newEdge");
const highlightNodeList = defineModel("highlightNodeList");

const errorMessage = defineModel("errorMessage");
const chartData = defineModel("chartData");
const updateChart = defineModel("updateChart");
const historySequenceNumber = defineModel("historySequenceNumber");
const history = defineModel("history");

const createEdgeSubmit = () => {
  /**
   * 响应创建新连接的提交
   */
  if (highlightNodeList.value.length === 2) {
    const data = chartData.value.series[0].data;
    newEdge.value.source = data[highlightNodeList.value[0]].name;
    newEdge.value.target = data[highlightNodeList.value[1]].name;
    const newEdgeJson = jsonReactive(newEdge.value);
    history.value[historySequenceNumber.value + 1] = {
      "act": "createEdge",
      "data": newEdgeJson
    };
    historySequenceNumber.value++;
    chartData.value.series[0].links.push(newEdgeJson);
    updateChart.value = true;
    errorMessage.value = "";
    resetEdgeRef(newEdge);
  } else {
    errorMessage.value = "请选中2个节点";
  }
};
</script>

<style scoped>

</style>
