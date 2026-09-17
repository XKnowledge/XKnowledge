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
        <span class="graph3d-legend-dot" :style="{ background: categoryColor(cat) }"></span>
        <span>{{ cat }}</span>
      </div>
    </div>
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
import {
  mergeGraphNodes,
  planHighlightRepaint,
  linkEnd,
  HL_COLOR,
  LINK_BASE_COLOR
} from '../utils/graphData.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  highlightNodes: { type: Array, default: () => [] },
  highlightLink: { type: Object, default: null },
  showLinkName: { type: Boolean, default: false },
  showSmallLabels: { type: Boolean, default: false }
})

const emit = defineEmits(['node-click', 'link-click', 'init-failed'])

const containerRef = ref(null)
const initFailed = ref(false)

let graph = null
let resizeObserver = null

// 图例：从节点派生类目；hiddenCategories 控制显隐
const categories = computed(() => [...new Set(props.nodes.map((n) => n.category))])
const hiddenCategories = ref(new Set())
const toggleCategory = (cat) => {
  const next = new Set(hiddenCategories.value)
  next.has(cat) ? next.delete(cat) : next.add(cat)
  hiddenCategories.value = next
  applyVisibility()
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
  graph
    .nodeVisibility((n) => !hidden.has(n.category))
    // 两端任一隐藏，边随之隐藏
    .linkVisibility((l) => {
      const endVisible = (name) => {
        const n = props.nodes.find((x) => x.name === name)
        return n ? !hidden.has(n.category) : true
      }
      return endVisible(linkEnd(l.source)) && endVisible(linkEnd(l.target))
    })
}

/** 上一次应用的高亮状态：增量重着色只处理翻转（进入/退出高亮）的对象 */
let prevHlNodes = new Set()
let prevHlLink = null

const applyHighlight = () => {
  if (!graph) return
  const hl = new Set(props.highlightNodes)
  const le = props.highlightLink
  // accessor 描述"正确颜色"：graphData 重灌或 refresh 时库按它重建材质
  graph
    .nodeColor((n) => (hl.has(n.name) ? HL_COLOR : categoryColor(n.category)))
    .linkColor((l) =>
      le && linkEnd(l.source) === le.source && linkEnd(l.target) === le.target && le.name === l.name
        ? HL_COLOR
        : LINK_BASE_COLOR
    )
  // 高亮变化走增量：只改翻转对象的材质颜色。不调 refresh()——它会对每个节点
  // 重新执行 nodeThreeObject，重建全部 SpriteText 标签，大图逐个点选持续掉帧。
  // __threeObj 是 three-forcegraph 挂在 datum 上的内部引用，缺失（库升级破坏）
  // 时回退全量 refresh，保证高亮功能仍生效
  const { nodeRepaints, linkRepaints } = planHighlightRepaint({
    nodes: graph.graphData().nodes,
    links: graph.graphData().links,
    prevNodes: prevHlNodes,
    prevLink: prevHlLink,
    nextNodes: hl,
    nextLink: le
  })
  const repaints = [...nodeRepaints, ...linkRepaints]
  let painted = 0
  for (const [datum, color] of repaints) {
    const colorizable = datum.__threeObj?.material?.color
    if (colorizable?.set) {
      colorizable.set(color)
      painted++
    }
  }
  if (repaints.length > 0 && painted === 0) graph.refresh()
  prevHlNodes = hl
  prevHlLink = le ? { source: le.source, target: le.target, name: le.name } : null
}

/** 大节点（symbolSize 前 30 名）常显名称，小节点按 showSmallLabels 开关决定 */
const BIG_LABEL_COUNT = 30
const applyLabels = () => {
  if (!graph) return
  // 开关打开 → threshold 取 -Infinity，所有节点都过条件；
  // 节点总数不足 30 时 slice 越界取到 undefined，比较结果为 false，同样全显（与旧模板行为一致）
  const threshold = props.showSmallLabels
    ? -Infinity
    : [...props.nodes]
        .sort((a, b) => (b.symbolSize ?? 0) - (a.symbolSize ?? 0))
        .slice(BIG_LABEL_COUNT - 1)
        .map((n) => n.symbolSize ?? 0)[0]
  graph
    .nodeThreeObjectExtend(true) // 库默认 false，不开会整个替换球体
    .nodeThreeObject((n) => {
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
    .nodeId('name')
    // 场景背景对齐旧版 2D 图表白底；深色元素（标签/边）在黑底不可见
    .backgroundColor('#ffffff')
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
    graph.graphData({ nodes: toGraphNodes(), links: toGraphLinks() })
    applyLabels()
  },
  { deep: true }
)

watch(() => props.highlightNodes, applyHighlight, { deep: true })
watch(() => props.highlightLink, applyHighlight, { deep: true })
watch(() => props.showLinkName, applyInteraction)
watch(() => props.showSmallLabels, applyLabels)

/** 排斥力滑杆映射：d3 charge 强度 = -repulsion/10（滑杆 1~500 → -0.1~-50） */
const setRepulsion = (value) => {
  if (!graph) return
  const charge = graph.d3Force('charge')
  if (charge) charge.strength(-(value ?? 100) / 10)
  graph.d3ReheatSimulation()
}

/** 导出当前视图为 PNG 并触发下载；水印只合成进导出图（画布上不显示），
 *  样式对齐旧版：黑色粗体、水平居中、位于底部约 5% 处 */
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
  ctx.fillStyle = '#000'
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

defineExpose({ setRepulsion, exportPng, resetView })
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
