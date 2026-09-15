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
    return old
      ? {
          ...n,
          __idx: i,
          x: old.x,
          y: old.y,
          z: old.z,
          ...(old.fx !== undefined && { fx: old.fx, fy: old.fy, fz: old.fz })
        }
      : { ...n, __idx: i }
  })
const toGraphLinks = () => props.links.map((l, i) => ({ ...l, __idx: i }))

/** d3 布局会把 link 的 source/target 反解为节点对象；归一化回名字符串再比较 */
const linkEnd = (v) => (typeof v === 'object' && v !== null ? v.name : v)

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

const applyHighlight = () => {
  if (!graph) return
  const hl = new Set(props.highlightNodes)
  const le = props.highlightLink
  graph
    .nodeColor((n) => (hl.has(n.name) ? '#e8684a' : categoryColor(n.category)))
    .linkColor((l) =>
      le && linkEnd(l.source) === le.source && linkEnd(l.target) === le.target && le.name === l.name
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
    .nodeId('name')
    // 场景背景对齐旧版 2D 图表白底；深色元素（标签/水印/边）在黑底不可见
    .backgroundColor('#ffffff')
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

  // 容器尺寸变化（侧边栏显隐、窗口缩放）由 ResizeObserver 自理，
  // 父组件不再需要 nextTick(resize) 联动；
  // 先于各 apply* 建立，避免任一 accessor 异常吞掉画布自适应
  resizeObserver = new ResizeObserver(() => {
    const el = containerRef.value
    if (el && graph) graph.width(el.clientWidth).height(el.clientHeight)
  })
  resizeObserver.observe(containerRef.value)

  applyVisibility()
  applyHighlight()
  applyLabels()
  applyInteraction()
  setRepulsion(1000)
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
