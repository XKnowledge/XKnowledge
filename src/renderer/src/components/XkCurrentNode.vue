<template>
  <a-form layout="vertical">
    <a-form-item :label="$t('common.name')">
      <a-textarea v-model:value="currentNode.name" />
    </a-form-item>
    <a-form-item :label="$t('common.description')">
      <a-textarea v-model:value="currentNode.des" />
    </a-form-item>
    <a-form-item :label="$t('node.category')">
      <a-select
        v-model:value="currentNode.category"
        :placeholder="$t('node.categoryPlaceholder')"
        :options="categoryItems.map((item) => ({ value: item }))"
      >
        <template #dropdownRender="{ menuNode: menu }">
          <v-nodes :vnodes="menu" />
          <a-divider style="margin: 4px 0" />
          <a-space style="padding: 4px 8px">
            <a-input
              ref="inputRef"
              v-model:value="categoryName"
              :placeholder="$t('node.categoryNamePlaceholder')"
            />
            <a-button type="text" @click="addCategory">
              <template #icon>
                <plus-outlined />
              </template>
              {{ $t('node.newCategory') }}
            </a-button>
          </a-space>
        </template>
      </a-select>
    </a-form-item>
    <a-form-item :label="$t('node.size')">
      <a-input-number v-model:value="currentNode.symbolSize" :min="1" :max="100" />
    </a-form-item>
    <a-form-item>
      <a-button @click="currentNodeSubmit">{{ $t('node.submit') }}</a-button>
    </a-form-item>
  </a-form>
</template>

<script setup>
import { defineComponent, ref } from 'vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { t } from '../i18n.js'
import { addHistory, jsonReactive } from '../utils/XkUtils'

const currentNode = defineModel('currentNode', { type: Object })
const categoryItems = defineModel('categoryItems', { type: Array })
const categoryName = defineModel('categoryName', { type: String })
const currentNodeDataIndex = defineModel('currentNodeDataIndex', { type: Number })

const xkContext = defineModel('xkContext', { type: Object })

const inputRef = ref()

const addCategory = (e) => {
  e.preventDefault()
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

const currentNodeSubmit = () => {
  /**
   * 实现节点的动态修改
   */
  const { nodes: data, links } = xkContext.value.chartData
  const oldNode = jsonReactive(data[currentNodeDataIndex.value])
  const newNode = jsonReactive(currentNode.value)
  const oldName = oldNode.name
  const newName = newNode.name

  if (oldName !== newName) {
    // 修改节点的时候修改了节点名称
    // 思考：为什么不需要去掉旧的节点名称？因为本身就不重名，所以不用去掉
    // 思考：两个if是否可以合并？不可以合并，因为第二个if还有else分支
    const hasDuplicate = data.some((node) => node.name === newName)
    if (hasDuplicate) {
      xkContext.value.errorMessage = t('validation.duplicateNode')
      return
    }

    // 修改新节点所在的边
    links.forEach((link) => {
      if (link.source === oldName) link.source = newName
      if (link.target === oldName) link.target = newName
    })
  }

  data[currentNodeDataIndex.value] = newNode

  addHistory(xkContext, {
    act: 'changeNode',
    old: oldNode,
    new: newNode
  })

  xkContext.value.updateChart = !xkContext.value.updateChart
  xkContext.value.errorMessage = ''
}
</script>

<style scoped></style>
