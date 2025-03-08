<template>
  <a-form>
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
</template>

<script setup>
import { jsonReactive, resetNodeRef } from '../utils/XkUtils'
import { defineComponent, ref } from 'vue'

const newNode = defineModel('newNode')
const categoryItems = defineModel('categoryItems')
const categoryName = defineModel('categoryName')
const currentNode = defineModel('currentNode')

const xkContext = defineModel('xkContext')

const inputRef = ref()

const VNodes = defineComponent({
  props: {
    vnodes: {
      type: Object,
      required: true
    }
  },
  render() {
    return this.vnodes
  }
})

const addCategory = e => {
  e.preventDefault()
  console.log(categoryName.value)
  if (categoryName.value) {
    currentNode.value.category = categoryName.value
    if (!categoryItems.value.includes(categoryName.value)) {
      categoryItems.value.push(categoryName.value)
    }
  }
  categoryName.value = ''
  setTimeout(() => {
    inputRef.value?.focus()
  }, 0)
}

const createNodeSubmit = () => {
  /**
   * 响应创建新节点的提交
   */
  // 使用可选链和空值合并简化判断
  if (!newNode.value.category?.trim()) {
    xkContext.value.errorMessage = '请选择/创建节点所属类目'
    return
  }

  const { data } = xkContext.value.chartData.series[0]
  const newName = newNode.value.name
  const hasDuplicate = data.some(node => node.name === newName)

  if (hasDuplicate) {
    xkContext.value.errorMessage = '不能创建同名节点'
    return
  }

  const newNodeJson = jsonReactive(newNode.value)
  data.push(newNodeJson)

  // 不能写成下面这个样子，会导致数据被赋值在数组index=-1的位置上
  // xkContext.value.historySequenceNumber++;
  // xkContext.value.historyList[xkContext.value.historySequenceNumber] = {
  //   "act": "createNode",
  //   "data": newNodeJson
  // };
  // 因为historySequenceNumber是defineModel
  // Vue会在第一个tick更新父组件中的historySequenceNumber
  // 下一个tick父组件发送prop来更新子组件

  xkContext.value.historyList[xkContext.value.historySequenceNumber + 1] = {
    'act': 'createNode',
    'data': newNodeJson
  }
  xkContext.value.historySequenceNumber++

  xkContext.value.updateChart = !xkContext.value.updateChart
  xkContext.value.errorMessage = ''
  resetNodeRef(newNode)
}
</script>

<style scoped>

</style>
