<template>
  <a-form layout="vertical">
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
import { resetEdgeRef, createEdgeInChart } from '../utils/XkUtils'

const newEdge = defineModel('newEdge', { type: Object })
const highlightNodeList = defineModel('highlightNodeList', { type: Array })

const xkContext = defineModel('xkContext', { type: Object })

const createEdgeSubmit = () => {
  /**
   * 响应创建新连接的提交：选中数前置校验与端点回填留组件，
   * 重复边校验与数据操作走共享 createEdgeInChart
   */
  const { value: ctx } = xkContext
  ctx.errorMessage = ''

  if (highlightNodeList.value.length !== 2) {
    ctx.errorMessage = '请选中2个节点'
    return
  }

  const [sourceIndex, targetIndex] = highlightNodeList.value
  newEdge.value.source = ctx.chartData.nodes[sourceIndex].name
  newEdge.value.target = ctx.chartData.nodes[targetIndex].name

  const result = createEdgeInChart(xkContext, newEdge.value)
  if (!result.ok) {
    ctx.errorMessage = result.error
    return
  }
  resetEdgeRef(newEdge)
}
</script>

<style scoped></style>
