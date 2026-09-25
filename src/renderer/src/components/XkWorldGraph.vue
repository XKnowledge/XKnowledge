<template>
  <div class="world-graph-wrap">
    <!-- 3D 库独占挂载点（同 XkGraph3D 的冷启动坑：覆盖层放外面） -->
    <div ref="containerRef" class="world-graph-container"></div>
    <div v-if="initFailed" class="world-graph-fallback">
      3D 视图初始化失败（显卡驱动异常？），世界层不可用
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import ForceGraph3D from '3d-force-graph'
import SpriteText from 'three-spritetext'
import { forceX, forceY, forceZ } from 'd3-force-3d'
import { assignCategoryColors } from '../utils/categoryColor.js'
import { effective } from '../store/themeStore.js'
import { SCENE_COLORS } from '../utils/graphData.js'
import { superNodeVal, ANCHOR_STRENGTH } from '../utils/worldGraph.js'

const props = defineProps({
  scene: { type: Object, default: () => ({ nodes: [], links: [] }) },
  expanded: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['node-click'])

const containerRef = ref(null)
const initFailed = ref(false)
let graph = null
let resizeObserver = null

const sceneColors = computed(() => SCENE_COLORS[effective.value])
/** 社区色：按本场景社区集合分配（assignCategoryColors 保证同集合同分配） */
const communityColors = computed(() =>
  assignCategoryColors(
    props.scene.nodes.filter((n) => n.__kind === 'graph').map((n) => String(n.community ?? 0))
  )
)
/** 展开域内原类目色：per-graph 分配（图内观感与单图视图一致） */
const graphCatColors = computed(() => {
  const byGraph = new Map()
  for (const n of props.scene.nodes) {
    if (n.__kind !== 'node') continue
    if (!byGraph.has(n.graphId)) byGraph.set(n.graphId, new Set())
    byGraph.get(n.graphId).add(n.category ?? '')
  }
  const out = new Map()
  for (const [graphId, cats] of byGraph) out.set(graphId, assignCategoryColors(cats))
  return out
})

const nodeColorOf = (n) =>
  n.__kind === 'graph'
    ? communityColors.value.get(String(n.community ?? 0))
    : (graphCatColors.value.get(n.graphId)?.get(String(n.category ?? '')) ?? sceneColors.value.link)

/** 重灌时按 id 保留旧坐标（展开/收拢不重聚类）；语义同 graphData.mergeGraphNodes */
const mergeCoords = (next) => {
  const old = new Map((graph?.graphData().nodes ?? []).map((n) => [n.id, n]))
  return next.map((n, i) => {
    const o = old.get(n.id)
    return o ? { ...n, __idx: i, x: o.x, y: o.y, z: o.z } : { ...n, __idx: i }
  })
}

const feed = () => {
  if (!graph) return
  graph.graphData({
    nodes: mergeCoords(props.scene.nodes),
    links: props.scene.links.map((l, i) => ({ ...l, __idx: i }))
  })
}

/** 标签：超节点常显 title；展开域节点常显 name（单图 30~175 个，标签量可控） */
const applyLabels = () => {
  if (!graph) return
  graph.nodeThreeObjectExtend(true).nodeThreeObject((n) => {
    const text = n.__kind === 'graph' ? n.title : n.name
    if (!text) return null
    const sprite = new SpriteText(text)
    sprite.textHeight = n.__kind === 'graph' ? 6 : 5
    sprite.color = sceneColors.value.label
    sprite.position.set(0, 7, 0)
    return sprite
  })
}

onMounted(() => {
  try {
    graph = new ForceGraph3D(containerRef.value, {
      rendererConfig: { preserveDrawingBuffer: true }
    })
  } catch (err) {
    console.error('世界 3D 图初始化失败', err)
    initFailed.value = true
    return
  }

  graph
    .nodeId('id')
    .backgroundColor(sceneColors.value.bg)
    .nodeVal((n) =>
      n.__kind === 'graph' ? superNodeVal(n.nodeCount) : Math.pow(n.symbolSize ?? 50, 3) / 2500
    )
    .nodeRelSize(1)
    .nodeColor(nodeColorOf)
    .nodeLabel((n) => (n.__kind === 'graph' ? `${n.title}（${n.nodeCount} 节点）` : n.name))
    .linkColor((l) => (l.__kind === 'stitch' ? sceneColors.value.dim : sceneColors.value.link))
    .linkWidth((l) => (l.__kind === 'stitch' ? 0.5 : 1))
    .onNodeClick((n) =>
      emit(
        'node-click',
        n.__kind === 'graph'
          ? { __kind: 'graph', id: n.id, title: n.title, nodeCount: n.nodeCount, source: n.source }
          : { __kind: 'node', id: n.id, name: n.name, graphId: n.graphId }
      )
    )
  feed()
  applyLabels()

  // 展开域锚定力：真实节点被拉向其图展开时记录的超节点坐标。
  // 力对象只挂一次，accessor 闭包读最新 props——收拢域节点已移除，力自然失效
  const anchorOf = (n) => (n.__kind === 'node' ? props.expanded[n.graphId]?.anchor : null)
  graph
    .d3Force(
      'worldAnchorX',
      forceX((n) => anchorOf(n)?.x ?? 0).strength((n) => (anchorOf(n) ? ANCHOR_STRENGTH : 0))
    )
    .d3Force(
      'worldAnchorY',
      forceY((n) => anchorOf(n)?.y ?? 0).strength((n) => (anchorOf(n) ? ANCHOR_STRENGTH : 0))
    )
    .d3Force(
      'worldAnchorZ',
      forceZ((n) => anchorOf(n)?.z ?? 0).strength((n) => (anchorOf(n) ? ANCHOR_STRENGTH : 0))
    )

  const navInfo = containerRef.value.querySelector('.scene-nav-info')
  if (navInfo) navInfo.textContent = '左键：旋转　滚轮/中键：缩放　右键：平移'

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

// 场景重灌（展开/收拢/刷新）：保留坐标，锚定力经 accessor 自动跟随
watch(
  () => props.scene,
  () => {
    feed()
    applyLabels()
    graph?.d3ReheatSimulation()
  },
  { deep: true }
)

// 主题切换：换背景与全套颜色 accessor 后强制全量刷新（低频动作，同 XkGraph3D 策略）
watch(effective, () => {
  if (!graph) return
  graph.backgroundColor(sceneColors.value.bg).nodeColor(nodeColorOf).refresh()
})

/** 相机飞到 id 集合包围盒（沿当前视线推拉）；命中有限坐标返回 true，无坐标返回 false */
const focusCamera = (ids) => {
  if (!graph) return false
  const idSet = new Set(ids)
  const pts = graph.graphData().nodes.filter((n) => idSet.has(n.id) && Number.isFinite(n.x))
  if (!pts.length) return false
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
  const cam = graph.cameraPosition()
  const look = cam.lookAt ?? { x: 0, y: 0, z: 0 }
  const dir = { x: cam.x - look.x, y: cam.y - look.y, z: cam.z - look.z }
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1
  const dist = Math.max(r * 2.2, 60)
  graph.cameraPosition(
    { x: c.x + (dir.x / len) * dist, y: c.y + (dir.y / len) * dist, z: c.z + (dir.z / len) * dist },
    c,
    600
  )
  return true
}

/** 超节点当前 d3 坐标（展开锚点用）；未布局/不存在返回 null */
const superNodeCoords = (id) => {
  const n = graph?.graphData().nodes.find((x) => x.id === id)
  return n && Number.isFinite(n.x) ? { x: n.x, y: n.y, z: n.z } : null
}

defineExpose({ focusCamera, superNodeCoords })
</script>

<style scoped>
.world-graph-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}
.world-graph-container {
  width: 100%;
  height: 100%;
}
.world-graph-fallback {
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
