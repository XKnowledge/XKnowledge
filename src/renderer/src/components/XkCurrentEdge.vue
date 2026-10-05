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
const currentEdge = defineModel('currentEdge', { type: Object })

const emit = defineEmits(['changeEdge'])

const currentEdgeSubmit = () => {
  /**
   * 提交连接修改：emit 意图，由编排层经 useDocument.changeEdge 执行
   * （按索引替换、历史与刷新收口在文档域）；成功清红条
   */
  emit('changeEdge', currentEdge.value)
}
</script>

<style scoped></style>
