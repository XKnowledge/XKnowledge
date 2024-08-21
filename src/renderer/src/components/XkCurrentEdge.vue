<template>
  <a-form>
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
</template>

<script setup>
import { jsonReactive } from "../utils/XkUtils";

const currentEdge = defineModel("currentEdge");
const currentEdgeDataIndex = defineModel("currentEdgeDataIndex");

const errorMessage = defineModel("errorMessage");
const chartData = defineModel("chartData");
const updateChart = defineModel("updateChart");
const historySequenceNumber = defineModel("historySequenceNumber");
const history = defineModel("history");

const currentEdgeSubmit = () => {
  /**
   * 实现连接的动态修改
   */
  const currentEdgeJson = jsonReactive(currentEdge.value);
  history.value[historySequenceNumber.value + 1] = {
    "act": "changeEdge",
    "old": jsonReactive(chartData.value.series[0].links[currentEdgeDataIndex.value]),
    "new": currentEdgeJson
  };
  historySequenceNumber.value++;
  chartData.value.series[0].links[currentEdgeDataIndex.value] = currentEdgeJson;
  updateChart.value = true;
  errorMessage.value = "";
};
</script>

<style scoped>

</style>
