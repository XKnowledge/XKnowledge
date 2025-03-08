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
import { jsonReactive, resetEdgeRef } from '../utils/XkUtils'

const newEdge = defineModel('newEdge')
const highlightNodeList = defineModel('highlightNodeList')

const xkContext = defineModel('xkContext')

const createEdgeSubmit = () => {
  /**
   * 响应创建新连接的提交
   */
  const { value: ctx } = xkContext;
  ctx.errorMessage = '' // 清空旧错误信息

  if (highlightNodeList.value.length !== 2) {
    ctx.errorMessage = '请选中2个节点'
    return
  }

  const { data, links } = xkContext.value.chartData.series[0]
  const [sourceIndex, targetIndex] = highlightNodeList.value
  const newSource = data[sourceIndex].name
  const newTarget = data[targetIndex].name

  const isDuplicate = links.some(link =>
    (link.source === newSource && link.target === newTarget) ||
    (link.source === newTarget && link.target === newSource)
  )

  if (isDuplicate) {
    ctx.errorMessage = '两个节点间连接已存在'
    return
  }

  newEdge.value.source = newSource
  newEdge.value.target = newTarget

  const newEdgeJson = jsonReactive(newEdge.value)

  // 封装历史记录操作
  ctx.historyList[ctx.historySequenceNumber + 1] = {
    'act': 'createEdge',
    'data': newEdgeJson
  }
  ctx.historySequenceNumber++

  links.push(newEdgeJson)
  ctx.updateChart = !ctx.updateChart
  resetEdgeRef(newEdge)
}
</script>

<style scoped>

</style>
