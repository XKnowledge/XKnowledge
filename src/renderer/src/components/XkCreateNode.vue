<template>
  <a-form layout="vertical">
    <a-form-item label="名称">
      <a-textarea v-model:value="newNode.name" />
    </a-form-item>
    <a-form-item label="描述">
      <a-textarea v-model:value="newNode.des" />
    </a-form-item>
    <a-form-item label="所属类目">
      <a-select
        v-model:value="newNode.category"
        placeholder="请选择类目"
        :options="categoryItems.map((item) => ({ value: item }))"
      >
        <template #dropdownRender="{ menuNode: menu }">
          <v-nodes :vnodes="menu" />
          <a-divider style="margin: 4px 0" />
          <a-space style="padding: 4px 8px">
            <a-input ref="inputRef" v-model:value="categoryName" placeholder="类目名" />
            <a-button type="text" @click="addCategory"> 新增类目 </a-button>
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
import { resetNodeRef, createNodeInChart } from '../utils/XkUtils'
import { defineComponent, ref } from 'vue'

const newNode = defineModel('newNode', { type: Object })
const categoryItems = defineModel('categoryItems', { type: Array })
const categoryName = defineModel('categoryName', { type: String })

const xkContext = defineModel('xkContext', { type: Object })

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

const addCategory = (e) => {
  e.preventDefault()
  if (categoryName.value) {
    // 类目属于“正在创建的新节点”，不能写到 currentNode（当前选中节点的
    // 副本）上，否则新节点拿不到类目、选中的节点反被悄悄篡改
    newNode.value.category = categoryName.value
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
   * 响应创建新节点的提交：校验与数据操作走共享 createNodeInChart，
   * 组件只负责侧栏错误文案与表单重置
   */
  const result = createNodeInChart(xkContext, newNode.value)
  if (!result.ok) {
    xkContext.value.errorMessage = result.error
    return
  }
  xkContext.value.errorMessage = ''
  resetNodeRef(newNode)
}
</script>

<style scoped></style>
