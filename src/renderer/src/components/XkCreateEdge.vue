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

const xkContext = defineModel("xkContext");

const createEdgeSubmit = () => {
  /**
   * 响应创建新连接的提交
   */
  if (highlightNodeList.value.length === 2) {
    const data = xkContext.value.chartData.series[0].data;
    newEdge.value.source = data[highlightNodeList.value[0]].name;
    newEdge.value.target = data[highlightNodeList.value[1]].name;
    const newEdgeJson = jsonReactive(newEdge.value);
    xkContext.value.historyList[xkContext.value.historySequenceNumber + 1] = {
      "act": "createEdge",
      "data": newEdgeJson
    };
    xkContext.value.historySequenceNumber++;
    xkContext.value.chartData.series[0].links.push(newEdgeJson);
    xkContext.value.updateChart = true;
    xkContext.value.errorMessage = "";
    resetEdgeRef(newEdge);
  } else {
    xkContext.value.errorMessage = "请选中2个节点";
  }
};
</script>

<style scoped>

</style>
