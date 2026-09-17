import { categoryColor } from './categoryColor.js'

/** 高亮色（选中节点/边），与旧版图例视觉一致 */
export const HL_COLOR = '#e8684a'
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

/** 高亮边匹配：两端名与边名都一致才算同一条（两端顺序敏感） */
const isSameLink = (l, hl) =>
  !!hl && linkEnd(l.source) === hl.source && linkEnd(l.target) === hl.target && hl.name === l.name

/**
 * 计算高亮状态变化后需要重着色的节点/边（增量更新，避免全场景 refresh：
 * refresh 会对每个节点重新执行 nodeThreeObject，重建全部 SpriteText 标签，
 * 大图下逐个点选持续掉帧）。
 * 只返回高亮翻转（进入/退出）的对象，颜色由调用方写入其 threeObj 材质。
 * @returns {{ nodeRepaints: Array<[datum, color]>, linkRepaints: Array<[datum, color]> }}
 */
export const planHighlightRepaint = ({
  nodes,
  links,
  prevNodes,
  prevLink,
  nextNodes,
  nextLink
}) => {
  const prevSet = new Set(prevNodes ?? [])
  const nextSet = new Set(nextNodes ?? [])
  const nodeRepaints = []
  for (const n of nodes ?? []) {
    const was = prevSet.has(n.name)
    const is = nextSet.has(n.name)
    if (was !== is) nodeRepaints.push([n, is ? HL_COLOR : categoryColor(n.category)])
  }
  const linkRepaints = []
  for (const l of links ?? []) {
    const was = isSameLink(l, prevLink)
    const is = isSameLink(l, nextLink)
    if (was !== is) linkRepaints.push([l, is ? HL_COLOR : LINK_BASE_COLOR])
  }
  return { nodeRepaints, linkRepaints }
}
