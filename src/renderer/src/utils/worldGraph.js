/**
 * 世界层纯函数：超图构建、跨库搜索、展开/收拢状态变换、
 * 缝合边三态与渲染场景导出。全部无副作用——组件层（XkWorldGraph /
 * WorldView）只做装配。数据形状见 docs/superpowers/specs/2026-09-25-world-graph-design.md
 */

/** 展开域锚定力强度（forceX/Y/Z strength），实现期可调 */
export const ANCHOR_STRENGTH = 0.05

/** 超节点体积：nodeCount 与单图 symbolSize 同语义（立方缩放）；
 *  空图（nodeCount=0/缺省）以 10 兜底防不可见 */
export const superNodeVal = (nodeCount) => Math.pow(Math.max(nodeCount ?? 0, 10), 3) / 2500

/**
 * 超图：每个 .xk 一个超节点；缝合组（同名 ≥2 图）两两连边，
 * 同一对超节点间多个共享名聚合为一条（weight = 名字数）。
 */
export const buildSuperGraph = (graphs, stitches) => {
  const nodes = (graphs ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    source: g.source,
    nodeCount: g.nodeCount,
    __kind: 'graph'
  }))
  const pairs = new Map() // 'idA\0idB'(A<B) → { weight, sharedNames }
  for (const { name, graphIds } of stitches ?? []) {
    const ids = [...graphIds].sort()
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = ids[i] + '\u0000' + ids[j]
        const rec = pairs.get(key) ?? { weight: 0, sharedNames: [] }
        rec.weight++
        rec.sharedNames.push(name)
        pairs.set(key, rec)
      }
    }
  }
  const links = [...pairs.entries()].map(([key, rec]) => {
    const [source, target] = key.split('\u0000')
    return { source, target, weight: rec.weight, sharedNames: rec.sharedNames, __kind: 'stitch' }
  })
  return { nodes, links }
}

/** 跨全库节点搜索：name/des 大小写不敏感子串（语义同 searchGraphNodes） */
export const searchWorldNodes = (nodes, graphsById, keyword) => {
  const kw = String(keyword ?? '')
    .trim()
    .toLowerCase()
  if (!kw) return []
  return (nodes ?? [])
    .filter(
      (n) =>
        String(n.name ?? '')
          .toLowerCase()
          .includes(kw) ||
        String(n.des ?? '')
          .toLowerCase()
          .includes(kw)
    )
    .map((n) => ({
      graphId: n.graphId,
      graphTitle: graphsById?.get(n.graphId)?.title ?? '',
      name: n.name,
      des: n.des,
      category: n.category
    }))
}

/** 世界状态：超图 + 展开登记 + 展开域真实节点/边。expanded 用普通对象（Vue 响应性友好） */
export const createWorldState = (graphs, stitches) => {
  const built = buildSuperGraph(graphs, stitches)
  return {
    superNodes: built.nodes,
    superLinks: built.links,
    expanded: {}, // graphId → { anchor: {x,y,z} }
    graphNodes: [], // { ...节点, id: `${graphId}|${name}`, graphId, __kind: 'node' }
    graphLinks: [] // { ...边, source/target 前缀化, graphId, __kind: 'link' }
  }
}

/** 展开：锚定坐标来自超节点当前 d3 位置（组件传入）；幂等 */
export const applyExpansion = (state, graphId, chart, anchor) => {
  if (state.expanded[graphId]) return state
  return {
    ...state,
    expanded: { ...state.expanded, [graphId]: { anchor: anchor ?? { x: 0, y: 0, z: 0 } } },
    graphNodes: [
      ...state.graphNodes,
      ...chart.nodes.map((n) => ({ ...n, id: `${graphId}|${n.name}`, graphId, __kind: 'node' }))
    ],
    graphLinks: [
      ...state.graphLinks,
      ...chart.links.map((l) => ({
        ...l,
        source: `${graphId}|${l.source}`,
        target: `${graphId}|${l.target}`,
        graphId,
        __kind: 'link'
      }))
    ]
  }
}

/** 收拢：移除该域真实节点/边与展开登记；域内坐标随会话丢弃 */
export const applyCollapse = (state, graphId) => {
  if (!state.expanded[graphId]) return state
  const expanded = { ...state.expanded }
  delete expanded[graphId]
  return {
    ...state,
    expanded,
    graphNodes: state.graphNodes.filter((n) => n.graphId !== graphId),
    graphLinks: state.graphLinks.filter((l) => l.graphId !== graphId)
  }
}

/**
 * 渲染场景（喂 ForceGraph3D）：
 * - 节点 = 未展开超节点 + 全部展开域真实节点
 * - 边 = 展开域真实边 + 缝合边三态（收拢聚合 / 单端脐带 per-name / 双端节点对 per-name）
 * - 端点悬空（索引快照与文件内容失配）跳过，绝不产出引用不存在节点的边
 */
export const worldScene = (state) => {
  const nodes = [...state.superNodes.filter((n) => !state.expanded[n.id]), ...state.graphNodes]
  const idSet = new Set(nodes.map((n) => n.id))
  const links = [...state.graphLinks]
  for (const l of state.superLinks) {
    const aExp = !!state.expanded[l.source]
    const bExp = !!state.expanded[l.target]
    if (!aExp && !bExp) {
      links.push({ source: l.source, target: l.target, __kind: 'stitch', weight: l.weight })
      continue
    }
    for (const name of l.sharedNames) {
      const source = aExp ? `${l.source}|${name}` : l.source
      const target = bExp ? `${l.target}|${name}` : l.target
      if (idSet.has(source) && idSet.has(target)) {
        links.push({ source, target, __kind: 'stitch', name })
      }
    }
  }
  return { nodes, links }
}

/** 边端点取 id：字符串原样；d3 灌库后可能已解析为节点对象（同 graphData.linkEnd 语义） */
const linkEndId = (end) => (typeof end === 'object' && end !== null ? end.id : end)

/**
 * 世界聚焦邻域：从 focusId 出发沿场景全部边（域内真实边 + 缝合边/脐带边）
 * BFS hops 跳的节点 id 集合（含焦点自身）。语义对齐图表页 focusNeighborhood，
 * 但按 id——世界场景跨图同名（name 不唯一）。焦点不在场景中时返回空集
 * （调用方以空集表达「无聚焦，全图正常色」）。
 */
export const worldFocusNeighborhood = (scene, focusId, hops) => {
  if (!focusId || !scene?.nodes?.some((n) => n?.id === focusId)) return new Set()
  const adj = new Map()
  const addEdge = (s, t) => {
    if (!adj.has(s)) adj.set(s, [])
    adj.get(s).push(t)
  }
  for (const l of scene?.links ?? []) {
    const s = linkEndId(l.source)
    const t = linkEndId(l.target)
    if (s == null || t == null || s === t) continue
    addEdge(s, t)
    addEdge(t, s)
  }
  const visited = new Set([focusId])
  let frontier = [focusId]
  for (let d = 0; d < (hops ?? 0) && frontier.length; d++) {
    const next = []
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb)
          next.push(nb)
        }
      }
    }
    frontier = next
  }
  return visited
}

/**
 * 世界默认焦点（聚焦开启且无当前选中时）：度数最高 → 体量
 * （超节点 nodeCount / 真实节点 symbolSize）→ 先出现。空场景返回 ''。
 * 语义对齐图表页 defaultFocusNode，按 id 而非 name。
 */
export const defaultFocusNodeId = (nodes, links) => {
  if (!nodes?.length) return ''
  const degree = new Map()
  const bump = (id) => degree.set(id, (degree.get(id) ?? 0) + 1)
  for (const l of links ?? []) {
    bump(linkEndId(l.source))
    bump(linkEndId(l.target))
  }
  const sizeOf = (n) => (n.__kind === 'graph' ? n.nodeCount : n.symbolSize) ?? 0
  let best = nodes[0]
  let bestDeg = degree.get(best.id) ?? 0
  for (let i = 1; i < nodes.length; i++) {
    const d = degree.get(nodes[i].id) ?? 0
    if (d > bestDeg || (d === bestDeg && (sizeOf(nodes[i]) ?? 0) > (sizeOf(best) ?? 0))) {
      best = nodes[i]
      bestDeg = d
    }
  }
  return best.id
}
