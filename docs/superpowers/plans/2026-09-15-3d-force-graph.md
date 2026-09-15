# XKnowledge 3D 力导向图实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把知识图谱从 ECharts 2D 力导向图替换为 3d-force-graph 驱动的真 3D 力导向图，编辑功能（侧边栏、增删改、undo/redo、自动保存）全保留。

**Architecture:** 新建 `XkGraph3D.vue` 封装 ForceGraph3D 实例（渲染/着色/高亮/图例/水印/导出），`ChartView.vue` 瘦身为编排层（快捷键、历史、文件、侧边栏）。`.xk` 文件格式从"ECharts option"改为纯数据 `{version: 2, nodes, links}`，主进程校验同步更换，移除 echarts 依赖。

**Tech Stack:** Vue 3 + ant-design-vue（现有）、3d-force-graph（Three.js + d3-force-3d）、three-spritetext（节点常显标签）、vitest + vue-tsc（现有）。

**规格文档：** `docs/superpowers/specs/2026-09-15-3d-force-graph-design.md`（含逐条交互映射表）

## Global Constraints

- 包管理只用 yarn（npm/yarn 混用会静默丢依赖），安装命令一律 `yarn add` / `yarn remove`。
- 用户可见文案一律简体中文，沿用现有 `message.error('固定中文提示')` 模式，不解析跨 IPC 的 err.message。
- 提交信息沿用仓库风格：中文 + 中文冒号（如 `feat：xxx`、`test：xxx`），结尾加 `Co-Authored-By: Claude <noreply@anthropic.com>`。
- 新 `.xk` 格式（本计划内所有任务的唯一格式）：`{"version": 2, "nodes": [{"name","des","symbolSize","category"}], "links": [{"source","target","name","des"}]}`。节点 name 全局唯一；边的 source/target 必须引用存在的节点名。
- 不做：旧格式兼容、边标签常显、2D/3D 双模式、节点坐标持久化。
- 每个任务结束时 `yarn test` 与 `yarn typecheck` 必须通过（Task 3 除外，它不产生代码）。

---

### Task 1: 主进程 .xk 新格式校验

**Files:**
- Modify: `src/main/fileService.js:9-43`（`validateChartStructure` 及其注释）
- Test: `tests/main/fileService.test.js`（重写 `validateChartStructure` 与 `VALID_CHART` 部分；`readChartFile`/`writeChartFile`/`saveChartFileAs` 的用例只换 `VALID_CHART` 定义，断言不动）

**Interfaces:**
- Consumes: 无（首任务）
- Produces: `validateChartStructure(parsed)` 签名不变（入参 JSON 对象，返回 `null` 或中文错误描述），供 `readChartFile`（同文件）继续调用。后续任务不直接用它。

- [ ] **Step 1: 重写测试的 fixture 与校验用例**

把 `tests/main/fileService.test.js` 顶部的 `VALID_CHART` 替换为：

```js
const VALID_CHART = JSON.stringify({
  version: 2,
  nodes: [
    { name: '节点1', des: '描述1', symbolSize: 50, category: '类目1' },
    { name: '节点2', des: '描述2', symbolSize: 50, category: '类目1' }
  ],
  links: [{ source: '节点1', target: '节点2', name: '边1', des: '边描述' }]
})
```

将 `describe('validateChartStructure', ...)` 整块替换为：

```js
describe('validateChartStructure', () => {
  const parse = (s) => JSON.parse(s)

  it('结构完整的 v2 图谱通过（返回 null）', () => {
    expect(validateChartStructure(parse(VALID_CHART))).toBeNull()
  })

  it('顶层不是对象被拒绝', () => {
    expect(validateChartStructure([1, 2])).toMatch(/不是 JSON 对象/)
    expect(validateChartStructure('str')).toMatch(/不是 JSON 对象/)
    expect(validateChartStructure(null)).toMatch(/不是 JSON 对象/)
  })

  it('缺少 version 或 version 不是 2 被拒绝', () => {
    const noVersion = JSON.parse(VALID_CHART)
    delete noVersion.version
    expect(validateChartStructure(noVersion)).toMatch(/version/)
    const oldVersion = JSON.parse(VALID_CHART)
    oldVersion.version = 1
    expect(validateChartStructure(oldVersion)).toMatch(/version/)
  })

  it('缺少 nodes / nodes 含无效项被拒绝', () => {
    const noNodes = JSON.parse(VALID_CHART)
    delete noNodes.nodes
    expect(validateChartStructure(noNodes)).toMatch(/nodes/)
    const nullNode = JSON.parse(VALID_CHART)
    nullNode.nodes.push(null)
    expect(validateChartStructure(nullNode)).toMatch(/节点/)
  })

  it('缺少 links 被拒绝', () => {
    const noLinks = JSON.parse(VALID_CHART)
    delete noLinks.links
    expect(validateChartStructure(noLinks)).toMatch(/links/)
  })

  it('link 的 source/target 引用不存在的节点被拒绝（悬空边）', () => {
    const dangling = JSON.parse(VALID_CHART)
    dangling.links.push({ source: '幽灵节点', target: '节点1', name: '边2', des: '' })
    expect(validateChartStructure(dangling)).toMatch(/引用/)
  })
})
```

同时把该文件中 `readChartFile` 的用例 `JSON 合法但结构缺失抛 INVALID_STRUCTURE` 里的文件内容 `'{"series":[{"data":[]}]}'` 换成 `'{"version":2}'`（仍是"语法合法但结构缺失"）。

- [ ] **Step 2: 运行测试确认失败**

Run: `yarn test`
Expected: FAIL，`validateChartStructure` 新用例报错（缺少 version / 悬空边等未被拦截）。

- [ ] **Step 3: 重写 `validateChartStructure` 实现**

把 `src/main/fileService.js` 中 `validateChartStructure` 整个函数及其上方注释块替换为：

```js
/**
 * 校验解析后的图谱数据（v2 纯数据格式）是否满足渲染端装载的最低要求。
 * 返回 null 表示通过；返回中文描述表示缺失项。
 * 渲染端（ChartView / XkGraph3D）会裸访问 nodes / links 数组，缺任何
 * 一项都会让图表页白屏，因此必须在主进程拦截。
 */
export const validateChartStructure = (parsed) => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return '文件内容不是 JSON 对象'
  }
  if (parsed.version !== 2) {
    return '缺少版本标记（version 应为 2）'
  }
  if (!Array.isArray(parsed.nodes)) {
    return '缺少节点数据（nodes）'
  }
  if (parsed.nodes.some((node) => !node || typeof node !== 'object')) {
    return '节点数据包含无效项'
  }
  if (!Array.isArray(parsed.links)) {
    return '缺少连接数据（links）'
  }
  const names = new Set(parsed.nodes.map((node) => node.name))
  const dangling = parsed.links.some(
    (link) => !link || !names.has(link?.source) || !names.has(link?.target)
  )
  if (dangling) {
    return '存在引用不存在节点的连接'
  }
  return null
}
```

`fileService.js` 其余部分（readChartFile / writeChartFile 等）不动。

- [ ] **Step 4: 运行测试确认全部通过**

Run: `yarn test`
Expected: PASS（含 tests/main/ipc.test.js、fileGuard.test.js 全部既有用例）。

- [ ] **Step 5: Commit**

```bash
git add src/main/fileService.js tests/main/fileService.test.js
git commit -m "feat：主进程 .xk 校验切换到 v2 纯数据格式

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 类目调色板工具（同名类目稳定同色）

**Files:**
- Create: `src/renderer/src/utils/categoryColor.js`
- Test: `tests/renderer/categoryColor.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `PALETTE: string[]`（12 个 `#RRGGBB` 色值）
  - `categoryColor(name: string): string` —— 任意字符串稳定映射到 PALETTE 中一色；同名输入两次调用结果相同且不依赖调用顺序。Task 4 的 `XkGraph3D.vue` 用它给节点着色与画图例色点。

- [ ] **Step 1: 写失败测试**

创建 `tests/renderer/categoryColor.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { categoryColor, PALETTE } from '../../src/renderer/src/utils/categoryColor'

describe('categoryColor', () => {
  it('任意类目名返回调色板中的颜色', () => {
    expect(PALETTE).toContain(categoryColor('类目0'))
    expect(PALETTE).toContain(categoryColor('随便什么名字'))
    expect(PALETTE).toContain(categoryColor(''))
  })

  it('同名类目稳定同色（与调用顺序无关）', () => {
    const a = categoryColor('物理学')
    const b = categoryColor('化学')
    // 先调用别的类目再重复调用，结果必须一致
    categoryColor('数学')
    expect(categoryColor('物理学')).toBe(a)
    expect(categoryColor('化学')).toBe(b)
  })

  it('不同类目名有较大概率不同色（12 色下抽 5 个互不相同）', () => {
    const colors = ['a', 'b', 'c', 'd', 'e'].map(categoryColor)
    expect(new Set(colors).size).toBe(5)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `yarn test`
Expected: FAIL，报模块不存在（`Failed to resolve import .../categoryColor`）。

- [ ] **Step 3: 实现调色板**

创建 `src/renderer/src/utils/categoryColor.js`：

```js
/**
 * 类目固定调色板：按类目名做稳定字符串哈希取模分配，
 * 同名类目永远同色（保存重开、多窗口一致），不依赖插入顺序。
 */
export const PALETTE = [
  '#5b8ff9',
  '#5ad8a6',
  '#5d7092',
  '#f6bd16',
  '#e8684a',
  '#6dc8ec',
  '#9270ca',
  '#ff9d4d',
  '#269a99',
  '#ff99c3',
  '#a9abb1',
  '#7262fd'
]

const hash = (str) => {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    // 31 进制多项式哈希；|0 保证 32 位整数运算
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export const categoryColor = (name) => PALETTE[hash(String(name ?? '')) % PALETTE.length]
```

- [ ] **Step 4: 运行测试确认通过**

Run: `yarn test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/utils/categoryColor.js tests/renderer/categoryColor.test.js
git commit -m "feat：类目稳定调色板工具

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 安装 3D 依赖

**Files:**
- Modify: `package.json`（经 yarn 自动修改，不手编）

**Interfaces:**
- Consumes: 无
- Produces: `node_modules` 中可用 `3d-force-graph`（默认导出 `ForceGraph3D` 构造函数）与 `three-spritetext`（默认导出 `SpriteText`）。Task 4 import 它们。

说明：echarts 的移除放在 Task 6（此时 ChartView 仍在用它，先删会让 dev 编译失败）。`three-spritetext` 是节点常显标签用的现成 Sprite 方案（3d-force-graph 生态标配），避免手写 canvas 纹理。

- [ ] **Step 1: 安装**

```bash
yarn add 3d-force-graph three-spritetext
```

- [ ] **Step 2: 验证安装成功**

Run: `yarn list --pattern "3d-force-graph|three-spritetext" --depth=0`
Expected: 两行，版本均非 `extraneous`。再跑 `yarn test` 确认无回归。
（注意：electron 环境下无需 ELECTRON_MIRROR——这两个包不含二进制。）

- [ ] **Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "build：引入 3d-force-graph 与 three-spritetext

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: XkGraph3D.vue 组件

**Files:**
- Create: `src/renderer/src/components/XkGraph3D.vue`

**Interfaces:**
- Consumes:
  - Task 2: `categoryColor(name: string): string`（`@/utils/categoryColor` 相对路径 `../utils/categoryColor.js`）
  - Task 3: `ForceGraph3D`（`3d-force-graph` 默认导出）、`SpriteText`（`three-spritetext` 默认导出）
- Produces（Task 5 的 ChartView 依赖以下精确契约）:
  - props: `nodes: Array`（`{name,des,symbolSize,category}`）、`links: Array`（`{source,target,name,des}`）、`highlightNodes: Array<string>`（高亮节点名，最多 2 个）、`highlightLink: Object|null`（`{source,target,name}` 或 null）、`draggable: Boolean`（默认 true）、`showLinkName: Boolean`（默认 false，控制悬浮是否显示边名）
  - emits: `node-click(nodeData, index)`、`link-click(linkData, index)`、`init-failed()`（WebGL 初始化失败时发一次；`nodeData` 只含 `name/des/symbolSize/category` 四字段，内部坐标等已剥离）
  - expose: `setRepulsion(value:number)`、`exportPng():void`、`resetView():void`
  - 行为契约: props.nodes/links 变更时保留既有节点坐标增量重灌（节点对象带旧 x/y/z 再 graphData）；draggable/showLinkName/highlight* 变更即时生效且不重启布局；组件卸载时 `_destructor()` 释放。

本任务无自动化测试（WebGL 场景测试成本高、收益低，规格已裁定），验证靠 `yarn typecheck` + Task 5 接入后的冒烟。

- [ ] **Step 1: 创建组件**

创建 `src/renderer/src/components/XkGraph3D.vue`，内容如下（完整，无需补全）：

```vue
<template>
  <div ref="containerRef" class="graph3d-container">
    <!-- 类目图例覆盖层：色点 + 类目名，点击切换该类显隐 -->
    <div class="graph3d-legend">
      <div
        v-for="cat in categories"
        :key="cat"
        class="graph3d-legend-item"
        :class="{ 'graph3d-legend-off': hiddenCategories.has(cat) }"
        @click="toggleCategory(cat)"
      >
        <span class="graph3d-legend-dot" :style="{ background: categoryColor(cat) }"></span>
        <span>{{ cat }}</span>
      </div>
    </div>
    <!-- 水印，视觉对齐旧版底部水印 -->
    <div class="graph3d-watermark">By XKnowledge</div>
    <!-- WebGL 失败提示条 -->
    <div v-if="initFailed" class="graph3d-fallback">
      3D 视图初始化失败（显卡驱动异常？），侧边栏编辑功能仍可使用
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import ForceGraph3D from '3d-force-graph'
import SpriteText from 'three-spritetext'
import { categoryColor } from '../utils/categoryColor.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  highlightNodes: { type: Array, default: () => [] },
  highlightLink: { type: Object, default: null },
  draggable: { type: Boolean, default: true },
  showLinkName: { type: Boolean, default: false }
})

const emit = defineEmits(['node-click', 'link-click', 'init-failed'])

const containerRef = ref(null)
const initFailed = ref(false)

let graph = null
let resizeObserver = null
let didInitialFit = false // 首次布局稳定后自动 zoomToFit 一次

// 图例：从节点派生类目；hiddenCategories 控制显隐
const categories = computed(() => [...new Set(props.nodes.map((n) => n.category))])
const hiddenCategories = ref(new Set())
const toggleCategory = (cat) => {
  const next = new Set(hiddenCategories.value)
  next.has(cat) ? next.delete(cat) : next.add(cat)
  hiddenCategories.value = next
  applyVisibility()
}

/** 图实例吃的节点是 chartData 的拷贝（带内部 __idx 与 d3 坐标字段），不回写 props */
const toGraphNodes = () =>
  props.nodes.map((n, i) => {
    const old = graph?.graphData().nodes.find((o) => o.name === n.name)
    // 保留旧坐标（若有），编辑刷新后已布局的图不跳
    return old ? { ...n, __idx: i, x: old.x, y: old.y, z: old.z } : { ...n, __idx: i }
  })
const toGraphLinks = () =>
  props.links.map((l, i) => ({ ...l, __idx: i }))

/** 剥离内部字段的纯数据，发给父组件 */
const pureNode = (n) => ({ name: n.name, des: n.des, symbolSize: n.symbolSize, category: n.category })
const pureLink = (l) => ({ source: l.source, target: l.target, name: l.name, des: l.des })

const applyVisibility = () => {
  if (!graph) return
  const hidden = hiddenCategories.value
  graph
    .nodeVisibility((n) => !hidden.has(n.category))
    // 两端任一隐藏，边随之隐藏
    .linkVisibility((l) => {
      const s = props.nodes.find((n) => n.name === l.source)
      return s ? !hidden.has(s.category) : true
    })
}

const applyHighlight = () => {
  if (!graph) return
  const hl = new Set(props.highlightNodes)
  const le = props.highlightLink
  graph
    .nodeColor((n) => (hl.has(n.name) ? '#e8684a' : categoryColor(n.category)))
    .linkColor((l) =>
      le && le.source === l.source && le.target === l.target && le.name === l.name
        ? '#e8684a'
        : '#4b565b'
    )
    .refresh()
}

/** 前 30 个大节点常显名称（SpriteText），其余悬浮显示 */
const BIG_LABEL_COUNT = 30
const applyLabels = () => {
  if (!graph) return
  const threshold = [...props.nodes]
    .sort((a, b) => (b.symbolSize ?? 0) - (a.symbolSize ?? 0))
    .slice(BIG_LABEL_COUNT - 1)
    .map((n) => n.symbolSize ?? 0)[0]
  graph.nodeThreeExtendObject((n) => {
    if ((n.symbolSize ?? 0) < threshold || !n.name) return null
    const sprite = new SpriteText(n.name)
    sprite.textHeight = 5
    sprite.color = '#333'
    sprite.position.set(0, 7, 0)
    return sprite
  })
}

const applyInteraction = () => {
  if (!graph) return
  graph
    .enableNodeDrag(props.draggable)
    .nodeLabel((n) => (n.des ? `${n.name}：${n.des}` : `${n.name}`))
    .linkLabel((l) => (props.showLinkName && l.name ? l.name : ''))
}

onMounted(() => {
  try {
    // preserveDrawingBuffer 让 toDataURL 导出 PNG 不黑屏
    graph = new ForceGraph3D(containerRef.value, {
      rendererConfig: { preserveDrawingBuffer: true }
    })
  } catch (err) {
    console.error('3D 图初始化失败', err)
    initFailed.value = true
    emit('init-failed')
    return
  }

  graph
    .graphData({ nodes: toGraphNodes(), links: toGraphLinks() })
    .nodeVal((n) => n.symbolSize ?? 50)
    .nodeRelSize(1)
    .onNodeClick((n) => emit('node-click', pureNode(n), n.__idx))
    .onLinkClick((l) => emit('link-click', pureLink(l), l.__idx))
    .onEngineStop(() => {
      // 仅首次布局稳定时自动取景，之后的编辑刷新不打扰视角
      if (!didInitialFit) {
        didInitialFit = true
        graph.zoomToFit(600, 80)
      }
    })
    // 边默认宽度；link 的曲线默认直线即可
    .linkWidth(1)

  applyVisibility()
  applyHighlight()
  applyLabels()
  applyInteraction()
  setRepulsion(1000)

  // 容器尺寸变化（侧边栏显隐、窗口缩放）由 ResizeObserver 自理，
  // 父组件不再需要 nextTick(resize) 联动
  resizeObserver = new ResizeObserver(() => {
    const el = containerRef.value
    if (el && graph) graph.width(el.clientWidth).height(el.clientHeight)
  })
  resizeObserver.observe(containerRef.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  if (graph) {
    graph._destructor()
    graph = null
  }
})

// 数据增量刷新：保留坐标重灌（toGraphNodes 已处理），不重启 didInitialFit
watch(
  () => [props.nodes, props.links],
  () => {
    if (!graph) return
    graph.graphData({ nodes: toGraphNodes(), links: toGraphLinks() })
    applyLabels()
  },
  { deep: true }
)

watch(() => props.highlightNodes, applyHighlight, { deep: true })
watch(() => props.highlightLink, applyHighlight, { deep: true })
watch(() => props.draggable, applyInteraction)
watch(() => props.showLinkName, applyInteraction)

/** 排斥力滑杆映射：d3 charge 强度 = -repulsion/10（滑杆 1~10000 → -0.1~-1000） */
const setRepulsion = (value) => {
  if (!graph) return
  const charge = graph.d3Force('charge')
  if (charge) charge.strength(-(value ?? 1000) / 10)
  graph.d3ReheatSimulation()
}

/** 导出当前视图为 PNG 并触发下载 */
const exportPng = () => {
  if (!graph) return
  const url = graph.renderer().domElement.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = `xknowledge-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
  a.click()
}

/** 视图复位：相机归位 + 全图取景 */
const resetView = () => {
  if (!graph) return
  graph.cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 400)
  graph.zoomToFit(600, 80)
}

defineExpose({ setRepulsion, exportPng, resetView })
</script>

<style scoped>
.graph3d-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.graph3d-legend {
  position: absolute;
  top: 40px; /* 避开顶部工具栏区域，对齐旧 legend 顶部布局 */
  left: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(255, 255, 255, 0.8);
  padding: 8px;
  border-radius: 6px;
  font: 13px sans-serif;
  max-height: 60%;
  overflow-y: auto;
  z-index: 2;
}

.graph3d-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.graph3d-legend-off {
  opacity: 0.35;
  text-decoration: line-through;
}

.graph3d-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.graph3d-watermark {
  position: absolute;
  bottom: 5%;
  left: 50%;
  transform: translateX(-50%);
  font: bold 18px sans-serif;
  color: #000;
  pointer-events: none;
  z-index: 2;
}

.graph3d-fallback {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #fff1f0;
  border: 1px solid #ffa39e;
  color: #cf1322;
  border-radius: 6px;
  padding: 16px 24px;
  font: 14px sans-serif;
  z-index: 3;
}
</style>
```

- [ ] **Step 2: 类型与全量测试验证**

Run: `yarn typecheck && yarn test`
Expected: 两者通过（新组件未被引用，不影响现有运行时）。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/XkGraph3D.vue
git commit -m "feat：XkGraph3D 组件封装 3d-force-graph 渲染层

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 数据层原子切换（template1 + 侧边栏 + ChartView）

本任务把 v2 格式贯通渲染层。四个文件必须**同一提交**切换（数据格式没有中间态，分开提交会让 dev 状态损坏）。对 UI 改造不适用 TDD，验证 = typecheck + test + `yarn dev` 冒烟。

**Files:**
- Modify: `src/renderer/src/template/template1.ts`（整文件重写）
- Modify: `src/renderer/src/components/XkCreateNode.vue:85`
- Modify: `src/renderer/src/components/XkCurrentNode.vue:84`
- Modify: `src/renderer/src/components/XkCreateEdge.vue:35`
- Modify: `src/renderer/src/components/XkCurrentEdge.vue:30-33`
- Modify: `src/renderer/src/page/ChartView.vue`（多处，逐点列出）

**Interfaces:**
- Consumes:
  - Task 2: `categoryColor`
  - Task 4: `XkGraph3D.vue` 全部 props/emits/expose 契约（见 Task 4 Produces）
- Produces: 运行中的 3D 图表页。无后续任务依赖的新接口。

- [ ] **Step 1: 重写 template1.ts**

整文件替换为：

```ts
const createTemplate1 = () => {
  return {
    version: 2,
    nodes: [
      { name: 'node01', des: 'nodedes01', symbolSize: 50, category: '类目0' },
      { name: 'node02', des: 'nodedes02', symbolSize: 50, category: '类目1' },
      { name: 'node03', des: 'nodedes3', symbolSize: 50, category: '类目2' },
      { name: 'node05', des: 'nodedes05', symbolSize: 50, category: '类目1' },
      { name: 'node04', des: 'nodedes04', symbolSize: 50, category: '类目3' }
    ],
    links: [
      { source: 'node01', target: 'node02', name: 'link01', des: 'link01des' },
      { source: 'node01', target: 'node05', name: 'link04', des: 'link05des' },
      { source: 'node01', target: 'node04', name: 'link03', des: 'link03des' },
      { source: 'node03', target: 'node02', name: 'link05', des: 'link05des' },
      { source: 'node04', target: 'node03', name: 'link02', des: 'link02des' },
      { source: 'node03', target: 'node05', name: 'link06', des: 'link06des' }
    ]
  }
}

export default createTemplate1
```

- [ ] **Step 2: 侧边栏四组件的访问路径替换（机械替换，每处一行）**

| 文件 | 旧 | 新 |
|---|---|---|
| XkCreateNode.vue:85 | `const { data } = xkContext.value.chartData.series[0]` | `const { nodes: data } = xkContext.value.chartData` |
| XkCurrentNode.vue:84 | `const { data, links } = xkContext.value.chartData.series[0]` | `const { nodes: data, links } = xkContext.value.chartData` |
| XkCreateEdge.vue:35 | `const { data, links } = xkContext.value.chartData.series[0]` | `const { nodes: data, links } = xkContext.value.chartData` |
| XkCurrentEdge.vue:30 | `jsonReactive(xkContext.value.chartData.series[0].links[...])` | `jsonReactive(xkContext.value.chartData.links[...])` |
| XkCurrentEdge.vue:33 | `xkContext.value.chartData.series[0].links[...] = currentEdgeJson` | `xkContext.value.chartData.links[...] = currentEdgeJson` |

- [ ] **Step 3: ChartView.vue 模板区改造**

3.1 模板中 `<div class="echarts-style" ref="chartDom"></div>` 替换为：

```html
<XkGraph3D
  ref="graph3dRef"
  class="echarts-style"
  :nodes="xkContext.chartData?.nodes ?? []"
  :links="xkContext.chartData?.links ?? []"
  :highlight-nodes="highlightNodeNames"
  :highlight-link="highlightEdgeObj"
  :draggable="draggable"
  :show-link-name="showLinkName"
  @node-click="onGraphNodeClick"
  @link-click="onGraphLinkClick"
/>
```

3.2 侧边栏属性面板（`attributeVisible` 的 `a-space` 内、排斥力行之后）追加按钮行：

```html
<a-divider orientation="left">视图</a-divider>
<a-row :gutter="8">
  <a-col :flex="1">
    <a-button size="small" @click="graph3dRef?.exportPng()">导出图片</a-button>
  </a-col>
  <a-col :flex="1">
    <a-button size="small" @click="graph3dRef?.resetView()">复位视图</a-button>
  </a-col>
</a-row>
```

- [ ] **Step 4: ChartView.vue 脚本区改造（逐点）**

4.1 import 区：删除 `import * as echarts from 'echarts'`；追加 `import XkGraph3D from '../components/XkGraph3D.vue'`。

4.2 删除：`chartDom` ref、`chartInstance` 变量、`resizeChart` 函数、`operateChart` 函数、`clickChart` 函数、`initChartData` 函数；`onMounted`/`onUnmounted` 里对它们的全部引用（`window.addEventListener('resize', resizeChart)` 与对应 removeEventListener、`chartInstance?.dispose()` 等）。`switchSider`/`createNode`/`createEdge` 里的 `nextTick(resizeChart)` 改为 `nextTick()`（保留 nextTick 以免破坏 import；或删掉 nextTick 调用并从 import 中移除 `nextTick`——二选一，推荐后者连带清理 import）。

4.3 新增状态（放在原 `highlightNodeList` 附近，替代其旧语义）：

```js
const graph3dRef = ref(null) // XkGraph3D 组件实例（expose setRepulsion/exportPng/resetView）
const draggable = ref(true) // 会话级渲染设置，不进文件
const showLinkName = ref(false) // 会话级渲染设置：悬浮时是否显示边名
const highlightNodeList = ref([]) // 高亮节点 index 记录（最多 2 个，逻辑照旧）
const highlightNodeNames = computed(() =>
  highlightNodeList.value.map((i) => xkContext.value.chartData?.nodes?.[i]?.name).filter(Boolean)
)
// 高亮边 index（-1 表示无）；原 `let highlightEdge` 变量由此 ref 替代
const highlightEdgeIndex = ref(-1)
const highlightEdgeObj = computed(() => {
  const i = highlightEdgeIndex.value
  const links = xkContext.value.chartData?.links
  return i > -1 && links?.[i] ? { source: links[i].source, target: links[i].target, name: links[i].name } : null
})
```

（import 中补 `computed`。）原 `let highlightEdge = null` 变量删除，全部改用 `highlightEdgeIndex`。

4.4 `loadChartData` 兜底校验块替换为：

```js
const chart = (() => {
  try {
    return JSON.parse(data.value)
  } catch (e) {
    console.error('文件内容解析失败', e)
    message.error('文件内容已损坏或格式不正确，无法打开')
    return null
  }
})()
if (!chart) return
if (
  chart.version !== 2 ||
  !Array.isArray(chart.nodes) ||
  !Array.isArray(chart.links) ||
  chart.nodes.some((n) => !n || typeof n !== 'object')
) {
  message.error('文件内容已损坏或格式不正确，无法打开')
  return
}
xkContext.value.chartData = chart
```

随后的 `if (chartDom.value) {...}` 块整体删除（实例初始化与事件绑定已移入 XkGraph3D），只保留 `filePath = data.path`、`fileOpened` 登记、`initAttr()`、`xkContext.value.updateChart = !xkContext.value.updateChart`、`nextTick(() => { saveNodeVisible.value = false })` 的等价逻辑。

4.5 `initAttr` 替换为（渲染设置不再持久化，文件里没有这些字段）：

```js
const initAttr = () => {
  // v2 格式不存渲染配置，恢复会话默认值
  draggable.value = true
  showLinkName.value = false
  repulsion.value = 1000
  checkedValues.value = ['draggable']
}
```

4.6 `updateChart` watch 替换为（图例/categories 派生移入 XkGraph3D，这里只剩类目下拉框联动；图表本身的刷新由 props 响应式自动完成）：

```js
watch(
  () => xkContext.value.updateChart,
  () => {
    const categories = [...new Set(xkContext.value.chartData.nodes.map((x) => x.category))]
    categoryItems.value = categories
    saveNodeVisible.value = true
  }
)
```

4.7 `onChangeAttr` 替换为（draggable/showLinkName 走 props，无需再动图实例）：

```js
const onChangeAttr = () => {
  draggable.value = checkedValues.value.includes('draggable')
  showLinkName.value = checkedValues.value.includes('showEdgeName')
  saveNodeVisible.value = true
}
```

模板里复选框文案 `显示连接名称` 改为 `悬浮显示连接名称`。

4.8 `onChangeRepulsion` 替换为：

```js
const onChangeRepulsion = () => {
  graph3dRef.value?.setRepulsion(repulsion.value)
  saveNodeVisible.value = true
}
```

4.9 新增图事件处理（对齐原 clickChart 的高亮/侧边栏语义）：

```js
const onGraphNodeClick = (nodeData, index) => {
  resetSider()
  attributeVisible.value = false
  currentNodeVisible.value = true
  currentNode.value = jsonReactive(nodeData)
  newNode.value.symbolSize = currentNode.value.symbolSize
  currentNodeDataIndex.value = index

  const currentIndex = highlightNodeList.value.indexOf(index)
  if (currentIndex !== -1) {
    highlightNodeList.value.splice(currentIndex, 1)
  } else if (highlightNodeList.value.length < 2) {
    highlightNodeList.value.push(index)
  } else {
    const [oldIndex] = highlightNodeList.value
    highlightNodeList.value = [highlightNodeList.value[1], index]
  }

  if (!siderVisible.value) switchSider()
}

const onGraphLinkClick = (linkData, index) => {
  resetSider()
  attributeVisible.value = false
  currentEdgeVisible.value = true
  currentEdge.value = jsonReactive(linkData)
  highlightEdgeIndex.value = highlightEdgeIndex.value === index ? -1 : index

  if (!siderVisible.value) switchSider()
}
```

4.10 `downplayAllHightlight` 清空逻辑简化（3D 高亮直接由空数组/null props 表达）：

```js
const downplayAllHightlight = () => {
  highlightNodeList.value = []
  highlightEdgeIndex.value = -1
}
```

4.11 `resetRefData` 里删除 `highlightEdge = null` 行（已无此变量），保留其余。

4.12 全文机械替换 `xkContext.value.chartData.series[0].data` → `xkContext.value.chartData.nodes`、`xkContext.value.chartData.series[0].links` → `xkContext.value.chartData.links`；剩余的 `const currentSeries = xkContext.value.chartData.series[0]`（deleteNode）与 `const series = xkContext.value.chartData.series[0]`（deleteEdge）改为解构 `const { nodes, links } = xkContext.value.chartData` 并将其下 `currentSeries.data`/`currentSeries.links`/`series.data`/`series.links` 对应改名。完成后在文件内全局搜索 `series`，除注释外必须为 0 处。

4.13 `switchSider` 与 `toggleSider` 中 `downplayAllHightlight()` 调用照旧（语义：收起侧栏清高亮）。

- [ ] **Step 5: 静态验证**

Run: `yarn typecheck && yarn test`
Expected: 通过。

- [ ] **Step 6: dev 冒烟**

Run: `yarn dev`
按清单手动验证（每项通过才继续）：
1. 首页双击模板卡 → 3D 图出现，节点为球体、按类目着色、前 30 大节点带名称；左键拖动旋转、滚轮缩放、右键平移。
2. 点节点 → 侧边栏显示属性 + 节点变高亮色；再点另一个节点（2 个高亮）；点第 3 个 → 最早的高亮被挤掉；重复点同一节点取消高亮。
3. 拖动节点 → 布局跟随；拖动"排斥力"滑杆 → 图散开/收拢。
4. 创建节点（Insert）→ 出现在图中；改名 → 相连边跟随；删除节点 → 关联边消失；Ctrl+Z/Ctrl+Y 正常。
5. 点边 → 高亮 + 侧边栏；勾选"悬浮显示连接名称"后悬浮边出现名称；悬浮节点出现 `名称：描述`。
6. 图例点"类目0" → 该类隐藏（含边），再点恢复。
7. Ctrl+S 保存 → 用文本编辑器打开 .xk：内容为 `{"version":2,"nodes":[...],"links":[...]}`，无 series/legend/force 字段。
8. 关闭重开该文件 → 布局自动展开、zoomToFit 一次；一切编辑功能复测正常。
9. "导出图片"产出 PNG 且非全黑；"复位视图"回到全图。
10. 底部水印 "By XKnowledge" 可见。

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/template/template1.ts src/renderer/src/components/XkCreateNode.vue src/renderer/src/components/XkCurrentNode.vue src/renderer/src/components/XkCreateEdge.vue src/renderer/src/components/XkCurrentEdge.vue src/renderer/src/page/ChartView.vue
git commit -m "feat：图表页切换 3d-force-graph，.xk 贯通 v2 纯数据格式

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 移除 echarts + 全量回归

**Files:**
- Modify: `package.json` / `yarn.lock`（经 yarn 自动修改）

**Interfaces:**
- Consumes: Task 5 完成后全项目应无 echarts import。
- Produces: 无（终点任务）。

- [ ] **Step 1: 确认无残留引用**

Run: `grep -rn "echarts" src/ tests/`（bash）
Expected: 除注释外 0 处 import/引用；若 ChartView 的 `.echarts-style` class 名仍在使用（XkGraph3D 挂了同名 class，样式仍定义于 ChartView），属样式类名，可保留不 grep 命中 `from 'echarts'` 即可——命令改用 `grep -rn "from 'echarts'" src/ tests/`，Expected: 0 处。

- [ ] **Step 2: 移除依赖**

```bash
yarn remove echarts
```

- [ ] **Step 3: 全量验证**

Run: `yarn typecheck && yarn test`
Expected: 通过。再 `yarn dev` 快速复测 Task 5 冒烟清单第 1、7、8 项（打开、保存、重开）。

- [ ] **Step 4: Commit**

```bash
git add package.json yarn.lock
git commit -m "build：移除 echarts 依赖

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 风险与备注（执行者须知）

- **3d-force-graph 与 Vite/ Electron**：该库为 ESM/CJS 双发布，Vite 预打包通常直接可用；若 dev 启动报 `optimize deps` 相关错误，先试 `yarn dev --force`；仍失败再考虑 `optimizeDeps.include: ['3d-force-graph']`（electron.vite.config 的 renderer 段）。这是低概率事件，正常路径不需要动配置。
- **`d3ReheatSimulation` / `nodeThreeExtendObject` / `enableNodeDrag`** 均为 3d-force-graph 稳定 API（README 文档化）；若 typecheck 报缺失，确认安装版本 ≥ 1.73。
- **节点名是唯一键**：侧边栏与 undo/redo 均基于此假定（现状即如此），XkGraph3D 的坐标保留/高亮匹配同样依赖它，不要放宽。
- ChartView 中 `highlightNodeList` 语义是 **index 数组**（最多 2 个），与原实现一致；名字匹配只发生在传给 XkGraph3D 的 computed 里。增删节点后必须 `resetRefData()`（现有代码已如此），否则 index 陈旧。
