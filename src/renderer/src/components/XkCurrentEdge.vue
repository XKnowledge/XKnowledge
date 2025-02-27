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
import { jsonReactive } from '../utils/XkUtils'

const currentEdge = defineModel('currentEdge')
const currentEdgeDataIndex = defineModel('currentEdgeDataIndex')

const xkContext = defineModel('xkContext')

const currentEdgeSubmit = () => {
  /**
   * 实现连接的动态修改
   */
  const currentEdgeJson = jsonReactive(currentEdge.value)
  xkContext.value.historyList[xkContext.value.historySequenceNumber + 1] = {
    'act': 'changeEdge',
    'old': jsonReactive(xkContext.value.chartData.series[0].links[currentEdgeDataIndex.value]),
    'new': currentEdgeJson
  }
  xkContext.value.historySequenceNumber++
  xkContext.value.chartData.series[0].links[currentEdgeDataIndex.value] = currentEdgeJson
  xkContext.value.updateChart = !xkContext.value.updateChart
  xkContext.value.errorMessage = ''
}
</script>

<style scoped>

</style>
