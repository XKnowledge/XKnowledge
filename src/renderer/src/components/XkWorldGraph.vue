<template>
  <!-- data-charge-strength：已应用的 d3 charge 强度，冒烟断言锚点（同面板 data-focus-*） -->
  <div class="world-graph-wrap" :data-charge-strength="appliedCharge">
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
  expanded: { type: Object, default: () => ({}) },
  // 聚焦邻域（场景节点 id 集合）与深度聚焦开关；搜索命中 id 豁免深度隐藏
  // （找到了就该看见，否则跳转命中项时相机飞到空处）
  focusNodeIds: { type: Array, default: () => [] },
  focusDeep: { type: Boolean, default: false },
  searchHitIds: { type: Array, default: () => [] },
  // 会话级排斥力初值：刷新（loading v-else）整卸重挂组件后由父页回灌，
  // 滑杆与图力不再错位（bug记录 #2）；实时调节仍走 setRepulsion（需 reheat）
  repulsion: { type: Number, default: 100 }
})
const emit = defineEmits(['node-click', 'bg-click'])

const containerRef = ref(null)
const initFailed = ref(false)
/** 已应用到 d3 charge 的强度（冒烟断言锚点，见模板 data-charge-strength） */
const appliedCharge = ref(0)
let graph = null
let resizeObserver = null

const sceneColors = computed(() => SCENE_COLORS[effective.value])
/** 超节点统一色（不分社区）：缝合语义依赖用户命名质量（「水/火」这类通用词
 *  会被误缝合，分色会把污染放大成视觉噪声）——全景一律同色，颜色只属于
 *  展开域内部（图内类目色）。须与链接灰、聚焦去色 dim 拉开距离，双主题各一 */
const SUPER_NODE_COLORS = { light: '#4a8db5', dark: '#79b4cf' }
const superNodeColor = computed(() => SUPER_NODE_COLORS[effective.value])
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

/** 聚焦邻域 id 集（空数组 → null 表达「无聚焦，全图正常色」）与搜索命中集 */
const focusSet = computed(() => (props.focusNodeIds.length ? new Set(props.focusNodeIds) : null))
const searchSet = computed(() => (props.searchHitIds.length ? new Set(props.searchHitIds) : null))

/** 边端点取 id：字符串原样；d3 灌库后可能已解析为节点对象 */
const endId = (end) => (typeof end === 'object' && end !== null ? end.id : end)

const nodeColorOf = (n) => {
  if (focusSet.value && !focusSet.value.has(n.id)) return sceneColors.value.dim
  return n.__kind === 'graph'
    ? superNodeColor.value
    : (graphCatColors.value.get(n.graphId)?.get(String(n.category ?? '')) ?? sceneColors.value.link)
}

const linkColorOf = (l) => {
  if (
    focusSet.value &&
    !(focusSet.value.has(endId(l.source)) && focusSet.value.has(endId(l.target)))
  ) {
    return sceneColors.value.dim
  }
  return l.__kind === 'stitch' ? sceneColors.value.dim : sceneColors.value.link
}

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

/** 标签：超节点常显 title；展开域节点常显 name（单图 30~175 个，标签量可控）。
 *  重建时遵守聚焦灰化：灰球不配正常色标签（同 XkGraph3D 策略） */
const applyLabels = () => {
  if (!graph) return
  graph.nodeThreeObjectExtend(true).nodeThreeObject((n) => {
    const text = n.__kind === 'graph' ? n.title : n.name
    if (!text) return null
    const sprite = new SpriteText(text)
    sprite.textHeight = n.__kind === 'graph' ? 6 : 5
    sprite.color =
      focusSet.value && !focusSet.value.has(n.id) ? sceneColors.value.dim : sceneColors.value.label
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

  // 画布初始即容器尺寸：库默认取 window.innerWidth/innerHeight，比头部
  // 下方的容器大——构造出的画布直接把文档撑出双向滚动条；ResizeObserver
  // 的修正要等下一个渲染机会，会被场景构建的长帧推迟数百毫秒，溢出态被
  // 画足一拍才消失（bug记录 #1）。width/height 只改库内 state（其 resize
  // 经 Kapsule debounce 1ms 赶不上首帧），画布本体由 setSize 同步落定
  const W = containerRef.value.clientWidth
  const H = containerRef.value.clientHeight
  graph.width(W).height(H)
  graph.renderer().setSize(W, H)

  graph
    .nodeId('id')
    .backgroundColor(sceneColors.value.bg)
    .nodeVal((n) =>
      n.__kind === 'graph' ? superNodeVal(n.nodeCount) : Math.pow(n.symbolSize ?? 50, 3) / 2500
    )
    .nodeRelSize(1)
    .nodeColor(nodeColorOf)
    .nodeLabel((n) => (n.__kind === 'graph' ? `${n.title}（${n.nodeCount} 节点）` : n.name))
    .linkColor(linkColorOf)
    .linkWidth((l) => (l.__kind === 'stitch' ? 0.5 : 1))
    .onNodeClick((n) =>
      emit(
        'node-click',
        n.__kind === 'graph'
          ? { __kind: 'graph', id: n.id, title: n.title, nodeCount: n.nodeCount, source: n.source }
          : { __kind: 'node', id: n.id, name: n.name, graphId: n.graphId }
      )
    )
    // 空白处单击（旋转拖拽不算 click）：信息卡的「点主图关闭」
    .onBackgroundClick(() => emit('bg-click'))
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

  applyVisibility()
  // 滑杆语义对齐（同 XkGraph3D）：视图面板默认 100 → charge -10；不设则库默认
  // -30，用户第一次拖滑杆到 100 时布局会突跳。只设强度不 reheat——首次
  // graphData digest 尚未运行（state.layout 未定义），d3ReheatSimulation 会
  // 置 engineRunning=true，下一帧 tickFrame 读 state.layout.tick 即崩溃。
  // 强度取 props.repulsion：刷新重挂是全新实例，会话级排斥力经 prop 回灌（bug记录 #2）
  const charge = graph.d3Force('charge')
  const strength = -(props.repulsion ?? 100) / 10
  if (charge) charge.strength(strength)
  appliedCharge.value = strength

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

/** 上一次材质已反映的聚焦邻域：增量重着色只处理进出邻域的翻转对象 */
let prevDimSet = null

// 场景重灌（展开/收拢/刷新）：保留坐标，锚定力经 accessor 自动跟随。
// 材质经 accessor 重建已是正确灰化态，同步 prevDimSet 防 diff 基线漂移
watch(
  () => props.scene,
  () => {
    feed()
    applyLabels()
    prevDimSet = focusSet.value ? new Set(focusSet.value) : null
    graph?.d3ReheatSimulation()
  },
  { deep: true }
)

// 主题切换：换背景与全套颜色 accessor 后强制全量刷新（低频动作，同 XkGraph3D 策略）
watch(effective, () => {
  if (!graph) return
  graph.backgroundColor(sceneColors.value.bg).nodeColor(nodeColorOf).refresh()
  prevDimSet = focusSet.value ? new Set(focusSet.value) : null
})

/** 深度聚焦可见性：邻域外（搜索命中豁免）节点隐藏，边随两端隐藏。
 *  纯可见性翻转——颜色管道两态共用（隐藏节点底下仍按聚焦规则着色），
 *  切回灰化时原样重现，无需重着色（同 XkGraph3D） */
const applyVisibility = () => {
  if (!graph) return
  const focus = props.focusDeep ? focusSet.value : null
  const hits = searchSet.value
  const visible = (id) => !focus || focus.has(id) || hits?.has(id)
  graph
    .nodeVisibility((n) => visible(n.id))
    .linkVisibility((l) => visible(endId(l.source)) && visible(endId(l.target)))
}

/** 聚焦灰化：accessor 描述正确颜色（邻域外退灰）。必须重设 nodeColor/linkColor
 *  accessor 触发库重灌材质——库按颜色字符串共享材质实例（同色节点共用一个
 *  material），纯增量 color.set() 会污染邻域内同色节点（整个世界连带变灰），
 *  重设 accessor 让库下一帧按 accessor 重建材质自愈（同 XkGraph3D.applyHighlight
 *  的 accessor + 增量双轨）。增量 set() 仅提供同帧反馈；不调 refresh()，它会
 *  重建全部 SpriteText 标签，世界全景万级节点逐次调节持续掉帧 */
const applyDim = () => {
  if (!graph) return
  graph.nodeColor(nodeColorOf).linkColor(linkColorOf)
  const prev = prevDimSet
  const next = focusSet.value
  const linkIn = (l, set) => !!set && set.has(endId(l.source)) && set.has(endId(l.target))
  let wanted = 0
  let painted = 0
  for (const n of graph.graphData().nodes) {
    const was = prev?.has(n.id) ?? true // prev null = 无聚焦 = 全员正常色
    const is = next?.has(n.id) ?? true
    if (was !== is) {
      wanted++
      if (n.__threeObj?.material?.color) {
        const color = nodeColorOf(n)
        n.__threeObj.material.color.set(color)
        // 灰球上的标签一并退灰：深字挂灰球是主要视觉噪音；边对象无 sprite 子级，空转无害
        for (const child of n.__threeObj.children ?? []) {
          if (child.isSprite && child.material?.color?.set) {
            child.material.color.set(
              color === sceneColors.value.dim ? sceneColors.value.dim : sceneColors.value.label
            )
          }
        }
        painted++
      }
    }
  }
  for (const l of graph.graphData().links) {
    if (linkIn(l, prev) !== linkIn(l, next)) {
      wanted++
      if (l.__threeObj?.material?.color) {
        l.__threeObj.material.color.set(linkColorOf(l))
        painted++
      }
    }
  }
  // 库升级破坏 __threeObj 时回退全量 refresh，保证聚焦功能仍生效
  if (wanted > 0 && painted === 0) graph.refresh()
  prevDimSet = next ? new Set(next) : null
}

// 聚焦邻域变化：增量重着色 + 深度聚焦时连带刷新可见性
watch(
  () => props.focusNodeIds,
  () => {
    applyDim()
    if (props.focusDeep) applyVisibility()
  },
  { deep: true }
)
watch(() => props.focusDeep, applyVisibility)
watch(
  () => props.searchHitIds,
  () => {
    if (props.focusDeep) applyVisibility()
  },
  { deep: true }
)

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

/** 聚焦开启前的相机快照：退出聚焦时恢复（不抢用户开启前的视角） */
let preFocusCamera = null

// 聚焦邻域变化 → 取景/恢复。首次开启快照相机；换焦点/改跳数只取景（退出
// 仍回开启前位）；关闭恢复快照（同 XkGraph3D）
watch(
  () => props.focusNodeIds,
  (next, prev) => {
    if (!graph) return
    const had = prev?.length > 0
    const has = next.length > 0
    if (!had && has) {
      const cam = graph.cameraPosition()
      preFocusCamera = { x: cam.x, y: cam.y, z: cam.z, lookAt: cam.lookAt ?? { x: 0, y: 0, z: 0 } }
      focusCamera(next)
    } else if (had && has) {
      focusCamera(next)
    } else if (had && !has && preFocusCamera) {
      const { x, y, z, lookAt } = preFocusCamera
      graph.cameraPosition({ x, y, z }, lookAt, 400)
      preFocusCamera = null
    }
  },
  { deep: true }
)

/** 排斥力滑杆映射：d3 charge 强度 = -repulsion/10（滑杆 1~500 → -0.1~-50），同 XkGraph3D */
const setRepulsion = (value) => {
  if (!graph) return
  const charge = graph.d3Force('charge')
  const strength = -(value ?? 100) / 10
  if (charge) charge.strength(strength)
  appliedCharge.value = strength
  graph.d3ReheatSimulation()
}

defineExpose({ focusCamera, superNodeCoords, setRepulsion })
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
