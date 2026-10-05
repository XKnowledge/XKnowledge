/** 场景色双色套：浅色=现状（白底熄灯黑），深色=antd 基准底+点灯白（语义对称）。
 *  bg 背景 / hl 高亮 / link 边底色 / dim 聚焦去色 / hit 搜索命中 /
 *  active 搜索当前项 / label 节点标签 / watermark 导出 PNG 水印 */
export interface SceneColors {
  bg: string
  hl: string
  link: string
  dim: string
  hit: string
  active: string
  label: string
  watermark: string
}

export const SCENE_COLORS: Record<'light' | 'dark', SceneColors> = {
  light: {
    bg: '#ffffff',
    hl: '#1f1f1f',
    link: '#4b565b',
    dim: '#c4c9cc',
    hit: '#faad14',
    active: '#fa541c',
    label: '#333333',
    watermark: '#000000'
  },
  dark: {
    bg: '#141414',
    hl: '#f0f0f0',
    link: '#8c979c',
    dim: '#4a4f53',
    hit: '#ffc53d',
    active: '#ff7a45',
    label: '#e0e0e0',
    watermark: '#ffffff'
  }
}

/** 高亮色（选中节点/边）：黑，白底上与彩虹 20 色全部拉开距离（熄灯语义） */
export const HL_COLOR = SCENE_COLORS.light.hl
/** 边底色 */
export const LINK_BASE_COLOR = SCENE_COLORS.light.link
/** 聚焦模式：邻域外节点/边的去色（白底上退为浅灰背景，不消失） */
export const FOCUS_DIM_COLOR = SCENE_COLORS.light.dim
/** 图内搜索：命中节点色（金黄，白底上与类目 20 色/黑/灰拉开距离） */
export const SEARCH_HIT_COLOR = SCENE_COLORS.light.hit
/** 图内搜索：当前项色（深橙红，比命中色深一档） */
export const SEARCH_ACTIVE_COLOR = SCENE_COLORS.light.active

/**
 * 图谱节点（chartData 纯数据形态；symbolSize 在防御性代码中可缺）。
 * 域类型的唯一出处：graphMerge/historyActions/outlineParser/store 等
 * 经 `import type` 引用，避免形状多处漂移。
 */
export interface GraphNode {
  name: string
  des: string
  category: string
  symbolSize?: number
}

/** d3 布局会把边的 source/target 反解为节点对象引用；涉及图实例数据的
 *  工具（linkEnd/linkKey 等）两种形态都要收 */
export type LinkEnd = string | { name: string }

/** 图谱边（chartData 纯数据形态） */
export interface GraphLink {
  source: string
  target: string
  name?: string
  des?: string
}

/** chartData：图谱文档数据（文档域的 nodes/links + 图表级元数据） */
export interface ChartData {
  nodes: GraphNode[]
  links: GraphLink[]
  /** 图表简介（元数据）：不进撤销栈，保存时随文档落盘 */
  description?: string
}

/** 侧栏节点表单的空模板（表单初始值与编辑面板复位共用同一形状） */
export const emptyNode = (): GraphNode => ({ name: '', des: '', symbolSize: 50, category: '' })

/** 侧栏边表单的空模板 */
export const emptyEdge = (): GraphLink => ({ source: '', target: '', name: '', des: '' })

/** 深拷贝（JSON 往返）。图谱数据是纯 JSON 数据（与 .xk 落盘同构），JSON
 *  克隆语义与落盘一致（undefined 字段一并丢弃）；入图 / 入历史前脱钩
 *  引用统一用这个。 */
export const deepClone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

/** 图实例节点：chartData 节点 + 内部索引与 d3 布局坐标（mergeGraphNodes 产物） */
export interface PlacedNode extends GraphNode {
  __idx: number
  x?: number
  y?: number
  z?: number
  fx?: number
  fy?: number
  fz?: number
}

/**
 * 编辑刷新时用旧图节点坐标合并新节点数据（已布局的图不跳）。
 * 旧节点按 name 建 Map 索引做 O(n) 查找，替代在 map 内逐个 find 的 O(n²)；
 * 重名时与 Array.find 语义一致（取第一个匹配）。
 * 图实例吃的节点是 chartData 的拷贝（带内部 __idx 与 d3 坐标字段），不回写源数据。
 * @param newNodes chartData 的节点（纯数据）
 * @param oldNodes 图实例当前 graphData().nodes（带 d3 坐标），可为空
 */
export const mergeGraphNodes = (
  newNodes: GraphNode[],
  oldNodes: PlacedNode[] | null
): PlacedNode[] => {
  const oldByName = new Map<string, PlacedNode>()
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
export const linkEnd = (v: LinkEnd): string =>
  typeof v === 'object' && v !== null ? v.name : (v as string)

/** 边的三元组键：两端名 + 边名（顺序敏感），与 historyActions.sameEdge 同语义。
 *  框选批量边的选中集用它做成员判定——多重边（同端点对不同边名）天然区分 */
export const linkKey = (l: { source: LinkEnd; target: LinkEnd; name?: string }): string =>
  `${linkEnd(l.source)}\u0000${linkEnd(l.target)}\u0000${l.name}`

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
 * @param nodes chartData 的节点（纯数据）
 * @param showSmallLabels 开关状态
 * @returns 阈值；中小图开关打开返回 -Infinity（全显），
 *   空节点集合返回 undefined（比较恒为 false，同样全显）
 */
export const labelThreshold = (
  nodes: GraphNode[] | null | undefined,
  showSmallLabels: boolean
): number | undefined => {
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
const isSameLink = (
  l: { source: LinkEnd; target: LinkEnd; name?: string },
  hl: GraphLink | null | undefined
): boolean =>
  !!hl && linkEnd(l.source) === hl.source && linkEnd(l.target) === hl.target && hl.name === l.name

/**
 * 默认焦点三级规则：度数（边数）最高 → 并列取 symbolSize 大 → 再并列取第一个。
 * 全孤点图所有度数为 0，自然落到「先出现者」。空图返回 ''。
 * @param nodes chartData 的节点（纯数据）
 * @param links chartData 的边
 * @returns 焦点节点名；空图为 ''
 */
export const defaultFocusNode = (
  nodes: GraphNode[] | null | undefined,
  links: GraphLink[] | null | undefined
): string => {
  if (!nodes?.length) return ''
  const degree = new Map<string, number>()
  const bump = (name: string) => degree.set(name, (degree.get(name) ?? 0) + 1)
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
 * @param nodes chartData 的节点（纯数据）
 * @param links chartData 的边
 * @param focusName 焦点节点名
 * @param hops 跳数（1~3）
 */
export const focusNeighborhood = (
  nodes: GraphNode[] | null | undefined,
  links: GraphLink[] | null | undefined,
  focusName: string,
  hops: number
): Set<string> => {
  if (!nodes?.some((n) => n?.name === focusName)) return new Set()
  const adj = new Map<string, string[]>()
  const addEdge = (s: string, t: string) => {
    if (!adj.has(s)) adj.set(s, [])
    adj.get(s)!.push(t)
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

/** 图实例节点侧的重着色 datum（读取 name/category） */
export interface PaintNode {
  name: string
  category?: string
}

/** 图实例边侧的重着色 datum（端点可能已被 d3 反解为节点对象） */
export interface PaintLink {
  source: LinkEnd
  target: LinkEnd
  name?: string
}

/** planHighlightRepaint 的入参（prev 与 next 维度成对出现，null/不传表示该维度未开启，向后兼容旧调用） */
export interface HighlightPlanInput {
  /** 图实例当前数据（节点读 name/category；边端点可能被 d3 反解） */
  nodes?: readonly PaintNode[] | null
  links?: readonly PaintLink[] | null
  /** 单选 + 框选合并后的高亮节点名集合 */
  prevNodes?: Iterable<string> | null
  nextNodes?: Iterable<string> | null
  /** 单选高亮边（纯数据：两端名 + 边名） */
  prevLink?: GraphLink | null
  nextLink?: GraphLink | null
  /** 聚焦邻域集合 */
  prevDimNodes?: Set<string> | null
  nextDimNodes?: Set<string> | null
  /** 搜索命中集合 */
  prevSearchNodes?: Set<string> | string[] | null
  nextSearchNodes?: Set<string> | string[] | null
  /** 搜索当前项名 */
  prevSearchActive?: string | null
  nextSearchActive?: string | null
  /** 批量选中边三元组键集合（linkKey 产物；框选高亮用） */
  prevLinks?: Iterable<string> | null
  nextLinks?: Iterable<string> | null
  /** 本图类型集合的色映射（assignCategoryColors 产物），查询统一 get(String(category ?? '')) */
  categoryColors?: Map<string, string>
  /** 场景色套（SCENE_COLORS.light/dark），缺省浅色（现状） */
  sceneColors?: SceneColors
}

/**
 * 计算高亮/聚焦状态变化后需要重着色的节点/边（增量更新，避免全场景 refresh：
 * refresh 会对每个节点重新执行 nodeThreeObject，重建全部 SpriteText 标签，
 * 大图下逐个点选持续掉帧）。
 * 只返回组合色（高亮 > 聚焦外灰 > 类目/底色）翻转的对象，颜色由调用方写入其 threeObj 材质。
 * @returns 需要（重）着色的 [datum, color] 对；color 为 undefined 表示回到无色态
 */
export const planHighlightRepaint = ({
  nodes,
  links,
  prevNodes,
  prevLink,
  nextNodes,
  nextLink,
  prevLinks,
  nextLinks,
  prevDimNodes,
  nextDimNodes,
  prevSearchNodes,
  nextSearchNodes,
  prevSearchActive,
  nextSearchActive,
  categoryColors,
  sceneColors = SCENE_COLORS.light
}: HighlightPlanInput): {
  nodeRepaints: Array<[PaintNode, string | undefined]>
  linkRepaints: Array<[PaintLink, string | undefined]>
} => {
  const prevSet = new Set(prevNodes ?? [])
  const nextSet = new Set(nextNodes ?? [])
  const prevSearch = new Set(prevSearchNodes ?? [])
  const nextSearch = new Set(nextSearchNodes ?? [])
  const prevSelLinks = new Set(prevLinks ?? [])
  const nextSelLinks = new Set(nextLinks ?? [])
  // 节点组合色：高亮 > 搜索当前项 > 搜索命中 > 聚焦外灰 > 类目色
  const nodeColorOf = (
    n: PaintNode,
    hlSet: Set<string>,
    active: string | null | undefined,
    searchSet: Set<string>,
    dim: Set<string> | null | undefined
  ): string | undefined =>
    hlSet.has(n.name)
      ? sceneColors.hl
      : active && n.name === active
        ? sceneColors.active
        : searchSet.has(n.name)
          ? sceneColors.hit
          : dim && !dim.has(n.name)
            ? sceneColors.dim
            : categoryColors?.get(String(n.category ?? ''))
  // 边组合色：高亮（单选或批量选中）> 任一端不在邻域的灰 > 底色
  const linkColorOf = (
    l: PaintLink,
    hl: boolean,
    selLinks: Set<string>,
    dim: Set<string> | null | undefined
  ): string | undefined =>
    hl || selLinks.has(linkKey(l))
      ? sceneColors.hl
      : dim && !(dim.has(linkEnd(l.source)) && dim.has(linkEnd(l.target)))
        ? sceneColors.dim
        : sceneColors.link
  const nodeRepaints: Array<[PaintNode, string | undefined]> = []
  for (const n of nodes ?? []) {
    const was = nodeColorOf(n, prevSet, prevSearchActive, prevSearch, prevDimNodes)
    const is = nodeColorOf(n, nextSet, nextSearchActive, nextSearch, nextDimNodes)
    if (was !== is) nodeRepaints.push([n, is])
  }
  const linkRepaints: Array<[PaintLink, string | undefined]> = []
  for (const l of links ?? []) {
    const was = linkColorOf(l, isSameLink(l, prevLink), prevSelLinks, prevDimNodes)
    const is = linkColorOf(l, isSameLink(l, nextLink), nextSelLinks, nextDimNodes)
    if (was !== is) linkRepaints.push([l, is])
  }
  return { nodeRepaints, linkRepaints }
}

/**
 * 结构性变更后校准节点选中高亮名：
 * - 高亮名仍在图中 → 原样返回（普通建删不动既有高亮）
 * - 高亮名已消失 → 索引有效且指向新名时跟随（改名提交场景），否则清空
 * @param nodes chartData 当前节点（纯数据）
 * @param current 校准前的选中高亮名（'' = 未选中，直通）
 * @param selectedIndex 侧栏选中索引（currentNodeDataIndex，-1 = 无）
 * @returns 校准后的高亮名
 */
export const reconcileNodeHighlight = (
  nodes: GraphNode[] | null | undefined,
  current: string,
  selectedIndex: number
): string => {
  if (!current) return ''
  if ((nodes ?? []).some((n) => n.name === current)) return current
  const renamed = selectedIndex > -1 ? nodes?.[selectedIndex]?.name : ''
  return renamed ?? ''
}

/**
 * 图内搜索过滤：name/des 大小写不敏感子串匹配，排除隐藏类目节点。
 * 命中按 nodes 原始顺序稳定返回（列表展示顺序与图数据一致）。
 * @param nodes chartData 的节点（纯数据）
 * @param keyword 搜索关键词
 * @param hiddenCategories 图例隐藏的类目集合
 * @returns 命中节点数组；空关键词返回 []
 */
export const searchGraphNodes = (
  nodes: GraphNode[] | null | undefined,
  keyword: string,
  hiddenCategories: Set<string> | null | undefined
): GraphNode[] => {
  const kw = String(keyword ?? '')
    .trim()
    .toLowerCase()
  if (!kw) return []
  return (nodes ?? []).filter((n) => {
    if (hiddenCategories?.has(n.category)) return false
    return (
      String(n.name ?? '')
        .toLowerCase()
        .includes(kw) ||
      String(n.des ?? '')
        .toLowerCase()
        .includes(kw)
    )
  })
}
