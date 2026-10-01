<template>
  <!-- 就地编辑覆盖层：双击建点（名称+类目）/ 拖拽连边输名。
       放 .graph3d-container 外面（同图例/搜索，3D 库冷启动会清空容器） -->
  <div
    v-if="mode"
    class="xk-canvas-editor"
    :style="{ left: `${x}px`, top: `${y}px` }"
    :data-canvas-edit-mode="mode"
    @keydown.esc="close"
  >
    <template v-if="mode === 'node'">
      <a-input
        ref="nameRef"
        v-model:value="nodeName"
        class="xk-canvas-editor-name"
        placeholder="节点名称"
        size="small"
        @keydown.enter="onNameEnter"
      />
      <a-select
        ref="catRef"
        v-model:value="category"
        :open="catOpen"
        class="xk-canvas-editor-cat"
        placeholder="类目"
        size="small"
        :options="localCategories.map((c) => ({ value: c }))"
        :dropdown-match-select-width="false"
        @dropdownVisibleChange="onCatOpenChange"
        @change="submitNode"
      >
        <template #dropdownRender="{ menuNode: menu }">
          <component :is="menu" />
          <a-divider style="margin: 4px 0" />
          <a-space style="padding: 4px 8px">
            <a-input
              ref="newCatRef"
              v-model:value="newCategory"
              placeholder="新类目"
              size="small"
              style="width: 100px"
              @keydown.enter="onNewCatEnter"
            />
            <a-button type="text" size="small" @click="addCategory">新增</a-button>
          </a-space>
        </template>
      </a-select>
    </template>
    <a-input
      v-else
      ref="nameRef"
      v-model:value="edgeName"
      class="xk-canvas-editor-edge"
      placeholder="连接名称（留空建无名边），回车确认"
      size="small"
      @keydown.enter="onEdgeEnter"
    />
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick } from 'vue'

const props = defineProps({
  mode: { type: String, default: '' }, // 'node' | 'edge' | ''（不显示）
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  categories: { type: Array, default: () => [] }
})

const emit = defineEmits(['create-node', 'create-edge', 'close'])

const nameRef = ref(null)
const catRef = ref(null)
const newCatRef = ref(null)
const nodeName = ref('')
const edgeName = ref('')
const category = ref(undefined)
const catOpen = ref(false)
const newCategory = ref('')

// 就地新增的类目先记本地（节点落库后 updateChart watch 会从节点重算 categoryItems）
const addedCategories = ref([])
const localCategories = computed(() => [
  ...new Set([...props.categories, ...addedCategories.value])
])

// 打开即聚焦名称框、重置上一次的输入
watch(
  () => props.mode,
  (m) => {
    if (!m) return
    nodeName.value = ''
    edgeName.value = ''
    category.value = undefined
    newCategory.value = ''
    catOpen.value = false
    nextTick(() => nameRef.value?.focus())
  }
)

/** IME 组合中的回车不提交：Windows 上屏那次 isComposing=true，macOS 上 compositionend 先行
 *  导致 isComposing=false 但 keyCode=229 —— 双保险防跨平台差异（同 XkGraphSearch 键盘流约定） */
const isComposingEnter = (e) => e.isComposing || e.keyCode === 229

/** antd Select 不发 update:open（v-model:open 形同虚设）：受控 open prop 会吞掉
 *  组件内部的开关请求——鼠标点选框打不开下拉（建点编辑器里"点类目没反应"），
 *  键盘流打开后 antd 也关不掉。开关请求只有经 dropdownVisibleChange 回流到
 *  catOpen 才真正生效 */
const onCatOpenChange = (v) => {
  catOpen.value = v
}

const onNameEnter = (e) => {
  if (isComposingEnter(e)) return
  // 已选过类目：直接提交。antd 的 change 只在值变化时发射，重选同一项
  // 不会再触发——"先选类目再输名字"的流会卡死在选了却建不出
  if (category.value) {
    submitNode()
    return
  }
  openCategory()
}

const onNewCatEnter = (e) => {
  if (isComposingEnter(e)) return
  addCategory()
}

const onEdgeEnter = (e) => {
  if (isComposingEnter(e)) return
  submitEdge()
}

/** 键盘流第一步完成：名称回车 → 展开类目下拉并聚焦（方向键选、回车定） */
const openCategory = () => {
  if (!nodeName.value.trim()) return
  catOpen.value = true
  nextTick(() => catRef.value?.focus())
}

/** 新增类目：记本地并直接选定提交（空图起步的唯一路径） */
const addCategory = () => {
  const c = newCategory.value.trim()
  if (!c) return
  if (!localCategories.value.includes(c)) addedCategories.value.push(c)
  category.value = c
  newCategory.value = ''
  // 名称未输时 submitNode 发不出去（编辑器留在原地）：清输入之外还要收起
  // 下拉并把焦点让给名称框引导补齐，否则困在已选类目的下拉里；
  // 名称已输则提交后整个编辑器随 emit 卸载，走不到这里
  if (!nodeName.value.trim()) {
    catOpen.value = false
    nextTick(() => nameRef.value?.focus())
    return
  }
  submitNode()
}

/** 类目选定（键盘回车/鼠标点击都走 change）即整单提交 */
const submitNode = () => {
  const name = nodeName.value.trim()
  if (!name || !category.value) return
  emit('create-node', { name, category: category.value })
}

const submitEdge = () => {
  emit('create-edge', { name: edgeName.value.trim() })
}

const close = () => emit('close')

defineExpose({ focusName: () => nameRef.value?.focus() })
</script>

<style scoped>
.xk-canvas-editor {
  position: absolute;
  display: flex;
  gap: 6px;
  align-items: center;
  background: var(--xk-float-bg);
  border: 1px solid var(--xk-card-border);
  border-radius: 6px;
  padding: 6px 8px;
  z-index: 4;
  box-shadow: 0 3px 8px rgb(0 0 0 / 15%);
}

.xk-canvas-editor-name {
  width: 150px;
}

/* 连边态单框独占一行：加宽到整句提示可见（14px 字号、17 个全角字符最坏
   238px + 14px 内边距，取 260）；仍窄于建点态 ~303px，右缘钳制 EDITOR_W
   按宽态估计不受影响 */
.xk-canvas-editor-edge {
  width: 260px;
}

.xk-canvas-editor-cat {
  width: 130px;
}
</style>
