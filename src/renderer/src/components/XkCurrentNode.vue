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

const currentNode = defineModel('currentNode', { type: Object })
const categoryItems = defineModel('categoryItems', { type: Array })
const categoryName = defineModel('categoryName', { type: String })

const emit = defineEmits(['changeNode'])

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
   * 提交节点修改：emit 意图，由编排层经 useDocument.changeNode 执行
   * （重名校验、邻边端点改写、历史与刷新收口在文档域）；失败回显走
   * 父层侧栏红条，成功清红条
   */
  emit('changeNode', currentNode.value)
}
</script>

<style scoped></style>
