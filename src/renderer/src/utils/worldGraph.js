/**
 * 世界层纯函数：超图构建、社区检测、跨库搜索、展开/收拢状态变换、
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

/**
 * 加权标签传播社区检测（确定性）：节点按 id 升序遍历，取邻居加权票数
 * 最高社区（平局取社区标号最小），至多 20 轮或收敛。返回带 community
 * 字段的节点副本；社区编号按首现顺序自 0 连续。
 * 背景实测：缝合图 85% 图在一个连通分量内，连通分量着色无结构，
 * 社区检测让「知识大区」自然浮现。
 */
export const labelCommunities = (nodes, links) => {
  const order = (nodes ?? []).map((n) => n.id).sort()
  const label = new Map(order.map((id, i) => [id, i]))
  const adj = new Map(order.map((id) => [id, []]))
  for (const l of links ?? []) {
    const w = l.weight ?? 1
    adj.get(l.source)?.push([l.target, w])
    adj.get(l.target)?.push([l.source, w])
  }
  let changed = true
  let rounds = 0
  while (changed && rounds++ < 20) {
    changed = false
    for (const id of order) {
      const votes = new Map()
      for (const [nb, w] of adj.get(id) ?? []) {
        votes.set(label.get(nb), (votes.get(label.get(nb)) ?? 0) + w)
      }
      let bestLabel = label.get(id)
      let bestW = -1
      for (const [lab, w] of [...votes.entries()].sort((a, b) => a[0] - b[0])) {
        if (w > bestW) {
          bestW = w
          bestLabel = lab
        }
      }
      if (bestLabel !== label.get(id)) {
        label.set(id, bestLabel)
        changed = true
      }
    }
  }
  const rename = new Map()
  let next = 0
  for (const id of order) {
    const lab = label.get(id)
    if (!rename.has(lab)) rename.set(lab, next++)
  }
  return (nodes ?? []).map((n) => ({ ...n, community: rename.get(label.get(n.id)) }))
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
    superNodes: labelCommunities(built.nodes, built.links),
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
