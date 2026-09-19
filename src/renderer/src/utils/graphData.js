/** 高亮色（选中节点/边）：黑，白底上与彩虹 20 色全部拉开距离（熄灯语义） */
export const HL_COLOR = '#1f1f1f'
/** 边底色 */
export const LINK_BASE_COLOR = '#4b565b'

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
 * 「显示小节点名称」开关的标签显示阈值：symbolSize >= 阈值的节点常显名称。
 * 关闭开关时阈值取升序 60% 分位处的值（即最小的 60% 节点算小节点）；
 * 分位值落在图中最小尺寸层（不存在比它更小的节点）时阈值会退化成最小值、
 * 一个标签也藏不掉（开关看似失效），此时上提一档到次小尺寸。
 * @param {Array} nodes chartData 的节点（纯数据）
 * @param {boolean} showSmallLabels 开关状态
 * @returns {number} 阈值；开关打开返回 -Infinity（全显），
 *   空节点集合返回 undefined（比较恒为 false，同样全显）
 */
export const labelThreshold = (nodes, showSmallLabels) => {
  if (showSmallLabels) return -Infinity
  const sizes = [...(nodes ?? [])].map((n) => n.symbolSize ?? 0).sort((a, b) => a - b) // 升序：小节点在前
  if (!sizes.length) return undefined
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
 * 计算高亮状态变化后需要重着色的节点/边（增量更新，避免全场景 refresh：
 * refresh 会对每个节点重新执行 nodeThreeObject，重建全部 SpriteText 标签，
 * 大图下逐个点选持续掉帧）。
 * 只返回高亮翻转（进入/退出）的对象，颜色由调用方写入其 threeObj 材质。
 * @param {Map<string,string>} categoryColors 本图类型集合的色映射（assignCategoryColors 产物），
 *   退出高亮的还原色从这里查；查询统一 get(String(category ?? ''))
 * @returns {{ nodeRepaints: Array<[datum, color]>, linkRepaints: Array<[datum, color]> }}
 */
export const planHighlightRepaint = ({
  nodes,
  links,
  prevNodes,
  prevLink,
  nextNodes,
  nextLink,
  categoryColors
}) => {
  const prevSet = new Set(prevNodes ?? [])
  const nextSet = new Set(nextNodes ?? [])
  const nodeRepaints = []
  for (const n of nodes ?? []) {
    const was = prevSet.has(n.name)
    const is = nextSet.has(n.name)
    if (was !== is)
      nodeRepaints.push([n, is ? HL_COLOR : categoryColors.get(String(n.category ?? ''))])
  }
  const linkRepaints = []
  for (const l of links ?? []) {
    const was = isSameLink(l, prevLink)
    const is = isSameLink(l, nextLink)
    if (was !== is) linkRepaints.push([l, is ? HL_COLOR : LINK_BASE_COLOR])
  }
  return { nodeRepaints, linkRepaints }
}
