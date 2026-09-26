<template>
  <div class="graph3d-wrap">
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
    <!-- 图内搜索覆盖层（Ctrl+F）：状态由本组件持有，XkGraphSearch 纯展示 -->
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
    <!-- WebGL 失败提示条 -->
    <div v-if="initFailed" class="graph3d-fallback">
      3D 视图初始化失败（显卡驱动异常？），侧边栏编辑功能仍可使用
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import ForceGraph3D from '3d-force-graph'
import SpriteText from 'three-spritetext'
import { assignCategoryColors } from '../utils/categoryColor.js'
import { effective } from '../store/themeStore.js'
import XkGraphSearch from './XkGraphSearch.vue'
import {
  mergeGraphNodes,
  planHighlightRepaint,
  linkEnd,
  labelThreshold,
  searchGraphNodes,
  SCENE_COLORS
} from '../utils/graphData.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  highlightNodes: { type: Array, default: () => [] },
  highlightLink: { type: Object, default: null },
  showLinkName: { type: Boolean, default: false },
  showSmallLabels: { type: Boolean, default: false },
  // 聚焦模式邻域节点名（空数组 = 聚焦未开启；邻域为空同样以空数组表达）
  focusNodeNames: { type: Array, default: () => [] },
  // 深度聚焦：邻域外节点/边由灰化改为直接隐藏（走可见性管道，颜色管道不变）
  focusDeep: { type: Boolean, default: false }
})

const emit = defineEmits(['node-click', 'link-click', 'init-failed'])

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
const toggleCategory = (cat) => {
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
  const idx = prevActiveName
    ? searchHitNodes.value.findIndex((n) => n.name === prevActiveName)
    : -1
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

/** 图实例吃的节点是 chartData 的拷贝（带内部 __idx 与 d3 坐标字段），不回写 props；
 *  同名节点保留旧坐标（编辑刷新后已布局的图不跳），按 name 建 Map 索引 O(n) 合并 */
const toGraphNodes = () => mergeGraphNodes(props.nodes, graph?.graphData().nodes)
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
  const hidden = hiddenCategories.value
  // 深度聚焦：邻域外节点直接隐藏；图内搜索命中的豁免（找到了就该看见，
  // 否则跳转命中项时相机飞到空处）
  const deepDim =
    props.focusDeep && props.focusNodeNames.length ? new Set(props.focusNodeNames) : null
  const searchNames =
    searchOpen.value || searchKeyword.value
      ? new Set(searchHitNodes.value.map((n) => n.name))
      : null
  // 端点类目按名索引：库对每条边调用 linkVisibility，find 是 O(n²)——
  // 万级节点图（世界树 23k 边 × 16k 节点）同步跑数亿次比较，直接卡死
  const categoryByName = new Map(props.nodes.map((n) => [n.name, n.category]))
  const nodeVisible = (name) => {
    const cat = categoryByName.get(name)
    if (cat !== undefined && hidden.has(cat)) return false
    if (deepDim && !(deepDim.has(name) || searchNames?.has(name))) return false
    return true
  }
  graph
    .nodeVisibility((n) => nodeVisible(n.name))
    // 两端任一不可见（类目隐藏/深度聚焦），边随之隐藏
    .linkVisibility((l) => nodeVisible(linkEnd(l.source)) && nodeVisible(linkEnd(l.target)))
}

/** 上一次应用的高亮/聚焦状态：增量重着色只处理组合色翻转的对象 */
let prevHlNodes = new Set()
let prevHlLink = null
let prevHlDim = null // Set<string>|null：上一次应用的聚焦邻域
let prevHlSearch = new Set() // Set<string>：上一次应用的搜索命中集合
let prevHlSearchActive = null // string|null：上一次应用的搜索当前项名

const applyHighlight = () => {
  if (!graph) return
  const hl = new Set(props.highlightNodes)
  const le = props.highlightLink
  const dim = props.focusNodeNames.length ? new Set(props.focusNodeNames) : null
  // 搜索集合：open 或残留关键词时按当前命中集合着色
  const search =
    searchOpen.value || searchKeyword.value
      ? new Set(searchHitNodes.value.map((n) => n.name))
      : new Set()
  const active = searchActiveName.value
  // accessor 描述"正确颜色"（高亮 > 搜索当前项 > 搜索命中 > 聚焦外灰 > 类目/底色）：
  // graphData 重灌或 refresh 时库按它重建材质
  graph
    .nodeColor((n) =>
      hl.has(n.name)
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
    prevNodes: prevHlNodes,
    prevLink: prevHlLink,
    nextNodes: hl,
    nextLink: le,
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
  prevHlNodes = hl
  prevHlLink = le ? { source: le.source, target: le.target, name: le.name } : null
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
    .nodeLabel((n) => (n.des ? `${n.name}：${n.des}` : `${n.name}`))
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
    .onNodeClick((n) => emit('node-click', pureNode(n), n.__idx))
    .onLinkClick((l) => emit('link-click', pureLink(l), l.__idx))
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
  if (navInfo) navInfo.textContent = '左键：旋转　滚轮/中键：缩放　右键：平移'

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
    applySimulationScale()
    graph.graphData({ nodes: toGraphNodes(), links: toGraphLinks() })
    applyLabels()
    // 编辑/重灌后命中重算（当前项名保持或重置第 1 个，不飞相机；
    // 换图的显式关闭由 ChartView 调 closeSearch）
    if (searchOpen.value) recomputeSearch(searchActiveName.value)
  },
  { deep: true }
)

watch(() => props.highlightNodes, applyHighlight, { deep: true })
watch(() => props.highlightLink, applyHighlight, { deep: true })
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
  const pts = graph
    .graphData()
    .nodes.filter((n) => names.has(n.name) && Number.isFinite(n.x))
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

/** 导出当前视图为 PNG 并触发下载；水印只合成进导出图（画布上不显示），
 *  样式对齐旧版：粗体、水平居中、位于底部约 5% 处；颜色随主题背景
 *  （浅底黑字/深底白字，导出即所见） */
const exportPng = () => {
  if (!graph) return
  const src = graph.renderer().domElement
  const canvas = document.createElement('canvas')
  canvas.width = src.width
  canvas.height = src.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(src, 0, 0)
  const fontSize = Math.max(18, Math.round(canvas.height * 0.022))
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.fillStyle = sceneColors.value.watermark
  ctx.textAlign = 'center'
  ctx.fillText('By XKnowledge', canvas.width / 2, canvas.height * 0.95)
  const url = canvas.toDataURL('image/png')
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

defineExpose({ setRepulsion, exportPng, resetView, focusCamera, openSearch, closeSearch })
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
</style>
