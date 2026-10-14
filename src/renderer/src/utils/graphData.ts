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
 * 域类型的唯一出处：graphMerge/historyOps/outlineParser/store 等
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

/** 图实例节点：chartData 节点 + 内部索引与 d3 布局坐标（syncPlacedNodes 产物） */
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
 * 编辑刷新时把 chartData 节点同步进图实例旧节点集合（稳定引用管道）。
 * 同名（重名取第一个，与 Array.find 语义一致）复用旧对象本身并就地同步业务字段
 * （des/symbolSize/category/__idx；name 即匹配键必然相同不重赋）——d3 坐标、速度、
 * 拖拽锚、__threeObj 都在同一对象上原样保留，库 digest 按对象身份判 update，
 * mesh 不重建（大图编辑增量的全部要点，issue #22）；
 * 新建节点浅拷贝业务字段（绝不 mutate chartData 源），悬空旧对象不进结果自然淘汰。
 * chartData → 图实例单向同步，永不回写。
 * @param newNodes chartData 的节点（纯数据）
 * @param oldNodes 图实例当前 graphData().nodes（带 d3 坐标），可为空
 */
export const syncPlacedNodes = (
  newNodes: GraphNode[],
  oldNodes: PlacedNode[] | null
): PlacedNode[] => {
  const oldByName = new Map<string, PlacedNode>()
  for (const o of oldNodes ?? []) {
    if (!oldByName.has(o.name)) oldByName.set(o.name, o)
  }
  return newNodes.map((n, i) => {
    const old = oldByName.get(n.name)
    if (!old) return { ...n, __idx: i }
    old.des = n.des
    old.symbolSize = n.symbolSize
    old.category = n.category
    old.__idx = i
    return old
  })
}

/** d3 布局会把 link 的 source/target 反解为节点对象；归一化回名字符串再比较 */
export const linkEnd = (v: LinkEnd): string =>
  typeof v === 'object' && v !== null ? v.name : (v as string)

/** 图实例边：chartData 边 + 内部索引；装载后 source/target 被 d3 反解为节点对象
 *  引用（LinkEnd 两态），稳定引用管道据此保持反解形态不回退 */
export interface PlacedLink {
  source: LinkEnd
  target: LinkEnd
  name?: string
  des?: string
  __idx: number
}

/**
 * 编辑刷新时把 chartData 边同步进图实例旧边集合（稳定引用管道，与 syncPlacedNodes
 * 同构）。按三元组键（linkKey 归一，端点顺序敏感）匹配：命中复用旧对象并就地同步
 * name/des/__idx——source/target 不重赋，已反解的节点对象引用保持有效；键变
 * （改端点/改边名）＝ 删旧增新（边身份变更的正确语义）；新边浅拷贝（字符串端点
 * 交库反解）。绝不 mutate chartData 源。
 * @param newLinks chartData 的边（纯数据），可为空
 * @param oldLinks 图实例当前 graphData().links，可为空
 */
export const syncPlacedLinks = (
  newLinks: GraphLink[] | null,
  oldLinks: PlacedLink[] | null
): PlacedLink[] => {
  const oldByKey = new Map<string, PlacedLink>()
  for (const o of oldLinks ?? []) {
    const k = linkKey(o)
    if (!oldByKey.has(k)) oldByKey.set(k, o)
  }
  return (newLinks ?? []).map((l, i) => {
    const old = oldByKey.get(linkKey(l))
    if (!old) return { ...l, __idx: i }
    old.name = l.name
    old.des = l.des
    old.__idx = i
    return old
  })
}

/** 边的三元组键：两端名 + 边名（顺序敏感），与 historyOps.sameEdge 同语义。
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

/** 名字集合相等（长度 + 逐项包含，无序）：聚焦相机 watcher 用它短路
 *  「集合内容未变」的重复合发——focusNodeNames 是 computed，chartData
 *  任何变更都让它换新数组、deep watch 必触发，不比内容就会把相机拽回
 *  根本没变的邻域 */
export const sameNameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((name) => b.includes(name))

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
 * 标签集合变化的手动增删决策（稳定引用管道的标签半边）。
 * nodeThreeObject 挂稳定闭包后库只对 digest enter 的新节点调它——update 的
 * 保留节点跨阈值不会重调，须按本计划手动补/摘 sprite。名字不在 nodes 里的
 * 不产生操作：已删节点由 digest exit 连带摘除，新 enter 节点的标签由稳定
 * 闭包按最新集合建（add 执行层再查重幂等）。返回按 nodes 序稳定的节点引用。
 * @param nodes 图实例当前节点（graphData().nodes）
 * @param prevSet 上一次应用的「应有标签」名字集合
 * @param nextSet 本次「应有标签」名字集合
 */
export const planLabelSync = (
  nodes: readonly PlacedNode[],
  prevSet: ReadonlySet<string>,
  nextSet: ReadonlySet<string>
): { adds: PlacedNode[]; removes: PlacedNode[] } => ({
  adds: nodes.filter((n) => nextSet.has(n.name) && !prevSet.has(n.name)),
  removes: nodes.filter((n) => prevSet.has(n.name) && !nextSet.has(n.name))
})

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
