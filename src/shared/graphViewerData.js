/**
 * 导出交互式 HTML（viewer）的数据序列化（纯数据层，无环境依赖）。
 * 与 graphClipboard 同哲学：字段白名单 + 归一化。x/y/z 与 d3 内部字段
 *（vx/__idx 等）刻意剥离——viewer 是动态成形（打开时力导向重新布局），
 * 源图坐标跨文件无意义。空图返回 null，调用方以此拒绝导出。
 */
const str = (x, fallback = '') => (typeof x === 'string' ? x : fallback)

/** 边端点归一：d3 会把 link 的 source/target 反解为节点对象 */
const linkEnd = (v) => (typeof v === 'object' && v !== null ? str(v.name) : str(v))

export const serializeGraphForViewer = (chart, title, lang) => {
  const nodes = chart?.nodes
  if (!Array.isArray(nodes) || nodes.length === 0) return null
  const pickNode = (n) => ({
    name: str(n?.name),
    des: str(n?.des),
    symbolSize: typeof n?.symbolSize === 'number' ? n.symbolSize : 50,
    category: str(n?.category)
  })
  const pickLink = (l) => ({
    source: linkEnd(l?.source),
    target: linkEnd(l?.target),
    name: str(l?.name),
    des: str(l?.des)
  })
  // name 是节点主键，缺失即废数据（与 parseGraphSelection 同判定）
  const outNodes = nodes.map(pickNode)
  if (outNodes.some((n) => !n.name)) return null
  const seen = new Set()
  const categories = []
  for (const n of outNodes) {
    if (!seen.has(n.category)) {
      seen.add(n.category)
      categories.push({ name: n.category })
    }
  }
  return {
    version: 1, // viewer 数据格式版本，未来演进留余地
    title: str(title),
    lang: str(lang, 'zh-CN'),
    categories,
    nodes: outNodes,
    links: Array.isArray(chart?.links) ? chart.links.map(pickLink) : []
  }
}
