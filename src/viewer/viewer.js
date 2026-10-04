// src/viewer/viewer.js
// 3D 图核心：构图参数、可见性（类目隐藏 ∪ 深度聚焦隐藏）、组合色
//（选中 > 搜索当前项 > 搜索命中 > 聚焦外灰 > 类目色）与增量重着色全部
// 对齐编辑器 XkGraph3D.vue；纯函数自 renderer utils import——导出物与
// 编辑器语义单源。动态成形：不带坐标喂图，力模拟在接收方机器上跑。
import ForceGraph3D from '3d-force-graph'
import SpriteText from 'three-spritetext'
import {
  SCENE_COLORS,
  labelThreshold,
  focusNeighborhood,
  defaultFocusNode,
  searchGraphNodes,
  planHighlightRepaint,
  linkEnd
} from '../renderer/src/utils/graphData.js'
import { assignCategoryColors } from '../renderer/src/utils/categoryColor.js'

/** 与编辑器同参：>2000 节点提高温度衰减并压低冷却，加速布局收敛 */
const HEAVY_SIM_COUNT = 2000

/**
 * @param {HTMLElement} container 全屏容器
 * @param {object} data serializeGraphForViewer 产物
 * @param {object} handlers onNodeClick(datum)：UI 展示详情；
 *   nodeLabelSep 悬停提示的分隔符（viewer i18n）
 */
export const createViewer = (
  container,
  data,
  { onNodeClick = () => {}, nodeLabelSep = ': ' } = {}
) => {
  const catColors = assignCategoryColors(data.categories.map((c) => c.name))
  const state = {
    theme: 'light',
    hiddenCategories: new Set(),
    searchKeyword: '',
    searchHits: [],
    searchActive: null,
    selected: null,
    focusMode: 'off', // off | focus | deep（灰化/隐藏，编辑器同三态）
    focusHops: 1,
    focusName: '',
    showSmallLabels: false
  }

  const sceneColors = () => SCENE_COLORS[state.theme]
  const graph = new ForceGraph3D(container)

  // 大图力模拟自适应（编辑器 applySimulationScale 同参）
  if (data.nodes.length > HEAVY_SIM_COUNT) {
    graph.d3AlphaDecay(0.05).cooldownTime(10000)
  } else {
    graph.d3AlphaDecay(0.0228).cooldownTime(15000)
  }

  // 斥力随导出携带：编辑器 XkGraph3D setRepulsion 同映射（charge 强度 =
  // -repulsion/10），接收方按导出时的滑杆值重排布局；旧版导出物无此字段
  // → 不动，保持库默认斥力。先于 graphData 设置，首 tick 即生效
  const charge = graph.d3Force('charge')
  if (Number.isFinite(data.repulsion) && data.repulsion > 0 && charge) {
    charge.strength(-data.repulsion / 10)
  }

  // 画布初始即容器尺寸（编辑器同款：防库默认 window 尺寸撑出滚动条）
  const W = container.clientWidth
  const H = container.clientHeight
  graph.width(W).height(H)
  graph.renderer().setSize(W, H)

  graph
    .nodeId('name')
    .backgroundColor(sceneColors().bg)
    // 图实例吃拷贝：库会在 datum 上挂 d3 坐标与 __threeObj 内部引用
    .graphData({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({ ...l }))
    })
    .nodeVal((n) => Math.pow(n.symbolSize ?? 50, 3) / 2500) // 半径与 symbolSize 线性成正比（编辑器同公式）
    .nodeRelSize(1)
    .linkWidth(1)
    .nodeLabel((n) => (n.des ? `${n.name}${nodeLabelSep}${n.des}` : `${n.name}`))
    .linkLabel((l) => l.name || '')
    .onNodeClick((n) => {
      // 聚焦开启时点击移焦点（编辑器「探照」语义），选中恒更新详情面板
      setState(
        state.focusMode !== 'off' ? { selected: n.name, focusName: n.name } : { selected: n.name }
      )
      onNodeClick(n)
    })
    .onBackgroundClick(() => {
      if (state.selected) setState({ selected: null })
    })

  const onResize = () => graph.width(container.clientWidth).height(container.clientHeight)
  const resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(container)

  // ---- 可见性：类目隐藏 ∪ 深度聚焦隐藏，搜索命中豁免（编辑器 buildNodeVisible 同语义）----
  const neighborhood = () => {
    if (state.focusMode === 'off' || !state.focusName) return new Set()
    return focusNeighborhood(data.nodes, data.links, state.focusName, state.focusHops)
  }
  const buildNodeVisible = () => {
    const hidden = state.hiddenCategories
    const deepDim = state.focusMode === 'deep' ? neighborhood() : null
    const searchNames = state.searchKeyword ? new Set(state.searchHits) : null
    const categoryByName = new Map(data.nodes.map((n) => [n.name, n.category]))
    return (name) => {
      const cat = categoryByName.get(name)
      if (cat !== undefined && hidden.has(cat)) return false
      if (deepDim && !(deepDim.has(name) || searchNames?.has(name))) return false
      return true
    }
  }
  const applyVisibility = () => {
    const nodeVisible = buildNodeVisible()
    graph
      .nodeVisibility((n) => nodeVisible(n.name))
      .linkVisibility((l) => nodeVisible(linkEnd(l.source)) && nodeVisible(linkEnd(l.target)))
  }

  // ---- 组合色 accessor + 增量重着色（编辑器 applyHighlight 同构）----
  let prevSel = new Set()
  let prevDim = null
  let prevSearch = new Set()
  let prevActive = null
  const applyHighlight = () => {
    const dim = state.focusMode === 'off' ? null : neighborhood()
    const search = state.searchKeyword ? new Set(state.searchHits) : new Set()
    const active = state.searchActive
    const sel = new Set(state.selected ? [state.selected] : [])
    graph
      .nodeColor((n) =>
        sel.has(n.name)
          ? sceneColors().hl
          : active && n.name === active
            ? sceneColors().active
            : search.has(n.name)
              ? sceneColors().hit
              : dim && !dim.has(n.name)
                ? sceneColors().dim
                : catColors.get(String(n.category ?? ''))
      )
      .linkColor((l) =>
        dim && !(dim.has(linkEnd(l.source)) && dim.has(linkEnd(l.target)))
          ? sceneColors().dim
          : sceneColors().link
      )
    // 增量重着色：只改组合色翻转对象的材质，不 refresh（refresh 重建全部
    // SpriteText 标签，大图掉帧）；__threeObj 缺失（库升级破坏）回退全量
    const { nodeRepaints, linkRepaints } = planHighlightRepaint({
      nodes: graph.graphData().nodes,
      links: graph.graphData().links,
      prevNodes: prevSel,
      nextNodes: sel,
      prevDimNodes: prevDim,
      nextDimNodes: dim,
      prevSearchNodes: prevSearch,
      nextSearchNodes: search,
      prevSearchActive: prevActive,
      nextSearchActive: active,
      categoryColors: catColors,
      sceneColors: sceneColors()
    })
    const repaints = [...nodeRepaints, ...linkRepaints]
    let painted = 0
    for (const [datum, color] of repaints) {
      const colorizable = datum.__threeObj?.material?.color
      if (colorizable?.set) {
        colorizable.set(color)
        painted++
      }
      // 节点标签一并退灰（灰球配深字是视觉噪音），边无 sprite 子级空转无害
      for (const child of datum.__threeObj?.children ?? []) {
        if (child.isSprite && child.material?.color?.set) {
          child.material.color.set(
            color === sceneColors().dim ? sceneColors().dim : sceneColors().label
          )
        }
      }
    }
    if (repaints.length > 0 && painted === 0) graph.refresh()
    prevSel = sel
    prevDim = dim
    prevSearch = search
    prevActive = active
  }

  // ---- 标签：阈值语义单源（labelThreshold），编辑器 applyLabels 同构 ----
  const applyLabels = () => {
    const threshold = labelThreshold(data.nodes, state.showSmallLabels)
    const dim = state.focusMode === 'off' ? null : neighborhood()
    graph
      .nodeThreeObjectExtend(true) // 不开会整个替换球体
      .nodeThreeObject((n) => {
        if ((n.symbolSize ?? 0) < threshold || !n.name) return null
        const sprite = new SpriteText(n.name)
        sprite.textHeight = 5
        sprite.color = dim && !dim.has(n.name) ? sceneColors().dim : sceneColors().label
        sprite.position.set(0, 7, 0)
        return sprite
      })
  }

  // ---- 主题：低频操作走全量 refresh（增量 diff 对场景色变化不感知）----
  const applyTheme = () => {
    graph.backgroundColor(sceneColors().bg)
    applyLabels()
    graph.refresh()
  }

  // ---- 状态机：UI 只调 setState，按 patch 类型最小化应用 ----
  const setState = (patch) => {
    Object.assign(state, patch)
    if ('searchKeyword' in patch || 'hiddenCategories' in patch) {
      const hits = searchGraphNodes(data.nodes, state.searchKeyword, state.hiddenCategories)
      state.searchHits = hits.map((n) => n.name)
      state.searchActive = state.searchHits[0] ?? null
    }
    if ('theme' in patch) {
      applyTheme()
      return
    }
    applyVisibility()
    applyHighlight()
    if ('showSmallLabels' in patch) applyLabels()
  }

  /** 相机飞向节点（搜索步进；视线 45° 偏移不遮挡目标） */
  const flyTo = (name, ms = 600) => {
    const n = graph.graphData().nodes.find((x) => x.name === name)
    if (!n || !Number.isFinite(n.x)) return
    const dist = 120
    const fac = Math.sqrt((dist * dist) / 3)
    graph.cameraPosition(
      { x: n.x + fac, y: n.y + fac, z: n.z + fac },
      { x: n.x, y: n.y, z: n.z },
      ms
    )
  }

  const zoomToFit = () => graph.zoomToFit(600, 80)

  // 初始应用一次（accessor 建立后首帧即正确着色/可见）
  applyVisibility()
  applyHighlight()
  applyLabels()

  return {
    graph,
    setState,
    flyTo,
    zoomToFit,
    getState: () => state,
    /** 节点连接数（详情面板；数据侧统计，不依赖场景对象） */
    degreeOf: (name) => data.links.filter((l) => l.source === name || l.target === name).length,
    defaultFocusName: () => defaultFocusNode(data.nodes, data.links),
    dispose: () => resizeObserver.disconnect()
  }
}
