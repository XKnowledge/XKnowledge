<template>
  <a-form layout="vertical">
    <a-form-item :label="$t('common.name')">
      <a-textarea v-model:value="currentEdge.name" />
    </a-form-item>
    <a-form-item :label="$t('common.description')">
      <a-textarea v-model:value="currentEdge.des" />
    </a-form-item>
    <a-form-item>
      <a-button @click="currentEdgeSubmit">{{ $t('edge.submit') }} </a-button>
    </a-form-item>
  </a-form>
</template>

<script setup>
import { addHistory, jsonReactive } from '../utils/XkUtils'

const currentEdge = defineModel('currentEdge', { type: Object })
const currentEdgeDataIndex = defineModel('currentEdgeDataIndex', { type: Number })

const xkContext = defineModel('xkContext', { type: Object })

const currentEdgeSubmit = () => {
  /**
   * 实现连接的动态修改
   */
  const currentEdgeJson = jsonReactive(currentEdge.value)
  addHistory(xkContext, {
    act: 'changeEdge',
    old: jsonReactive(xkContext.value.chartData.links[currentEdgeDataIndex.value]),
    new: currentEdgeJson
  })
  xkContext.value.chartData.links[currentEdgeDataIndex.value] = currentEdgeJson
  xkContext.value.updateChart = !xkContext.value.updateChart
  xkContext.value.errorMessage = ''
}
</script>

<style scoped></style>
