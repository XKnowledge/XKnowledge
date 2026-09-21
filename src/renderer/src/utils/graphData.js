/** 高亮色（选中节点/边）：黑，白底上与彩虹 20 色全部拉开距离（熄灯语义） */
export const HL_COLOR = '#1f1f1f'
/** 边底色 */
export const LINK_BASE_COLOR = '#4b565b'
/** 聚焦模式：邻域外节点/边的去色（白底上退为浅灰背景，不消失） */
export const FOCUS_DIM_COLOR = '#c4c9cc'

/**
 * 编辑刷新时用旧图节点坐标合并新节点数据（已布局的图不跳）。
 * 旧节点按 name 建 Map 索引做 O(n) 查找，替代在 map 内逐个 find 的 O(n²)；
 * 重名时与 Array.find 语义一致（取第一个匹配）。
 * 图实例吃的节点是 chartData 的拷贝（带内部 __idx 与 d3 坐标字段），不回写源数据。
 * @param {Array} newNodes chartData 的节点（纯数据）
 * @param {Array|null} oldNodes 图实例当前 graphData().nodes（带 d3 坐标），可为空
 */
export const mergeGraphNodes = (newNodes, oldNodes) => {
  const oldByName = new Map()
  for (const o of oldNodes ?? []) {
    if (!oldByName.has(o.name)) oldByName.set(o.name, o)
  }
  return newNodes.map((n, i) => {
    const old = oldByName.get(n.name)
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
}

/** d3 布局会把 link 的 source/target 反解为节点对象；归一化回名字符串再比较 */
export const linkEnd = (v) => (typeof v === 'object' && v !== null ? v.name : v)

/** 「小节点」判定：按大小排序后最小的 60% 视为小节点，开关关闭时隐藏其名称 */
const SMALL_NODE_RATIO = 0.6
/**
 * 大图标签预算：节点数超过 HEAVY_LABEL_COUNT 后分位/开关全显逻辑都让位
 * （全显 = 万级节点各建一张 canvas 纹理，世界树规模一打开就卡死），
 * 改为按 symbolSize 头部预算封顶；开关打开只放宽预算，不解除封顶
 */
const HEAVY_LABEL_COUNT = 2000
const LABEL_BUDGET = 600
const LABEL_BUDGET_EXTENDED = 1200

/**
 * 「显示小节点名称」开关的标签显示阈值：symbolSize >= 阈值的节点常显名称。
 * 中小图：关闭开关时阈值取升序 60% 分位处的值（即最小的 60% 节点算小节点）；
 * 分位值落在图中最小尺寸层（不存在比它更小的节点）时阈值会退化成最小值、
 * 一个标签也藏不掉（开关看似失效），此时上提一档到次小尺寸。
 * 大图（> HEAVY_LABEL_COUNT）：按预算封顶，取降序第 budget 个的值——
 * 大于等于阈值的节点不超过预算量级（同尺寸并列整层保留）。
 * @param {Array} nodes chartData 的节点（纯数据）
 * @param {boolean} showSmallLabels 开关状态
 * @returns {number} 阈值；中小图开关打开返回 -Infinity（全显），
 *   空节点集合返回 undefined（比较恒为 false，同样全显）
 */
export const labelThreshold = (nodes, showSmallLabels) => {
  const sizes = [...(nodes ?? [])].map((n) => n.symbolSize ?? 0).sort((a, b) => a - b) // 升序：小节点在前
  if (!sizes.length) return undefined
  if (sizes.length > HEAVY_LABEL_COUNT) {
    const budget = showSmallLabels ? LABEL_BUDGET_EXTENDED : LABEL_BUDGET
    return sizes[sizes.length - budget]
  }
  if (showSmallLabels) return -Infinity
  const threshold = sizes[Math.ceil(sizes.length * SMALL_NODE_RATIO) - 1]
  // 退化态：没有节点小于阈值 → 上提到次小尺寸（升序首个更大值）；
  // 全图同尺寸时无档可提，停在原值
  if (!sizes.some((s) => s < threshold)) {
    return sizes.find((s) => s > threshold) ?? threshold
  }
  return threshold
}

/** 高亮边匹配：两端名与边名都一致才算同一条（两端顺序敏感） */
const isSameLink = (l, hl) =>
  !!hl && linkEnd(l.source) === hl.source && linkEnd(l.target) === hl.target && hl.name === l.name

/**
 * 默认焦点三级规则：度数（边数）最高 → 并列取 symbolSize 大 → 再并列取第一个。
 * 全孤点图所有度数为 0，自然落到「先出现者」。空图返回 ''。
 * @param {Array} nodes chartData 的节点（纯数据）
 * @param {Array} links chartData 的边
 * @returns {string} 焦点节点名；空图为 ''
 */
export const defaultFocusNode = (nodes, links) => {
  if (!nodes?.length) return ''
  const degree = new Map()
  const bump = (name) => degree.set(name, (degree.get(name) ?? 0) + 1)
  for (const l of links ?? []) {
    bump(linkEnd(l.source))
    bump(linkEnd(l.target))
  }
  let best = nodes[0]
  let bestDeg = degree.get(best.name) ?? 0
  for (let i = 1; i < nodes.length; i++) {
    const d = degree.get(nodes[i].name) ?? 0
    if (d > bestDeg || (d === bestDeg && (nodes[i].symbolSize ?? 0) > (best.symbolSize ?? 0))) {
      best = nodes[i]
      bestDeg = d
    }
  }
  return best.name
}

/**
 * 聚焦邻域：从 focusName 出发 BFS hops 跳的节点名集合（含焦点自身）。
 * 环/自环/重边由 visited 去重天然容忍；不连通区域不会越界混入。
 * 焦点不在 nodes 中时返回空集合（调用方以空集表达「无聚焦，全图正常」）。
 * @param {Array} nodes chartData 的节点（纯数据）
 * @param {Array} links chartData 的边
 * @param {string} focusName 焦点节点名
 * @param {number} hops 跳数（1~3）
 * @returns {Set<string>}
 */
export const focusNeighborhood = (nodes, links, focusName, hops) => {
  if (!nodes?.some((n) => n?.name === focusName)) return new Set()
  const adj = new Map()
  const addEdge = (s, t) => {
    if (!adj.has(s)) adj.set(s, [])
    adj.get(s).push(t)
  }
  for (const l of links ?? []) {
    const s = linkEnd(l.source)
    const t = linkEnd(l.target)
    addEdge(s, t)
    if (s !== t) addEdge(t, s)
  }
  const visited = new Set([focusName])
  let frontier = [focusName]
  for (let d = 0; d < (hops ?? 0) && frontier.length; d++) {
    const next = []
    for (const name of frontier) {
      for (const nb of adj.get(name) ?? []) {
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
 * 计算高亮/聚焦状态变化后需要重着色的节点/边（增量更新，避免全场景 refresh：
 * refresh 会对每个节点重新执行 nodeThreeObject，重建全部 SpriteText 标签，
 * 大图下逐个点选持续掉帧）。
 * 只返回组合色（高亮 > 聚焦外灰 > 类目/底色）翻转的对象，颜色由调用方写入其 threeObj 材质。
 * @param {Set<string>|null} prevDimNodes/nextDimNodes 上一次/本次的聚焦邻域集合；
 *   null 表示聚焦未开启（不传等同 null，向后兼容）
 * @param {Map<string,string>} categoryColors 本图类型集合的色映射（assignCategoryColors 产物），
 *   退出高亮/聚焦的还原色从这里查；查询统一 get(String(category ?? ''))
 * @returns {{ nodeRepaints: Array<[datum, color]>, linkRepaints: Array<[datum, color]> }}
 */
export const planHighlightRepaint = ({
  nodes,
  links,
  prevNodes,
  prevLink,
  nextNodes,
  nextLink,
  prevDimNodes,
  nextDimNodes,
  categoryColors
}) => {
  const prevSet = new Set(prevNodes ?? [])
  const nextSet = new Set(nextNodes ?? [])
  // 节点组合色：高亮 > 聚焦外灰 > 类目色
  const nodeColorOf = (n, hlSet, dim) =>
    hlSet.has(n.name)
      ? HL_COLOR
      : dim && !dim.has(n.name)
        ? FOCUS_DIM_COLOR
        : categoryColors?.get(String(n.category ?? ''))
  // 边组合色：高亮 > 任一端不在邻域的灰 > 底色
  const linkColorOf = (l, hl, dim) =>
    hl
      ? HL_COLOR
      : dim && !(dim.has(linkEnd(l.source)) && dim.has(linkEnd(l.target)))
        ? FOCUS_DIM_COLOR
        : LINK_BASE_COLOR
  const nodeRepaints = []
  for (const n of nodes ?? []) {
    const was = nodeColorOf(n, prevSet, prevDimNodes)
    const is = nodeColorOf(n, nextSet, nextDimNodes)
    if (was !== is) nodeRepaints.push([n, is])
  }
  const linkRepaints = []
  for (const l of links ?? []) {
    const was = linkColorOf(l, isSameLink(l, prevLink), prevDimNodes)
    const is = linkColorOf(l, isSameLink(l, nextLink), nextDimNodes)
    if (was !== is) linkRepaints.push([l, is])
  }
  return { nodeRepaints, linkRepaints }
}
