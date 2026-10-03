<template>
  <div
    class="graph3d-wrap"
    :data-node-count="nodes.length"
    :data-link-count="links.length"
    :data-last-node-size="nodes.length ? nodes[nodes.length - 1].symbolSize : ''"
    :data-last-node-des="nodes.length ? (nodes[nodes.length - 1].des ?? '') : ''"
    :data-highlight-node="highlightNode"
    :data-highlight-edge="highlightLink?.name ?? ''"
    :data-selection-count="selectionNodes.length + selectionLinks.length"
    :data-video-recording="videoMode"
  >
    <!-- 3D 库独占挂载点：three-render-objects 初始化时 innerHTML='' 清空本容器，
         Vue 渲染的覆盖层必须放外面，否则冷启动时被库吞掉（HMR 补 DOM 会造成
         "开发时正常、打包后消失"的假象） -->
    <div ref="containerRef" class="graph3d-container"></div>
    <!-- 类目图例覆盖层：色点 + 类目名，点击切换该类显隐 -->
    <div class="graph3d-legend">
      <div
        v-for="cat in categories"
        :key="cat"
        class="graph3d-legend-item"
        :class="{ 'graph3d-legend-off': hiddenCategories.has(cat) }"
        @click="toggleCategory(cat)"
      >
        <span class="graph3d-legend-dot" :style="{ background: catColor(cat) }"></span>
        <span>{{ cat }}</span>
      </div>
    </div>
    <!-- 图内搜索覆盖层（Ctrl/⌘+F）：状态由本组件持有，XkGraphSearch 纯展示 -->
    <XkGraphSearch
      ref="searchCompRef"
      :open="searchOpen"
      :keyword="searchKeyword"
      :hits="slicedSearchHits"
      :hit-total="searchHitNodes.length"
      :active-index="searchActiveIdx"
      :cat-color="catColor"
      @keyword="onSearchKeyword"
      @next="goToHit(searchActiveIdx + 1)"
      @prev="goToHit(searchActiveIdx - 1)"
      @select="goToHit"
      @close="closeSearch"
    />
    <!-- 就地编辑覆盖层：手势状态由本组件持有，编辑器纯展示 -->
    <XkCanvasEditor
      ref="canvasEditorRef"
      :mode="editor.mode"
      :x="editor.x"
      :y="editor.y"
      :categories="categories"
      @create-node="onEditorCreateNode"
      @create-edge="onEditorCreateEdge"
      @close="closeEditor"
    />
    <!-- 连线拖拽预览：SVG 覆盖层跟随鼠标，pointer-events 穿透 -->
    <svg v-if="linkDrag" class="graph3d-link-preview" data-link-preview>
      <line :x1="linkDrag.sx" :y1="linkDrag.sy" :x2="linkDrag.cx" :y2="linkDrag.cy" />
    </svg>
    <!-- 框选拖拽矩形：SVG 覆盖层跟随鼠标，pointer-events 穿透 -->
    <svg v-if="marquee" class="graph3d-marquee" data-marquee>
      <rect :x="marqueeRect.x" :y="marqueeRect.y" :width="marqueeRect.w" :height="marqueeRect.h" />
    </svg>
    <!-- WebGL 失败提示条 -->
    <div v-if="initFailed" class="graph3d-fallback">
      {{ $t('chart.init3dFailed') }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import ForceGraph3D from '3d-force-graph'
import SpriteText from 'three-spritetext'
import { message } from 'ant-design-vue'
import { assignCategoryColors } from '../utils/categoryColor.js'
import { effective } from '../store/themeStore.js'
import { locale } from '../store/localeStore.js'
import { t } from '../i18n.js'
import XkGraphSearch from './XkGraphSearch.vue'
import XkCanvasEditor from './XkCanvasEditor.vue'
import {
  clampEditorPos,
  pickNearestNode,
  focusPlaneDistance,
  buildMarqueeRect,
  pointInRect,
  segmentIntersectsRect
} from '../utils/canvasEdit.js'
import {
  linkDragModifierActive,
  marqueeModifierActive,
  modifierKeyLabel
} from '../utils/platformModifier.js'
import {
  composeFileName,
  createRecordingCanvas,
  createRecorder,
  saveVideoBlob,
  pickMimeType
} from '../utils/videoExport.js'
import {
  mergeGraphNodes,
  planHighlightRepaint,
  linkEnd,
  linkKey,
  labelThreshold,
  searchGraphNodes,
  SCENE_COLORS
} from '../utils/graphData.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  highlightLink: { type: Object, default: null },
  // 选中高亮的节点名（'' = 无）；与 highlightLink 互斥由 ChartView 保证
  highlightNode: { type: String, default: '' },
  showLinkName: { type: Boolean, default: false },
  showSmallLabels: { type: Boolean, default: false },
  // 聚焦模式邻域节点名（空数组 = 聚焦未开启；邻域为空同样以空数组表达）
  focusNodeNames: { type: Array, default: () => [] },
  // 深度聚焦：邻域外节点/边由灰化改为直接隐藏（走可见性管道，颜色管道不变）
  focusDeep: { type: Boolean, default: false },
  // 框选批量选中的节点名集合（与 highlightNode 互斥由 ChartView 保证）
  selectionNodes: { type: Array, default: () => [] },
  // 框选批量选中的边 index 集合（props.links 索引；与 highlightLink 互斥）
  selectionLinks: { type: Array, default: () => [] }
})

const emit = defineEmits([
  'node-click',
  'link-click',
  'background-click',
  'init-failed',
  'canvas-create-node',
  'canvas-create-edge',
  'marquee-select'
])

const containerRef = ref(null)
const initFailed = ref(false)

let graph = null
let resizeObserver = null

// 图例：从节点派生类目；hiddenCategories 控制显隐
const categories = computed(() => [...new Set(props.nodes.map((n) => n.category))])
/** 类目 → 颜色：按本图类型集合顺延分配，nodeColor/图例/高亮还原共用同一份 */
const categoryColors = computed(() => assignCategoryColors(categories.value))
/** 当前生效主题的场景色套（深/浅） */
const sceneColors = computed(() => SCENE_COLORS[effective.value])
const catColor = (cat) => categoryColors.value.get(String(cat ?? ''))
const hiddenCategories = ref(new Set())
// 环绕录制中图例显隐切换会改变画面（录屏不拦——录的正是用户操作）
const toggleCategory = (cat) => {
  if (videoMode.value === 'orbit') return
  const next = new Set(hiddenCategories.value)
  next.has(cat) ? next.delete(cat) : next.add(cat)
  hiddenCategories.value = next
  applyVisibility()
  // 搜索开着时命中列表实时跟随可见类目（当前项保持或重置，不飞相机）
  if (searchOpen.value) recomputeSearch(searchActiveName.value)
}

// 图内搜索（会话级视图辅助）：不写盘、不置脏、不进 undo/redo、换图即关
const searchCompRef = ref(null)
const searchOpen = ref(false)
const searchKeyword = ref('')
const searchHitNodes = ref([]) // 命中节点数组（nodes 原始顺序）
const searchActiveIdx = ref(0)
/** DOM 只渲染前 100 项（万级命中全渲染卡 UI），计数仍显示真实总数 */
const SEARCH_LIST_LIMIT = 100
const slicedSearchHits = computed(() => searchHitNodes.value.slice(0, SEARCH_LIST_LIMIT))
const searchActiveName = computed(() => searchHitNodes.value[searchActiveIdx.value]?.name ?? null)

/** 重算命中并触发重着色。prevActiveName：重算前的当前项名——还在命中里就保持
 *  （不飞相机），不在了重置到第 1 个（也不飞：飞行只由显式动作触发） */
const recomputeSearch = (prevActiveName = null) => {
  searchHitNodes.value = searchGraphNodes(props.nodes, searchKeyword.value, hiddenCategories.value)
  const idx = prevActiveName ? searchHitNodes.value.findIndex((n) => n.name === prevActiveName) : -1
  searchActiveIdx.value = idx > -1 ? idx : 0
  applyHighlight()
  // 深度聚焦：命中豁免的可见性实时跟随搜索结果（命中集变化→邻域外节点显隐翻转）
  applyVisibility()
}

const onSearchKeyword = (v) => {
  searchKeyword.value = v
  recomputeSearch()
  if (searchHitNodes.value.length) flyToActive()
}

/** 导航/点选跳到第 idx 个命中（回卷），并飞相机 */
const goToHit = (idx) => {
  if (!searchHitNodes.value.length) return
  searchActiveIdx.value = (idx + searchHitNodes.value.length) % searchHitNodes.value.length
  applyHighlight()
  flyToActive()
}

const flyToActive = () => {
  const name = searchActiveName.value
  if (name) focusCamera(new Set([name]))
}

const openSearch = () => {
  if (initFailed.value) return // 图都没有，搜索无意义
  // 环绕录制中不开搜索：命中跳转会抢走相机破坏录制（录屏不拦）
  if (videoMode.value === 'orbit') return
  searchOpen.value = true
  nextTick(() => searchCompRef.value?.focus())
}

/** 关闭搜索：清状态即清高亮（重算→applyHighlight 还原），相机留原地
 *  （规格：找到并留在那） */
const closeSearch = () => {
  searchOpen.value = false
  searchKeyword.value = ''
  recomputeSearch()
}

// ---- 画布直操手势层 ----
// 双击空白：建点；按住节点拖到另一节点：连边（Task 5）。editor 状态由本组件
// 持有（XkCanvasEditor 纯展示）；提交经 emit 交给 ChartView 走共享数据操作。
const canvasEditorRef = ref(null)
const editor = ref({ mode: '', x: 0, y: 0 })
let pendingWorldPos = null // 双击落点（世界坐标）：提交时随事件带出，不进 chartData
let pendingLinkEnds = null // 拖拽连线的两端点名：输名提交时随事件带出

/** 待落点节点：name → 世界坐标。新节点（无旧坐标）首次重灌时作初始位置，
 *  用后即删——力模拟接手后同名合并走旧坐标通道（mergeGraphNodes） */
const pendingDropPos = new Map()

/** 节点可见性谓词（按名）：applyVisibility 的 accessor 与画布手势拾取共用同一
 *  判定——图例隐藏/深度聚焦隐藏的节点既不渲染也不参与拖拽/双击命中，看得见
 *  才摸得着。深度聚焦：邻域外节点直接隐藏；图内搜索命中的豁免（找到了就该
 *  看见，否则跳转命中项时相机飞到空处） */
const buildNodeVisible = () => {
  const hidden = hiddenCategories.value
  const deepDim =
    props.focusDeep && props.focusNodeNames.length ? new Set(props.focusNodeNames) : null
  const searchNames =
    searchOpen.value || searchKeyword.value
      ? new Set(searchHitNodes.value.map((n) => n.name))
      : null
  // 类目按名索引：库对每条边调用 linkVisibility，find 是 O(n²)——万级节点图
  // （世界树 23k 边 × 16k 节点）同步跑数亿次比较，直接卡死
  const categoryByName = new Map(props.nodes.map((n) => [n.name, n.category]))
  return (name) => {
    const cat = categoryByName.get(name)
    if (cat !== undefined && hidden.has(cat)) return false
    if (deepDim && !(deepDim.has(name) || searchNames?.has(name))) return false
    return true
  }
}

/** 全节点屏幕投影（拾取用；连线手势期间相机被禁不会动，双击时瞬时拾取）；
 *  只投可见节点——隐形节点被命中会凭空起拖、建出看不见的边、吞双击 */
const projectAllNodes = () => {
  const nodeVisible = buildNodeVisible()
  return graph
    .graphData()
    .nodes.filter((n) => Number.isFinite(n.x) && nodeVisible(n.name))
    .map((n) => {
      const p = graph.graph2ScreenCoords(n.x, n.y, n.z)
      return { name: n.name, x: p.x, y: p.y }
    })
}

/** 双击落点：视线在「节点质心平面」上的交点——落点与已有节点同深度。
 *  深度取 focusPlaneDistance（质心沿视线投影），不能用相机-lookAt 距离：
 *  库装载取景把相机拉近后 lookAt 是 getter 合成的相机前方 1000 单位点，
 *  按它取深度会把新点放到远处，d3 center 力把混合深度节点群沿深度弹开，
 *  一侧节点飞越相机被近裁面裁掉（建第二个点后第一个点消失的根因） */
const screenToWorldOnFocusPlane = (cx, cy) => {
  const cam = graph.cameraPosition()
  const dist = focusPlaneDistance(
    { x: cam.x, y: cam.y, z: cam.z },
    cam.lookAt ?? { x: 0, y: 0, z: 0 },
    graph.graphData().nodes
  )
  return graph.screen2GraphCoords(cx, cy, dist)
}

/** 相对画布容器的坐标（canvas 填满容器，两者坐标系一致） */
const toLocal = (e) => {
  const rect = containerRef.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

const openEditor = (mode, cx, cy) => {
  const el = containerRef.value
  const pos = clampEditorPos(el.clientWidth, el.clientHeight, cx, cy)
  editor.value = { mode, x: pos.x, y: pos.y }
}

const closeEditor = () => {
  editor.value = { mode: '', x: 0, y: 0 }
  pendingWorldPos = null
  pendingLinkEnds = null
}

/** editor 打开期间挂 window Esc（bubble）：焦点不在编辑器内也能取消。
 *  编辑器内（含类目下拉展开态）的 Esc 由 XkCanvasEditor 根 div 的
 *  esc.capture 承接（vc-select 对 Esc stopPropagation 拦 bubble，capture
 *  抢先——一次 Esc 取消整单）；这里保持 bubble 只兜编辑器外的场景，
 *  不抢编辑器自己的取消链 */
const onWindowEsc = (e) => {
  if (e.key !== 'Escape') return
  closeEditor()
}
watch(
  () => editor.value.mode,
  (m) => {
    if (m) window.addEventListener('keydown', onWindowEsc)
    else window.removeEventListener('keydown', onWindowEsc)
  }
)

const onEditorCreateNode = ({ name, category, symbolSize, des }) => {
  const world = pendingWorldPos
  closeEditor()
  // symbolSize/des 须显式透传：这里重建 payload，漏挑字段会被 ChartView 的
  // 兜底吞成默认值（曾整批节点侧栏大小恒 50 的断点就在这层转发）
  emit('canvas-create-node', { name, category, symbolSize, des, world })
}

const onEditorCreateEdge = ({ name }) => {
  const ends = pendingLinkEnds
  closeEditor()
  emit('canvas-create-edge', { ...ends, name })
}

/** ChartView 建点成功后回填落点（expose；updateChart 的 watch 异步于本轮，
 *  此调用先于重灌执行，时序安全） */
const notifyNodeDropPos = (name, pos) => {
  if (name && pos) pendingDropPos.set(name, pos)
}

const onCanvasDblClick = (e) => {
  if (!graph || initFailed.value || editor.value.mode) return
  const { x: cx, y: cy } = toLocal(e)
  // 双击空白才建点；双击节点暂无语义（单击选中语义照旧）
  if (pickNearestNode(projectAllNodes(), cx, cy)) return
  pendingWorldPos = screenToWorldOnFocusPlane(cx, cy)
  openEditor('node', cx, cy)
}

// 连线拖拽状态：source 起点（实时重投影，力模拟未稳时起点跟随节点），cx/cy 鼠标
const linkDrag = ref(null) // { source, sx, sy, cx, cy } | null

// 框选拖拽状态：sx/sy 起点，cx/cy 鼠标（矩形随拖拽方向自适应，纯展示层）
const marquee = ref(null) // { sx, sy, cx, cy } | null
const marqueeRect = computed(() =>
  marquee.value
    ? buildMarqueeRect(marquee.value.sx, marquee.value.sy, marquee.value.cx, marquee.value.cy)
    : null
)

/** 框选拾取：矩形内的可见节点名 + 投影线段与矩形相交的可见边 __idx（props.links 索引）。
 *  边的判定是屏幕几何相交——两端都在框外但斜穿的边也算被框住；隐形（类目隐藏/
 *  深度聚焦隐藏）与布局未稳（无坐标）的边不参与，看得见才摸得着 */
const pickMarqueeSelection = (m) => {
  const rect = buildMarqueeRect(m.sx, m.sy, m.cx, m.cy)
  const nodes = projectAllNodes()
    .filter((p) => pointInRect(p.x, p.y, rect))
    .map((p) => p.name)
  const nodeVisible = buildNodeVisible()
  const links = []
  for (const l of graph.graphData().links) {
    const s = l.source
    const t = l.target
    if (
      typeof s !== 'object' ||
      typeof t !== 'object' ||
      !Number.isFinite(s.x) ||
      !Number.isFinite(t.x) ||
      !nodeVisible(s.name) ||
      !nodeVisible(t.name)
    )
      continue
    const p1 = graph.graph2ScreenCoords(s.x, s.y, s.z)
    const p2 = graph.graph2ScreenCoords(t.x, t.y, t.z)
    if (segmentIntersectsRect(p1.x, p1.y, p2.x, p2.y, rect)) links.push(l.__idx)
  }
  return { nodes, links }
}

// 建边主修饰键按平台分流：macOS ⌘（Ctrl 留给系统右键语义 ctrl+click），其余 Ctrl
const isDarwin = window.electronAPI.platform === 'darwin'

const onCanvasPointerDown = (e) => {
  if (!graph || initFailed.value || editor.value.mode || e.button !== 0) return
  // Shift+拖：框选（优先于连线判定——两修饰键同按时语义唯一）。从任意位置
  // 起拖（含节点上，对齐 Figma/PPT 橡皮筋行为），同样走 capture 截断独占手势
  if (marqueeModifierActive(e)) {
    const { x: cx, y: cy } = toLocal(e)
    e.stopPropagation()
    marquee.value = { sx: cx, sy: cy, cx, cy }
    graph.renderer().domElement.setPointerCapture(e.pointerId)
    return
  }
  // 普通拖让位 DragControls（移动节点）；主修饰键+拖才是连线（⌘/Ctrl 按平台）
  if (!linkDragModifierActive(e, isDarwin)) return
  const { x: cx, y: cy } = toLocal(e)
  const hit = pickNearestNode(projectAllNodes(), cx, cy)
  if (!hit) return // 修饰键+空白按下：交给 OrbitControls 旋转
  // 修饰键+命中节点：截断传播即独占手势——DragControls/OrbitControls 的
  // pointerdown 均为 bubble 且先于本组件注册，同为 bubble 拦不住它们抢拖；
  // 故本监听挂 capture 阶段（见 onMounted），stopPropagation 后二者收不到
  // pointerdown 不会启动，也无需再切换 controls().enabled
  e.stopPropagation()
  linkDrag.value = { source: hit.name, sx: cx, sy: cy, cx, cy }
  graph.renderer().domElement.setPointerCapture(e.pointerId)
}

const onCanvasPointerMove = (e) => {
  if (marquee.value) {
    // 手势独占期间截断 move：不给容器层喂「按键按住的移动」——three-render-objects
    // 据此置 isPointerDragging，而它的 pointerup 在 isPointerPressed=false（手势
    // pointerdown 已被截断）时提前返回不清该标志，残留成 stale 后**吞掉下一次
    // 普通单击**（框选完点空白不清选中/点节点不开侧栏，直到用户做一次真拖拽）。
    // 顺带冻结手势期间的悬停轮询，框选/连线时 tooltip 不乱闪
    e.stopPropagation()
    const { x: cx, y: cy } = toLocal(e)
    marquee.value.cx = cx
    marquee.value.cy = cy
    return
  }
  if (!linkDrag.value) return
  // 同上：连线拖拽期间截断 move（该手势同样截断了 pointerdown，残留的
  // isPointerDragging 会吞掉建边后的第一次单击）
  e.stopPropagation()
  const { x: cx, y: cy } = toLocal(e)
  // 起点实时重投影：布局未稳/节点在漂移时预览线不脱钩
  const src = graph.graphData().nodes.find((n) => n.name === linkDrag.value.source)
  if (src && Number.isFinite(src.x)) {
    const p = graph.graph2ScreenCoords(src.x, src.y, src.z)
    linkDrag.value.sx = p.x
    linkDrag.value.sy = p.y
  }
  linkDrag.value.cx = cx
  linkDrag.value.cy = cy
}

const onCanvasPointerUp = () => {
  if (marquee.value) {
    const m = marquee.value
    marquee.value = null
    // 空框（Shift+单击未拖）同样走 emit：父层以空集清选中，语义与点空白一致
    const { nodes, links } = pickMarqueeSelection(m)
    emit('marquee-select', nodes, links)
    return
  }
  if (!linkDrag.value) return
  const drag = linkDrag.value
  linkDrag.value = null
  const hit = pickNearestNode(projectAllNodes(), drag.cx, drag.cy)
  if (hit && hit.name !== drag.source) {
    pendingLinkEnds = { source: drag.source, target: hit.name }
    openEditor('edge', drag.cx, drag.cy)
  }
  // 松在空白/原节点：静默取消，不建边
}

// pointercancel（浏览器接管手势，如 alt-tab/触控边缘手势）：只清态，
// 不做拾取——复用 pointerUp 的拾取会在恰有节点处误弹编辑器/误选中
const onCanvasPointerCancel = () => {
  marquee.value = null
  if (!linkDrag.value) return
  linkDrag.value = null
}

/** 图实例吃的节点是 chartData 的拷贝（带内部 __idx 与 d3 坐标字段），不回写 props；
 *  同名节点保留旧坐标（编辑刷新后已布局的图不跳），按 name 建 Map 索引 O(n) 合并 */
const toGraphNodes = () => {
  const merged = mergeGraphNodes(props.nodes, graph?.graphData().nodes)
  // 画布建点落点：只对无旧坐标的新节点生效（d3 以 datum 上的 x/y/z 为初始位置）
  for (const n of merged) {
    const drop = pendingDropPos.get(n.name)
    if (drop && n.x === undefined) {
      n.x = drop.x
      n.y = drop.y
      n.z = drop.z
      pendingDropPos.delete(n.name)
    }
  }
  return merged
}
const toGraphLinks = () => props.links.map((l, i) => ({ ...l, __idx: i }))

/** 剥离内部字段的纯数据，发给父组件 */
const pureNode = (n) => ({
  name: n.name,
  des: n.des,
  symbolSize: n.symbolSize,
  category: n.category
})
const pureLink = (l) => ({
  source: linkEnd(l.source),
  target: linkEnd(l.target),
  name: l.name,
  des: l.des
})

const applyVisibility = () => {
  if (!graph) return
  const nodeVisible = buildNodeVisible()
  graph
    .nodeVisibility((n) => nodeVisible(n.name))
    // 两端任一不可见（类目隐藏/深度聚焦），边随之隐藏
    .linkVisibility((l) => nodeVisible(linkEnd(l.source)) && nodeVisible(linkEnd(l.target)))
}

/** 上一次应用的高亮/聚焦状态：增量重着色只处理组合色翻转的对象 */
let prevHlLink = null
let prevHlDim = null // Set<string>|null：上一次应用的聚焦邻域
let prevHlSearch = new Set() // Set<string>：上一次应用的搜索命中集合
let prevHlSearchActive = null // string|null：上一次应用的搜索当前项名
let prevHlNodes = null // string[]|null：上一次应用的选中高亮节点（单元素或 null）
let prevSelNodeNames = new Set() // Set<string>：上一次应用的框选节点集合
let prevSelLinkKeys = new Set() // Set<string>：上一次应用的框选边三元组键集合

const applyHighlight = () => {
  if (!graph) return
  const le = props.highlightLink
  const dim = props.focusNodeNames.length ? new Set(props.focusNodeNames) : null
  // 搜索集合：open 或残留关键词时按当前命中集合着色
  const search =
    searchOpen.value || searchKeyword.value
      ? new Set(searchHitNodes.value.map((n) => n.name))
      : new Set()
  const active = searchActiveName.value
  // 框选集合：节点名集合 + 边三元组键集合（index 经 props.links 归一，多重边安全）
  const selNodes = new Set(props.selectionNodes ?? [])
  const selLinks = new Set(
    (props.selectionLinks ?? [])
      .map((i) => props.links[i])
      .filter(Boolean)
      .map((l) => linkKey(l))
  )
  // accessor 描述"正确颜色"（选中 > 搜索当前项 > 搜索命中 > 聚焦外灰 >
  // 类目/底色）：graphData 重灌或 refresh 时库按它重建材质
  graph
    .nodeColor((n) =>
      props.highlightNode && n.name === props.highlightNode
        ? sceneColors.value.hl
        : selNodes.has(n.name)
          ? sceneColors.value.hl
          : active && n.name === active
            ? sceneColors.value.active
            : search.has(n.name)
              ? sceneColors.value.hit
              : dim && !dim.has(n.name)
                ? sceneColors.value.dim
                : catColor(n.category)
    )
    .linkColor((l) =>
      le && linkEnd(l.source) === le.source && linkEnd(l.target) === le.target && le.name === l.name
        ? sceneColors.value.hl
        : selLinks.has(linkKey(l))
          ? sceneColors.value.hl
          : dim && !(dim.has(linkEnd(l.source)) && dim.has(linkEnd(l.target)))
            ? sceneColors.value.dim
            : sceneColors.value.link
    )
  // 高亮/聚焦变化走增量：只改翻转对象的材质颜色。不调 refresh()——它会对每个
  // 节点重新执行 nodeThreeObject，重建全部 SpriteText 标签，大图逐个点选持续掉帧。
  // __threeObj 是 three-forcegraph 挂在 datum 上的内部引用，缺失（库升级破坏）
  // 时回退全量 refresh，保证高亮功能仍生效
  const { nodeRepaints, linkRepaints } = planHighlightRepaint({
    nodes: graph.graphData().nodes,
    links: graph.graphData().links,
    // 单选与框选同为 hl 档且互斥，合并成一个集合参与 diff
    prevNodes: new Set([...(prevHlNodes ?? []), ...prevSelNodeNames]),
    nextNodes: new Set([...(props.highlightNode ? [props.highlightNode] : []), ...selNodes]),
    prevLink: prevHlLink,
    nextLink: le,
    prevLinks: prevSelLinkKeys,
    nextLinks: selLinks,
    prevDimNodes: prevHlDim,
    nextDimNodes: dim,
    prevSearchNodes: prevHlSearch,
    nextSearchNodes: search,
    prevSearchActive: prevHlSearchActive,
    nextSearchActive: active,
    categoryColors: categoryColors.value,
    sceneColors: sceneColors.value
  })
  const repaints = [...nodeRepaints, ...linkRepaints]
  let painted = 0
  for (const [datum, color] of repaints) {
    const colorizable = datum.__threeObj?.material?.color
    if (colorizable?.set) {
      colorizable.set(color)
      painted++
    }
    // 节点标签（SpriteText 挂在节点 mesh 的 children 上）：球灰则标签一并退
    // 灰——深字挂在灰球上会成为主要视觉噪音，破坏背景感；边对象无
    // sprite 子级，循环空转无害
    for (const child of datum.__threeObj?.children ?? []) {
      if (child.isSprite && child.material?.color?.set) {
        child.material.color.set(
          color === sceneColors.value.dim ? sceneColors.value.dim : sceneColors.value.label
        )
      }
    }
  }
  if (repaints.length > 0 && painted === 0) graph.refresh()
  prevHlLink = le ? { source: le.source, target: le.target, name: le.name } : null
  prevHlNodes = props.highlightNode ? [props.highlightNode] : null
  prevSelNodeNames = selNodes
  prevSelLinkKeys = selLinks
  prevHlDim = dim
  prevHlSearch = search
  prevHlSearchActive = active
}

/** 标签显隐：最小的 60% 节点算小节点，按 showSmallLabels 开关决定其名称显隐；
 *  阈值规则（分位值落在最小尺寸层时上提一档，避免开关失效）见 utils/graphData */
const applyLabels = () => {
  if (!graph) return
  const threshold = labelThreshold(props.nodes, props.showSmallLabels)
  // 标签重建（开关/数据重灌）时遵守聚焦灰化：灰球不配黑字
  const dim = props.focusNodeNames.length ? new Set(props.focusNodeNames) : null
  graph
    .nodeThreeObjectExtend(true) // 库默认 false，不开会整个替换球体
    .nodeThreeObject((n) => {
      if ((n.symbolSize ?? 0) < threshold || !n.name) return null
      const sprite = new SpriteText(n.name)
      sprite.textHeight = 5
      sprite.color = dim && !dim.has(n.name) ? sceneColors.value.dim : sceneColors.value.label
      sprite.position.set(0, 7, 0)
      return sprite
    })
}

const applyInteraction = () => {
  if (!graph) return
  graph
    .nodeLabel((n) => (n.des ? `${n.name}${t('chart.nodeLabelSep')}${n.des}` : `${n.name}`))
    .linkLabel((l) => (props.showLinkName && l.name ? l.name : ''))
}

/** 大图力模拟自适应：库默认 ~300 tick / 15s 冷却，万级节点期间持续低帧率；
 *  提高温度衰减并压低冷却时长让布局尽快稳定，中小图保持库默认。
 *  须在 graphData 装载前调用，参数随本次引擎启动生效 */
const HEAVY_SIM_COUNT = 2000
const applySimulationScale = () => {
  if (!graph) return
  if (props.nodes.length > HEAVY_SIM_COUNT) {
    graph.d3AlphaDecay(0.05).cooldownTime(10000)
  } else {
    graph.d3AlphaDecay(0.0228).cooldownTime(15000)
  }
}

// 语言切换重设底部导航提示（querySelector 覆盖式文案，与 onMounted 内
// 首次覆盖同一目标；watch 回调执行时容器必已挂载——语言切换只发生在交互期）
watch(locale, () => {
  const navInfo = containerRef.value?.querySelector?.('.scene-nav-info')
  if (navInfo) navInfo.textContent = t('chart.navInfo3d', { modifier: modifierKeyLabel(isDarwin) })
})

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

  // 同 XkWorldGraph：画布初始即容器尺寸，免库默认 window 尺寸把文档撑出
  // 滚动条——常规小图一帧内被 ResizeObserver 修正不可见，大图场景构建的
  // 长帧会把溢出画足数百毫秒（width/height 的 resize 经 Kapsule debounce
  // 赶不上首帧，画布本体须 setSize 同步落定）
  const W = containerRef.value.clientWidth
  const H = containerRef.value.clientHeight
  graph.width(W).height(H)
  graph.renderer().setSize(W, H)

  applySimulationScale()

  graph
    .nodeId('name')
    // 场景背景随主题：浅色白底对齐旧版 2D 图表，深色 antd 基准底；
    // 深浅两套的元素色（SCENE_COLORS）都保证与各自背景拉开距离
    .backgroundColor(sceneColors.value.bg)
    .graphData({ nodes: toGraphNodes(), links: toGraphLinks() })
    // three-forcegraph 半径 = ∛val × nodeRelSize（val 映射体积）：直接传 symbolSize
    // 时 40/50/70 的半径仅 3.4/3.7/4.1，大小几乎不可辨；立方再缩放让半径与
    // symbolSize 线性成正比（40/50/70 → 2.9/3.7/5.2），与 2D 图 symbolSize 语义一致
    .nodeVal((n) => Math.pow(n.symbolSize ?? 50, 3) / 2500)
    .nodeRelSize(1)
    .onNodeClick((n) => {
      // 就地编辑器与侧栏选中互斥：编辑器开着时点节点＝放弃编辑去看属性
      if (editor.value.mode) closeEditor()
      // 场景 datum 是喂给 3D 库的拷贝，极端时序下可能滞后/丢字段于 chartData
      //（曾出现双击建点后点击该节点侧栏类目为空）。以 chartData 为准按名回查，
      // 侧栏永远拿真实数据；索引同步取自源数组，顺带消除 __idx 陈旧时
      // 「修改节点」按旧索引改错节点的隐患
      const idx = props.nodes.findIndex((p) => p.name === n?.name)
      emit('node-click', pureNode(idx > -1 ? props.nodes[idx] : n), idx > -1 ? idx : n.__idx)
    })
    .onLinkClick((l) => emit('link-click', pureLink(l), l.__idx))
    .onBackgroundClick(() => emit('background-click'))
    // 普通拖动=移动节点（库 DragControls；坐标不落盘仅会话内整理，编辑刷新
    // 经 mergeGraphNodes 保留同名旧坐标）；⌘/Ctrl+拖=连线（onCanvasPointerDown）
    .enableNodeDrag(true)
    // 不做引擎停止后的自动取景：库的 cooldownTime 默认 15s，届时自动
    // zoomToFit 会把用户已拖动过的视角抢回去。取景/复位只由「复位视图」
    // 按钮手动触发；打开图的初始距离由库自带的数据装载粗取景兜底
    // （那段带"相机未被用户修改"保护，不会抢视角）
    // 边默认宽度；link 的曲线默认直线即可
    .linkWidth(1)

  // 容器尺寸变化（侧边栏显隐、窗口缩放）由 ResizeObserver 自理，
  // 父组件不再需要 nextTick(resize) 联动；
  // 先于各 apply* 建立，避免任一 accessor 异常吞掉画布自适应
  //
  // 底部导航提示文案在 three-render-objects 内硬编码为英文且无配置项，
  // 这里替换为中文；类名随库版本锁定（^1.80）
  const navInfo = containerRef.value.querySelector('.scene-nav-info')
  if (navInfo) navInfo.textContent = t('chart.navInfo3d', { modifier: modifierKeyLabel(isDarwin) })

  resizeObserver = new ResizeObserver(() => {
    const el = containerRef.value
    if (el && graph) graph.width(el.clientWidth).height(el.clientHeight)
  })
  resizeObserver.observe(containerRef.value)

  applyVisibility()
  applyHighlight()
  applyLabels()
  applyInteraction()
  setRepulsion(100)

  // 画布直操手势：dblclick 在 canvas DOM 上（库不提供双击回调）；
  // pointerdown 挂 capture（Shift+拖框选与主修饰键+拖连线时截断传播，抢在
  // 先注册的 DragControls/OrbitControls 之前——见 onCanvasPointerDown），
  // move/up/cancel 常规 bubble
  const canvasEl = graph.renderer().domElement
  canvasEl.addEventListener('dblclick', onCanvasDblClick)
  canvasEl.addEventListener('pointerdown', onCanvasPointerDown, true)
  canvasEl.addEventListener('pointermove', onCanvasPointerMove)
  canvasEl.addEventListener('pointerup', onCanvasPointerUp)
  canvasEl.addEventListener('pointercancel', onCanvasPointerCancel)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  // editor 仍开着时销毁组件：卸 window Esc 防监听泄漏
  window.removeEventListener('keydown', onWindowEsc)
  // 录制会话开着销毁组件：卸环绕 Esc、停录屏 rAF/recorder（会话作废不下载）
  window.removeEventListener('keydown', onOrbitEsc)
  if (screenSession) {
    cancelAnimationFrame(screenSession.raf)
    screenSession.rec.stop()
    screenSession.restoreScale()
    screenSession = null
  }
  videoMode.value = ''
  if (graph) {
    const canvasEl = graph.renderer().domElement
    canvasEl.removeEventListener('dblclick', onCanvasDblClick)
    canvasEl.removeEventListener('pointerdown', onCanvasPointerDown, true)
    canvasEl.removeEventListener('pointermove', onCanvasPointerMove)
    canvasEl.removeEventListener('pointerup', onCanvasPointerUp)
    canvasEl.removeEventListener('pointercancel', onCanvasPointerCancel)
    graph._destructor()
    graph = null
  }
})

// 数据增量刷新：保留坐标重灌（toGraphNodes 已处理），不重启 didInitialFit
watch(
  () => [props.nodes, props.links],
  () => {
    if (!graph) return
    applySimulationScale()
    graph.graphData({ nodes: toGraphNodes(), links: toGraphLinks() })
    applyLabels()
    // 编辑/重灌后命中重算（当前项名保持或重置第 1 个，不飞相机；
    // 换图的显式关闭由 ChartView 调 closeSearch）
    if (searchOpen.value) recomputeSearch(searchActiveName.value)
  },
  { deep: true }
)

watch(() => props.highlightLink, applyHighlight, { deep: true })
watch(() => props.highlightNode, applyHighlight)
// 框选集合变化走增量重着色（与单击高亮同一管道，hl 档）
watch(() => [props.selectionNodes, props.selectionLinks], applyHighlight, { deep: true })
// 聚焦邻域变化同样要走重着色：灰化/还原是增量材质色更新，只挂相机会
// 出现「状态对、视觉没变」（冒烟截图已踩过）；深度聚焦开着时邻域还
// 决定可见性，须一并刷新
watch(
  () => props.focusNodeNames,
  () => {
    applyHighlight()
    if (props.focusDeep) applyVisibility()
  },
  { deep: true }
)
// 深度聚焦开/关：纯可见性翻转——颜色管道两态共用（隐藏节点底下仍按
// 聚焦规则着色），切回聚焦时灰球原样重现，无需重着色
watch(() => props.focusDeep, applyVisibility)
watch(() => props.showLinkName, applyInteraction)
watch(() => props.showSmallLabels, applyLabels)
// 主题切换：先重设各 accessor 为新色套并换背景，再强制一次全量 refresh。
// 增量管道按"语义状态"diff，主题切换语义未变会算出零变化，必须走 refresh
// 让库按新 accessor 重建全部材质（含 SpriteText 标签）。低频显式动作，
// 大图一次性重建标签可接受
watch(effective, () => {
  if (!graph) return
  graph.backgroundColor(sceneColors.value.bg)
  applyHighlight() // 重设 nodeColor/linkColor 为新色套
  applyLabels() // 标签色换新
  graph.refresh()
})

/** 聚焦开启前的相机快照：退出聚焦时恢复（不抢用户开启前的视角） */
let preFocusCamera = null // { x, y, z, lookAt: { x, y, z } }

/** 聚焦取景：保持当前视线方向推拉到邻域包围盒。
 *  力模拟尚未给出坐标（无有限 x/y/z 的邻域点）时跳过本次取景，
 *  由库的数据装载粗取景兜底 */
const focusCamera = (names) => {
  if (!graph) return
  const pts = graph.graphData().nodes.filter((n) => names.has(n.name) && Number.isFinite(n.x))
  if (!pts.length) return
  const c = { x: 0, y: 0, z: 0 }
  for (const p of pts) {
    c.x += p.x
    c.y += p.y
    c.z += p.z
  }
  c.x /= pts.length
  c.y /= pts.length
  c.z /= pts.length
  let r = 0
  for (const p of pts) r = Math.max(r, Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z))
  const cam = graph.cameraPosition() // getter：{ x, y, z, lookAt? }
  const look = cam.lookAt ?? { x: 0, y: 0, z: 0 }
  const dir = { x: cam.x - look.x, y: cam.y - look.y, z: cam.z - look.z }
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1
  const dist = Math.max(r * 2.2, 60) // fov 45° 经验系数；下限防贴脸
  graph.cameraPosition(
    { x: c.x + (dir.x / len) * dist, y: c.y + (dir.y / len) * dist, z: c.z + (dir.z / len) * dist },
    c,
    600
  )
}

const restoreFocusCamera = () => {
  if (!graph || !preFocusCamera) return
  const { x, y, z, lookAt } = preFocusCamera
  graph.cameraPosition({ x, y, z }, lookAt ?? { x: 0, y: 0, z: 0 }, 400)
  preFocusCamera = null
}

// 聚焦邻域变化 → 取景/恢复。首次开启快照相机；换焦点/改跳数只取景（退出仍回
// 开启前位）；关闭恢复快照
watch(
  () => props.focusNodeNames,
  (next, prev) => {
    if (!graph) return
    const had = prev?.length > 0
    const has = next.length > 0
    if (!had && has) {
      const cam = graph.cameraPosition()
      preFocusCamera = { x: cam.x, y: cam.y, z: cam.z, lookAt: cam.lookAt ?? { x: 0, y: 0, z: 0 } }
      focusCamera(new Set(next))
    } else if (had && has) {
      focusCamera(new Set(next))
    } else if (had && !has) {
      restoreFocusCamera()
    }
  },
  { deep: true }
)

/** 排斥力滑杆映射：d3 charge 强度 = -repulsion/10（滑杆 1~500 → -0.1~-50） */
const setRepulsion = (value) => {
  if (!graph) return
  const charge = graph.d3Force('charge')
  if (charge) charge.strength(-(value ?? 100) / 10)
  graph.d3ReheatSimulation()
}

/** 导出当前视图为 PNG 并触发下载；水印与文件名均经 videoExport 单源
 *  （与视频导出同一条管线），画布上不显示、只合成进导出产物 */
const exportPng = () => {
  if (!graph) return
  const src = graph.renderer().domElement
  const { canvas, draw } = createRecordingCanvas(src, sceneColors.value.watermark)
  draw()
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = composeFileName('png')
  a.click()
}

/** 视图复位：相机归位 + 全图取景 */
const resetView = () => {
  if (!graph) return
  graph.cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 400)
  graph.zoomToFit(600, 80)
}

// ---- 视频导出 / 实时录屏 ----
// 录制状态：'' 无 | 'orbit' 环绕动画 | 'screen' 实时录屏，两态互斥；
// data-video-recording 锚点供冒烟断言
const videoMode = ref('')
// 环绕录制 Esc 取消信号（resolve 定长等待 Promise）
let orbitCancel = null
// 录屏会话句柄（stopScreenRecording 消费后清空）
let screenSession = null

/** 环绕期间截断画布输入：capture 抢在库层 bubble 监听之前（同框选/连线
 *  手势的拦截模式），OrbitControls/DragControls 的 pointerdown、滚轮缩放、
 *  hover 轮询的 pointermove 全隔离，画面纯净 */
const blockCanvasInput = (e) => e.stopPropagation()
const ORBIT_BLOCK_EVENTS = ['pointerdown', 'pointermove', 'wheel']

const onOrbitEsc = (e) => {
  if (e.key === 'Escape' && videoMode.value === 'orbit') orbitCancel?.()
}

/** 录制分辨率提升：渲染缓冲按「目标高度 1080」放大（setPixelRatio 后
 *  WebGL 按新缓冲真实重渲染，高清是原生细节而非事后上采样；CSS 尺寸
 *  不动，屏幕显示无感）。画布缓冲跟随窗口×DPR（小窗常只有 ~1100×770），
 *  直接录它就是视频帧的上限；scale 按当前缓冲高折算（DPR 无关），
 *  下限 1（大窗口不降级）、上限 2.5（防小窗口缓冲爆炸）。
 *  返回恢复函数，录制结束必须调用 */
const RECORD_TARGET_H = 1080
const applyRecordingScale = () => {
  const renderer = graph.renderer()
  const el = renderer.domElement
  const prevRatio = renderer.getPixelRatio()
  const bufferH = el.clientHeight * prevRatio
  const scale = Math.min(2.5, Math.max(1, RECORD_TARGET_H / bufferH))
  if (scale > 1) {
    // setPixelRatio 不立即生效，须跟一次 setSize（按 CSS 尺寸，缓冲 = 尺寸 × ratio）
    renderer.setPixelRatio(prevRatio * scale)
    renderer.setSize(el.clientWidth, el.clientHeight)
  }
  return () => {
    if (scale > 1) {
      renderer.setPixelRatio(prevRatio)
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
  }
}

/** 环绕总扫角：一圈 */
const ORBIT_SWEEP = Math.PI * 2

/** 一键环绕动画导出：rAF 循环里手动绕图中心（TrackballControls 的
 *  target）旋转相机一圈。不能用 controls.autoRotate——three-render-objects
 *  默认 controlType 是 'trackball'（TrackballControls，无该属性，那是
 *  OrbitControls 独有）；也不能临时换 controls，交互手感会变。旋转中心取
 *  controls.target 而非 cameraPosition() getter 的 lookAt——后者是
 *  getLookAt() 用 quaternion 合成的「相机前方 1000 单位点」，图通常在
 *  相机前几十~几百单位处，拿它当中心会绕到图外；target 才是用户手动
 *  旋转与一切取景路径（zoomToFit/聚焦/复位）共同维护的真实旋转中心。
 *  角度按时间进度插值（帧率无关），每帧只转相对上一帧的增量；
 *  cameraPosition 双参 setter 无动画立即生效。锁交互靠 capture 截断
 *  （库层监听均为 bubble）+ 侧栏视角/布局入口禁用（ChartView 层）；
 *  水印与 PNG 单源；Esc 中途取消丢弃产物 */
const exportVideo = async (durationMs = 10000) => {
  if (!graph || videoMode.value) return
  const picked = pickMimeType()
  if (!picked) {
    message.info(t('chart.videoUnsupported'))
    return
  }
  const [mimeType, ext] = picked
  closeEditor()
  closeSearch() // 搜索开着会被命中跳转抢走相机
  videoMode.value = 'orbit'
  const canvasEl = graph.renderer().domElement
  for (const ev of ORBIT_BLOCK_EVENTS) canvasEl.addEventListener(ev, blockCanvasInput, true)
  window.addEventListener('keydown', onOrbitEsc)
  const target = graph.controls().target
  const look = { x: target.x, y: target.y, z: target.z }
  const restoreScale = applyRecordingScale()
  const { canvas: recCanvas, draw } = createRecordingCanvas(canvasEl, sceneColors.value.watermark)
  const rec = createRecorder({ canvas: recCanvas, mimeType })
  const startTs = performance.now()
  let swept = 0
  let raf = requestAnimationFrame(function loop() {
    const t = Math.min(1, (performance.now() - startTs) / durationMs)
    const angle = ORBIT_SWEEP * t - swept
    swept += angle
    const cam = graph.cameraPosition()
    const dx = cam.x - look.x
    const dz = cam.z - look.z
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    graph.cameraPosition(
      { x: look.x + dx * cos - dz * sin, y: cam.y, z: look.z + dx * sin + dz * cos },
      look
    )
    draw()
    raf = requestAnimationFrame(loop)
  })
  let cancelled = false
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, durationMs)
    orbitCancel = () => {
      cancelled = true
      clearTimeout(timer)
      resolve()
    }
  })
  orbitCancel = null
  cancelAnimationFrame(raf)
  const blob = await rec.stop()
  // 恢复交互与渲染分辨率（无论取消与否）
  restoreScale()
  for (const ev of ORBIT_BLOCK_EVENTS) canvasEl.removeEventListener(ev, blockCanvasInput, true)
  window.removeEventListener('keydown', onOrbitEsc)
  videoMode.value = ''
  if (cancelled) {
    message.info(t('chart.recordingCancelled'))
    return
  }
  // 主进程保存框：用户在框里取消（canceled）时静默返回，不视为错误
  const res = await saveVideoBlob(blob, ext)
  if (!res?.canceled) message.info(t('chart.videoExported'))
}

/** 实时录屏：同一合成管线（水印单源）但不锁交互不转相机——录的正是用户
 *  自由操作；Esc 不参与停止（仅「停止录屏」按钮，避免与画布编辑器等既有
 *  Esc 语义冲突）。互斥由 ChartView 按钮 disabled 保证，这里 false 只兜底 */
const startScreenRecording = () => {
  if (!graph || videoMode.value) return false
  const picked = pickMimeType()
  if (!picked) {
    message.info(t('chart.videoUnsupported'))
    return false
  }
  closeEditor()
  videoMode.value = 'screen'
  const restoreScale = applyRecordingScale()
  const { canvas: recCanvas, draw } = createRecordingCanvas(
    graph.renderer().domElement,
    sceneColors.value.watermark
  )
  const rec = createRecorder({ canvas: recCanvas, mimeType: picked[0] })
  let raf = requestAnimationFrame(function loop() {
    if (videoMode.value !== 'screen') return
    draw()
    raf = requestAnimationFrame(loop)
  })
  screenSession = { rec, raf, ext: picked[1], restoreScale }
  return true
}

const stopScreenRecording = async () => {
  if (videoMode.value !== 'screen' || !screenSession) return
  const session = screenSession
  screenSession = null
  videoMode.value = '' // 先清态：停 rAF 循环
  cancelAnimationFrame(session.raf)
  // paused 态下 stop 合法（规范允许 paused→inactive，已录分片正常封包）
  const blob = await session.rec.stop()
  session.restoreScale()
  const res = await saveVideoBlob(blob, session.ext)
  if (!res?.canceled) message.info(t('chart.recordingSaved'))
}

/** 录屏暂停/恢复（控制卡片用）：透传给 recorder 的 state 守卫幂等实现，
 *  成功转换返回 true；暂停期间 rAF 合成循环照跑（画布显示不受影响），
 *  只是 recorder 不再收帧 */
const pauseScreenRecording = () =>
  videoMode.value === 'screen' && !!screenSession && screenSession.rec.pause()

const resumeScreenRecording = () =>
  videoMode.value === 'screen' && !!screenSession && screenSession.rec.resume()

defineExpose({
  setRepulsion,
  exportPng,
  exportVideo,
  startScreenRecording,
  stopScreenRecording,
  pauseScreenRecording,
  resumeScreenRecording,
  resetView,
  focusCamera,
  openSearch,
  closeSearch,
  notifyNodeDropPos
})
</script>

<style scoped>
.graph3d-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.graph3d-container {
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
  background: var(--xk-float-bg);
  color: var(--xk-text); /* 深色下默认黑字不可见，须随主题 */
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

.graph3d-fallback {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--xk-fallback-bg);
  border: 1px solid var(--xk-fallback-border);
  color: var(--xk-fallback-text);
  border-radius: 6px;
  padding: 16px 24px;
  font: 14px sans-serif;
  z-index: 3;
}

.graph3d-link-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 3;
}

.graph3d-link-preview line {
  stroke: var(--xk-text);
  stroke-width: 2;
  stroke-dasharray: 6 4;
  opacity: 0.7;
}

.graph3d-marquee {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 3;
}

.graph3d-marquee rect {
  fill: var(--xk-text);
  fill-opacity: 0.06;
  stroke: var(--xk-text);
  stroke-width: 1;
  stroke-dasharray: 4 4;
  opacity: 0.8;
}
</style>
