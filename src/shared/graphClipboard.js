/**
 * 图选区剪贴板格式的序列化与解析（纯数据层，主/渲染端皆可用、无环境依赖）。
 * 走系统剪贴板以文本落盘：带 app/type 标记的 JSON，parse 严格校验——用户
 * 剪贴板里通常是任意文本，非本格式一律返回 null，由调用方提示后中止。
 *
 * 字段白名单：节点只留 name/des/symbolSize/category，边只留
 * source/target/name/des。x/y/z（及 d3 内部 vx/vy/vz、库挂的 index 等）
 * 刻意剥离——力布局坐标属源图坐标系，跨文件粘贴无意义，新节点不带坐标
 * 由 d3 重新摆放（与大纲导入的节点形态一致）。
 */

const CLIPBOARD_MARK = { app: 'xknowledge', type: 'graph-selection', version: 1 }

const str = (x, fallback = '') => (typeof x === 'string' ? x : fallback)

/** 节点白名单归一：缺字段填默认（与表单建点默认对齐） */
const pickNode = (n) => ({
  name: str(n?.name),
  des: str(n?.des),
  symbolSize: typeof n?.symbolSize === 'number' ? n.symbolSize : 50,
  category: str(n?.category)
})

/** 边白名单归一 */
const pickLink = (l) => ({
  source: str(l?.source),
  target: str(l?.target),
  name: str(l?.name),
  des: str(l?.des)
})

export const serializeGraphSelection = (nodes, links) =>
  JSON.stringify({
    ...CLIPBOARD_MARK,
    nodes: (nodes ?? []).map(pickNode),
    links: (links ?? []).map(pickLink)
  })

export const parseGraphSelection = (text) => {
  if (typeof text !== 'string' || !text) return null
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (data?.app !== CLIPBOARD_MARK.app || data?.type !== CLIPBOARD_MARK.type) return null
  if (!Array.isArray(data?.nodes) || !Array.isArray(data?.links)) return null
  const nodes = data.nodes.map(pickNode)
  const links = data.links.map(pickLink)
  // name/source/target 是图的骨架键（节点主键/边端点），缺失即废数据
  if (nodes.some((n) => !n.name)) return null
  if (links.some((l) => !l.source || !l.target)) return null
  return { nodes, links }
}
