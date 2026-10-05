import { ref, type Ref } from 'vue'
import { deepClone } from '../utils/graphData'
import {
  appendBatchOp,
  changeEdgeOp,
  changeNodeOp,
  createEdgeOp,
  createNodeOp,
  deleteEdgeOp,
  deleteNodeOp,
  removeBatchOp,
  type HistoryOp
} from '../utils/historyOps'
import { mergeGraphBatch } from '../utils/graphMerge'
import { t } from '../i18n.js'
import type { ChartData, GraphLink, GraphNode } from '../utils/graphData'

/** 变更通知：dirty 区分「编辑置脏」与「装载换图」（换图不置脏） */
export interface DocumentChange {
  dirty: boolean
}

/** 编辑意图的统一返回：ok=false 时数据未变动，error 为可直接示人的文案；
 *  呈现方式（侧栏红条 / 全局 toast）由编排层按来源决定，文档层不碰 UI */
export type IntentResult = { ok: false; error: string } | { ok: true }

/** 建点/建边意图的返回：成功附带入图对象（画布建点回填落点坐标用） */
export type CreateResult<T> = { ok: false; error: string } | { ok: true; data: T }

/** 合并批次（粘贴/大纲导入）的应用结果：nodes/links 为实际入图的对象 */
export interface AppliedBatch {
  nodes: GraphNode[]
  links: GraphLink[]
  skippedCount: number
}

export interface UseDocumentOptions {
  /** 结构性变更的唯一出口：类目重算 / 置脏 / 高亮校准由编排层在此收口
   *  （取代旧的翻转刷新信号——那是个承载了过多语义的边沿信号，
   *  装载误触发置脏还要靠 nextTick 事后对冲） */
  onChange: (change: DocumentChange) => void
}

export interface DocumentHandle {
  chartData: Ref<ChartData | null>
  historyList: Ref<HistoryOp[]>
  historySequenceNumber: Ref<number>
  load: (chart: ChartData) => void
  setDescription: (v: string) => void
  createNode: (node: GraphNode) => CreateResult<GraphNode>
  createEdge: (edge: GraphLink) => CreateResult<GraphLink>
  changeNode: (index: number, node: GraphNode) => IntentResult
  changeEdge: (index: number, edge: GraphLink) => IntentResult
  deleteNodeAt: (index: number) => boolean
  deleteEdgeAt: (index: number) => boolean
  deleteSelection: (
    nodeNames: string[],
    linkIndexes: number[]
  ) => { nodes: number; links: number } | null
  paste: (nodes: GraphNode[], links: GraphLink[]) => AppliedBatch
  importOutline: (nodes: GraphNode[], links: GraphLink[]) => boolean
  undo: () => boolean
  redo: () => boolean
}

/**
 * 图谱文档：chartData 与历史栈的唯一持有者。
 *
 * 所有结构变更经意图方法进入——校验、数据变换、历史记录与变更通知在同
 * 一处完成；写入方不再各自踩「改数据 + 记历史 + 广播刷新」三拍鼓点。
 * 意图返回 { ok, error }，错误呈现由编排层决定（侧栏表单 → 红条，
 * 画布直操 → 全局 toast），文档层无 UI 依赖。
 *
 * 补偿变换（undo/redo）在 utils/historyOps——历史栈存操作对象（每个操作
 * 自带正反变换，多重边安全，vitest 直测）；合并语义（粘贴/大纲导入共用）
 * 在 utils/graphMerge。description 是图表元数据：不进撤销栈、不触发结构
 * 性刷新（仅置脏）。
 */
export function useDocument({ onChange }: UseDocumentOptions): DocumentHandle {
  const chartData = ref<ChartData | null>(null)
  const historyList = ref<HistoryOp[]>([])
  // 当前历史位置（-1 表示栈底之前）
  const historySequenceNumber = ref(-1)

  /**
   * 追加一条历史记录：先截断当前位置之后废弃的 redo 分支，再追加并移动
   * 当前序号。如果不截断，undo 之后做新操作会残留过期记录，再次 undo/redo
   * 时会重复添加节点/边或重放与当前状态不符的操作。
   */
  const record = (entry: HistoryOp) => {
    historyList.value.splice(historySequenceNumber.value + 1)
    historyList.value.push(entry)
    historySequenceNumber.value = historyList.value.length - 1
  }

  /** 装载新图（解析与结构校验由调用方完成）：文档整体替换，历史归零 */
  const load = (chart: ChartData) => {
    chartData.value = chart
    historyList.value = []
    historySequenceNumber.value = -1
    onChange({ dirty: false })
  }

  /** 图表级元数据（简介）：不进撤销栈、不触发结构性刷新 */
  const setDescription = (v: string) => {
    if (chartData.value) chartData.value.description = v
  }

  /** 建点（画布双击直操入口；校验/历史/刷新与全部编辑意图同源） */
  const createNode = (node: GraphNode): CreateResult<GraphNode> => {
    const chart = chartData.value!
    if (!node.name?.trim()) return { ok: false, error: t('validation.nodeNameRequired') }
    if (!node.category?.trim()) return { ok: false, error: t('validation.categoryRequired') }
    if (chart.nodes.some((n) => n.name === node.name)) {
      return { ok: false, error: t('validation.duplicateNode') }
    }
    const newNode = deepClone({ ...node })
    chart.nodes.push(newNode)
    record(createNodeOp(newNode))
    onChange({ dirty: true })
    return { ok: true, data: newNode }
  }

  /** 建边（画布拖拽直操）：端点对无向判重（正反序都算重复） */
  const createEdge = (edge: GraphLink): CreateResult<GraphLink> => {
    const chart = chartData.value!
    const isDuplicate = chart.links.some(
      (l) =>
        (l.source === edge.source && l.target === edge.target) ||
        (l.source === edge.target && l.target === edge.source)
    )
    if (isDuplicate) return { ok: false, error: t('validation.edgeExists') }
    const newEdge = deepClone({ ...edge })
    chart.links.push(newEdge)
    record(createEdgeOp(newEdge))
    onChange({ dirty: true })
    return { ok: true, data: newEdge }
  }

  /**
   * 侧栏节点表单提交（原 XkCurrentNode 内联逻辑收口）：改名时同步改写
   * 所有引用旧名的边端点；改名才做重名校验（名不变时旧条目即自己）。
   */
  const changeNode = (index: number, node: GraphNode): IntentResult => {
    const chart = chartData.value!
    const oldNode = deepClone(chart.nodes[index])
    const newNode = deepClone(node)
    const oldName = oldNode.name
    const newName = newNode.name

    if (oldName !== newName) {
      const hasDuplicate = chart.nodes.some((n) => n.name === newName)
      if (hasDuplicate) return { ok: false, error: t('validation.duplicateNode') }
      chart.links.forEach((l) => {
        if (l.source === oldName) l.source = newName
        if (l.target === oldName) l.target = newName
      })
    }

    chart.nodes[index] = newNode
    record(changeNodeOp(oldNode, newNode))
    onChange({ dirty: true })
    return { ok: true }
  }

  /** 侧栏边表单提交（原 XkCurrentEdge 内联逻辑收口）：按索引替换，无校验 */
  const changeEdge = (index: number, edge: GraphLink): IntentResult => {
    const chart = chartData.value!
    const oldEdge = deepClone(chart.links[index])
    const newEdge = deepClone(edge)
    record(changeEdgeOp(oldEdge, newEdge))
    chart.links[index] = newEdge
    onChange({ dirty: true })
    return { ok: true }
  }

  /** 删点：连带删除其全部邻边（操作对象捕获节点快照与邻边引用） */
  const deleteNodeAt = (index: number): boolean => {
    if (index < 0) return false
    const chart = chartData.value!
    const deletedNode = chart.nodes[index]
    record(
      deleteNodeOp(
        deepClone(deletedNode),
        chart.links.filter((l) => l.source === deletedNode.name || l.target === deletedNode.name)
      )
    )
    chart.nodes = chart.nodes.filter((_, i) => i !== index)
    chart.links = chart.links.filter(
      (l) => l.source !== deletedNode.name && l.target !== deletedNode.name
    )
    onChange({ dirty: true })
    return true
  }

  /** 删边：只删目标索引 */
  const deleteEdgeAt = (index: number): boolean => {
    if (index < 0) return false
    const chart = chartData.value!
    record(deleteEdgeOp(deepClone(chart.links[index])))
    chart.links = chart.links.filter((_, i) => i !== index)
    onChange({ dirty: true })
    return true
  }

  /**
   * 框选批量删除：一条历史承载整批——被选节点 + 直选边 + 删点连带边
   * （与单点删除同语义），一步撤销。返回计数供调用方播报；空选集返回 null。
   */
  const deleteSelection = (
    selNodeNames: string[],
    selLinkIndexes: number[]
  ): { nodes: number; links: number } | null => {
    const names = new Set(selNodeNames)
    const linkIdxs = new Set(selLinkIndexes)
    if (!names.size && !linkIdxs.size) return null

    const chart = chartData.value!
    const deletedNodes = chart.nodes.filter((n) => names.has(n.name))
    const removedLinks = chart.links.filter(
      (l, i) => linkIdxs.has(i) || names.has(l.source) || names.has(l.target)
    )

    record(removeBatchOp({ nodes: deepClone(deletedNodes), links: deepClone(removedLinks) }))

    chart.nodes = chart.nodes.filter((n) => !names.has(n.name))
    chart.links = chart.links.filter(
      (l, i) => !linkIdxs.has(i) && !names.has(l.source) && !names.has(l.target)
    )

    onChange({ dirty: true })
    return { nodes: deletedNodes.length, links: removedLinks.length }
  }

  /**
   * 合并批次入图（粘贴与大纲导入共用，语义在 graphMerge.mergeGraphBatch：
   * 同名节点跳过并合并、边端点须在「现有 ∪ 新增」并集且无向端点对不与
   * 现有重复）。操作对象捕获 push 进 chartData 的同一批 deepClone 产物
   * （引用比对天然只命中本批）。空批次不进历史、不通知。
   */
  const applyBatch = (nodes: GraphNode[], links: GraphLink[]): AppliedBatch => {
    const chart = chartData.value!
    const merged = mergeGraphBatch(chart.nodes, chart.links, nodes, links)
    if (!merged.nodes.length && !merged.links.length) {
      return { nodes: [], links: [], skippedCount: merged.skippedCount }
    }
    const batch = { nodes: deepClone(merged.nodes), links: deepClone(merged.links) }
    chart.nodes.push(...batch.nodes)
    chart.links.push(...batch.links)
    record(appendBatchOp(batch))
    onChange({ dirty: true })
    return { nodes: batch.nodes, links: batch.links, skippedCount: merged.skippedCount }
  }

  /** 粘贴（剪贴板解析后的批次入图），返回实际应用结果供播报 */
  const paste = (nodes: GraphNode[], links: GraphLink[]): AppliedBatch => applyBatch(nodes, links)

  /** 大纲导入：有内容入图返回 true，无内容返回 false（对话框保持打开） */
  const importOutline = (nodes: GraphNode[], links: GraphLink[]): boolean => {
    const applied = applyBatch(nodes, links)
    return applied.nodes.length > 0 || applied.links.length > 0
  }

  /** 撤销（补偿变换在操作对象内）：栈底之外返回 false */
  const undo = (): boolean => {
    if (historySequenceNumber.value < 0) return false
    const current = historyList.value[historySequenceNumber.value]
    historySequenceNumber.value--
    current.undo(chartData.value!)
    onChange({ dirty: true })
    return true
  }

  /** 重做（撤销的对称面，同样在操作对象内）：栈顶之外返回 false */
  const redo = (): boolean => {
    const next = historySequenceNumber.value + 1
    if (next >= historyList.value.length) return false
    historySequenceNumber.value = next
    historyList.value[next].redo(chartData.value!)
    onChange({ dirty: true })
    return true
  }

  return {
    chartData,
    historyList,
    historySequenceNumber,
    load,
    setDescription,
    createNode,
    createEdge,
    changeNode,
    changeEdge,
    deleteNodeAt,
    deleteEdgeAt,
    deleteSelection,
    paste,
    importOutline,
    undo,
    redo
  }
}
