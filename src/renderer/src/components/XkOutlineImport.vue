<template>
  <a-modal
    v-model:open="open"
    title="从大纲导入"
    ok-text="导入"
    cancel-text="取消"
    :ok-button-props="{ disabled: !parsed.nodes.length }"
    :mask-closable="false"
    data-outline-import
    @ok="onImport"
    @cancel="close"
  >
    <p class="xk-outline-hint">
      粘贴 Markdown 大纲，按规则解析为图谱追加到当前文件（同名节点跳过）：
      <code># 标题</code> 层级、缩进列表（2 空格一档）、<code>[[双链]]</code> 显式连接、
      结构行下段落存为节点描述；多个一级标题会依次连成链保持整图连通。
    </p>
    <a-textarea
      v-model:value="text"
      :rows="12"
      placeholder="# 一级标题（成为类目）&#10;## 二级标题&#10;- 列表项&#10;  - 子列表项&#10;正文段落会成为上方节点的描述"
    />
    <p v-if="text.trim()" class="xk-outline-stat">
      将导入 {{ parsed.nodes.length }} 个节点、{{ parsed.links.length }} 条连接
    </p>
  </a-modal>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parseOutline } from '../utils/outlineParser.js'

const emit = defineEmits(['import'])

const open = ref(false)
const text = ref('')

const parsed = computed(() => parseOutline(text.value))

const onImport = () => {
  if (!parsed.value.nodes.length) return
  emit('import', parsed.value)
}

const openDialog = () => {
  text.value = ''
  open.value = true
}

const close = () => {
  open.value = false
}

defineExpose({ open: openDialog, close })
</script>

<style scoped>
.xk-outline-hint {
  font-size: 13px;
  color: var(--xk-text);
  opacity: 0.75;
  margin-bottom: 8px;
}

.xk-outline-stat {
  font-size: 13px;
  margin-top: 8px;
  margin-bottom: 0;
}
</style>
