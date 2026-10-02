<template>
  <!-- 就地编辑覆盖层：双击建点（名称+可选描述+类目）/ 拖拽连边输名。
       放 .graph3d-container 外面（同图例/搜索，3D 库冷启动会清空容器） -->
  <!-- esc.capture：类目下拉展开时 vc-select 对 Esc stopPropagation（bubble 到不了
       本层）——曾只关下拉留下半死编辑器，滞留态里 Enter 仍会选中高亮项提交建点；
       capture 先于它拿到事件，一次 Esc 取消整单 -->
  <div
    v-if="mode"
    class="xk-canvas-editor"
    :style="{ left: `${x}px`, top: `${y}px` }"
    :data-canvas-edit-mode="mode"
    @keydown.esc.capture="close"
  >
    <template v-if="mode === 'node'">
      <!-- 两行布局：行1 名称+可选描述（Tab 序与填写次序一致——类目选定即整单
           提交，可选字段必须排在类目之前）；行2 类目+大小档位+自定义数框 -->
      <div class="xk-canvas-editor-node">
        <div class="xk-canvas-editor-row">
          <a-input
            ref="nameRef"
            v-model:value="nodeName"
            class="xk-canvas-editor-name"
            placeholder="节点名称"
            size="small"
            @keydown.enter="onNameEnter"
          />
          <!-- 描述：多行文本域（同侧栏描述字段），Enter 换行不提交——提交节奏
               仍由「类目选定即整单提交」独占；可拖角拉伸（见样式注释） -->
          <a-textarea
            v-model:value="nodeDes"
            class="xk-canvas-editor-des"
            placeholder="描述（可选）"
            size="small"
            :rows="1"
          />
        </div>
        <div class="xk-canvas-editor-row">
          <a-select
            ref="catRef"
            v-model:value="category"
            :open="catOpen"
            class="xk-canvas-editor-cat"
            placeholder="类目"
            size="small"
            :options="localCategories.map((c) => ({ value: c }))"
            :dropdown-match-select-width="false"
            @keydown.enter.capture="onCatEnter"
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
          <a-radio-group
            v-model:value="sizeTier"
            size="small"
            button-style="solid"
            class="xk-canvas-editor-size"
          >
            <a-radio-button :value="30"><i class="xk-size-dot xk-dot-s" />小</a-radio-button>
            <a-radio-button :value="50"><i class="xk-size-dot xk-dot-m" />中</a-radio-button>
            <a-radio-button :value="80"><i class="xk-size-dot xk-dot-l" />大</a-radio-button>
          </a-radio-group>
          <!-- 自定义大小数框：与档位 radio 共用 sizeTier（参照侧栏节点大小
               1~100）——点档位同步数框，改数框即脱离档位（radio 全灭） -->
          <a-input-number
            v-model:value="sizeTier"
            class="xk-canvas-editor-size-custom"
            size="small"
            :min="1"
            :max="100"
          />
        </div>
      </div>
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
const nodeDes = ref('')
const edgeName = ref('')
const category = ref(undefined)
const catOpen = ref(false)
const newCategory = ref('')

// 大小：档位 30/50/80（默认中=50，与历史固定值一致）与自定义数框共用此值——
// 点档位同步数框、数框改值即脱离档位（radio 全灭=自定义），1~100 与侧栏节点
// 大小一致。纯参数不参与提交流——类目选定即整单提交的节奏不变，零打扰
const sizeTier = ref(50)

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
    nodeDes.value = ''
    edgeName.value = ''
    category.value = undefined
    newCategory.value = ''
    sizeTier.value = 50
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

/** select 上的回车守卫：下拉未展开时不得替用户选中——antd 开拉即高亮
 *  activeIndex 第一项，回车径直选中触发 change→submitNode，Tab 过来的
 *  用户没看见下拉就被替选类目建成（类目必选形同虚设）。未展开态回车
 *  只转为展开下拉（选项可见后回车才是确认，合法键盘流不变）；展开态
 *  放行交 antd 选高亮项。capture+stopPropagation 抢在 vc-select 的
 *  input handler 之前拦截 */
const onCatEnter = (e) => {
  if (isComposingEnter(e)) return
  if (catOpen.value) return
  e.preventDefault()
  e.stopPropagation()
  catOpen.value = true
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
  emit('create-node', {
    name,
    category: category.value,
    symbolSize: sizeTier.value,
    des: nodeDes.value.trim()
  })
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

/* 建点态两行容器：行1 名称+描述、行2 类目+大小档（宽度由行1 决定） */
.xk-canvas-editor-node {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.xk-canvas-editor-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 描述：可拖角双向拉伸（antd reset 只给 textarea resize:vertical，这里放开
   both——长描述先拉大再写）；min 兜住拖拽下限不至拖没了，宽高超出后编辑器
   占地随之增长（clampEditorPos 的估算不追手改尺寸，只管初定位） */
.xk-canvas-editor-des {
  width: 200px;
  min-width: 120px;
  min-height: 24px;
  resize: both;
}

/* 自定义大小数框：只放 1~100 三位数（antd 默认 90px 偏宽，行 2 预算紧） */
.xk-canvas-editor-size-custom {
  width: 80px;
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

/* 档位圆点示意 3D 球体大小：直径 6/9/12px，色随文字（未选中主题色/选中反白） */
.xk-size-dot {
  display: inline-block;
  border-radius: 50%;
  background: currentColor;
  margin-right: 4px;
}

.xk-dot-s {
  width: 6px;
  height: 6px;
}

.xk-dot-m {
  width: 9px;
  height: 9px;
}

.xk-dot-l {
  width: 12px;
  height: 12px;
}
</style>
