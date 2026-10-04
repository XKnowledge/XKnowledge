import { message } from 'ant-design-vue'
import {
  addHistory,
  createEdgeInChart,
  createNodeInChart,
  jsonReactive
} from '../utils/XkUtils'
import { applyUndo, applyRedo } from '../utils/historyActions'
import type { HistoryEntry } from '../utils/historyActions'
import { collectCopySelection, mergeGraphBatch } from '../utils/graphMerge'
import type { ChartData, GraphLink, GraphNode } from '../utils/graphData'
import { serializeGraphSelection, parseGraphSelection } from '../../../shared/graphClipboard.js'
import { t } from '../i18n.js'
import type { Ref } from 'vue'

/** xkContext 里编辑操作关心的部分（ChartView 中枢状态的形状切片） */
export interface EditContextSlice {
  chartData: ChartData | null
  historyList: HistoryEntry[]
  historySequenceNumber: number
  updateChart: boolean
}

export interface UseEditActionsOptions {
  /** 中枢状态（chartData 直改 + 历史序列 + updateChart 翻转刷新） */
  xkContext: Ref<EditContextSlice>
  /** 最后点击节点的侧栏索引（deleteNode 目标） */
  currentNodeDataIndex: Ref<number>
  /** 最后点击边的侧栏索引（deleteEdge 目标） */
  currentEdgeDataIndex: Ref<number>
  /** 框选集（deleteSelection/copySelection 目标） */
  selectionNodeNames: Ref<string[]>
  selectionLinkIndexes: Ref<number[]>
  /** XkGraph3D 实例（就地建点的落点坐标回填） */
  graph3dRef: Ref<{ notifyNodeDropPos?: (name: string, world: unknown) => void } | null>
  /** 数据变更后的面板复位（编排层 resetSider+resetRefData 打包） */
  afterEdit: () => void
  /** 大纲导入完成后收起导入对话框 */
  closeOutlineImport: () => void
}

/**
 * 图谱编辑操作：撤销/重做序号管理、三路删除、复制/粘贴、大纲导入与
 * 画布直操建点建边。数据补偿与合并语义在 utils（historyActions/
 * graphMerge，多重边安全），这里只做序号、分发与 UI 联动。
 */
export function useEditActions({
  xkContext,
  currentNodeDataIndex,
  currentEdgeDataIndex,
  selectionNodeNames,
  selectionLinkIndexes,
  graph3dRef,
  afterEdit,
  closeOutlineImport
}: UseEditActionsOptions) {
  const undo = () => {
    /**
     * 实现快捷键Ctrl/⌘+Z
     * 数据补偿逻辑在 utils/historyActions（多重边安全），这里只管序号与 UI
     */
    const { historyList, historySequenceNumber } = xkContext.value

    if (historySequenceNumber < 0) return

    const currentHistory = historyList[historySequenceNumber]
    xkContext.value.historySequenceNumber--

    if (applyUndo(xkContext.value.chartData!, currentHistory)) {
      xkContext.value.updateChart = !xkContext.value.updateChart
    }

    afterEdit()
  }

  const redo = () => {
    /**
     * 实现快捷键Ctrl/⌘+Y
     * 数据补偿逻辑在 utils/historyActions（多重边安全），这里只管序号与 UI
     */
    const currentHSN = xkContext.value.historySequenceNumber + 1
    if (currentHSN >= xkContext.value.historyList.length) return

    const currentHistory = xkContext.value.historyList[currentHSN]
    xkContext.value.historySequenceNumber = currentHSN

    if (applyRedo(xkContext.value.chartData!, currentHistory)) {
      xkContext.value.updateChart = !xkContext.value.updateChart
    }

    afterEdit()
  }

  const deleteNode = () => {
    /**
     * 删除节点
     */
    if (currentNodeDataIndex.value < 0) return

    const { nodes, links } = xkContext.value.chartData!
    const deletedNode = nodes[currentNodeDataIndex.value]

    // 更新历史记录
    const newHistory = {
      act: 'deleteNode',
      data: jsonReactive(deletedNode),
      links: links.filter(
        (link) => link.source === deletedNode.name || link.target === deletedNode.name
      )
    }

    addHistory(xkContext, newHistory)

    // 使用 filter 替代循环
    xkContext.value.chartData!.nodes = nodes.filter(
      (_, index) => index !== currentNodeDataIndex.value
    )

    // 过滤保留不相关的边
    xkContext.value.chartData!.links = links.filter(
      (link) => link.source !== deletedNode.name && link.target !== deletedNode.name
    )

    xkContext.value.updateChart = !xkContext.value.updateChart

    afterEdit()
  }

  const deleteEdge = () => {
    /**
     * 删除连接
     */
    if (currentEdgeDataIndex.value < 0) return

    const { links } = xkContext.value.chartData!
    addHistory(xkContext, {
      act: 'deleteEdge',
      data: jsonReactive(links[currentEdgeDataIndex.value])
    })

    // 删除连接
    xkContext.value.chartData!.links = links.filter(
      (_, index) => index !== currentEdgeDataIndex.value
    )

    xkContext.value.updateChart = !xkContext.value.updateChart
    afterEdit()
  }

  const deleteSelection = () => {
    /**
     * 框选批量删除：Delete 在框选集非空时优先走这里。一条 deleteSelection 历史
     * 承载整批——被选节点 + 直选边 + 删点连带边（与单点删除同语义），一步撤销。
     * 边按对象引用进出历史（undo push 回的即 history 持有的对象），多重边安全
     */
    const names = new Set(selectionNodeNames.value)
    const linkIdxs = new Set(selectionLinkIndexes.value)
    if (!names.size && !linkIdxs.size) return

    const { nodes, links } = xkContext.value.chartData!
    const deletedNodes = nodes.filter((n) => names.has(n.name))
    const removedLinks = links.filter(
      (l, i) => linkIdxs.has(i) || names.has(l.source) || names.has(l.target)
    )

    addHistory(xkContext, {
      act: 'deleteSelection',
      data: { nodes: jsonReactive(deletedNodes), links: jsonReactive(removedLinks) }
    })

    xkContext.value.chartData!.nodes = nodes.filter((n) => !names.has(n.name))
    xkContext.value.chartData!.links = links.filter(
      (l, i) => !linkIdxs.has(i) && !names.has(l.source) && !names.has(l.target)
    )

    xkContext.value.updateChart = !xkContext.value.updateChart
    afterEdit()
    message.info(
      t('chart.deletedSummary', { nodes: deletedNodes.length, edges: removedLinks.length })
    )
  }

  const copySelection = async () => {
    /**
     * 复制（三路分发与 Delete 对称：框选集优先→直选边→最后点击节点）：
     * collectCopySelection 收集自洽子图（边端点必在集内）→ 白名单序列化
     * （剥离力布局坐标）→ 系统剪贴板——跨窗口/跨文件/应用重启后仍在。
     * 复制不动数据，选中态保留（Delete 才清）
     */
    const chart = xkContext.value.chartData
    if (!chart) return
    const picked = collectCopySelection(
      chart.nodes,
      chart.links,
      selectionNodeNames.value,
      selectionLinkIndexes.value,
      currentEdgeDataIndex.value,
      currentNodeDataIndex.value
    )
    if (!picked) return
    await window.electronAPI.writeGraphClipboard(
      serializeGraphSelection(picked.nodes as GraphNode[], picked.links as GraphLink[])
    )
    message.info(t('chart.copiedSummary', { nodes: picked.nodes.length, edges: picked.links.length }))
  }

  const pasteSelection = async () => {
    /**
     * 粘贴（合并语义，与大纲导入共用 mergeGraphBatch）：读系统剪贴板 →
     * 严格解析（非本应用格式提示后中止——用户剪贴板通常是任意文本）→
     * 同名节点跳过并合并（其边仍接上）、边端点须在「现有 ∪ 新增」并集且
     * 无向端点对不与现有重复。空批次不进历史。整批一条 pasteGraph 历史
     * （data 持有 push 进 chartData 的同一批对象引用，一步撤销）
     */
    const chart = xkContext.value.chartData
    if (!chart) return
    const { text } = await window.electronAPI.readGraphClipboard()
    const parsed = parseGraphSelection(text)
    if (!parsed) {
      message.info(t('chart.clipboardEmpty'))
      return
    }
    const merged = mergeGraphBatch(chart.nodes, chart.links, parsed.nodes, parsed.links)
    if (!merged.nodes.length && !merged.links.length) {
      message.info(t('chart.pasteNothing'))
      return
    }
    const batch = { nodes: jsonReactive(merged.nodes), links: jsonReactive(merged.links) }
    chart.nodes.push(...batch.nodes)
    chart.links.push(...batch.links)
    addHistory(xkContext, { act: 'pasteGraph', data: batch })
    xkContext.value.updateChart = !xkContext.value.updateChart
    afterEdit()
    message.info(
      merged.skippedCount > 0
        ? t('chart.pastedSummarySkipped', {
            nodes: merged.nodes.length,
            edges: merged.links.length,
            skipped: merged.skippedCount
          })
        : t('chart.pastedSummary', { nodes: merged.nodes.length, edges: merged.links.length })
    )
  }

  /** 大纲导入：追加合并进当前图，整批一条 importOutline 历史（一步撤销）。
   *  合并语义（同名跳过、边无向端点对去重且端点须在并集内）在
   *  graphMerge.mergeGraphBatch——与粘贴共用同一份代码。history.data 持有
   *  push 进 chartData 的同一批对象引用——undo 按引用移除，redo 按 push 复原 */
  const onOutlineImport = ({ nodes, links }: { nodes: GraphNode[]; links: GraphLink[] }) => {
    const chart = xkContext.value.chartData!
    const { nodes: addedNodes, links: addedLinks } = mergeGraphBatch(
      chart.nodes,
      chart.links,
      nodes,
      links
    )
    if (!addedNodes.length && !addedLinks.length) {
      message.info(t('outline.nothingToImport'))
      return
    }
    const batch = { nodes: jsonReactive(addedNodes), links: jsonReactive(addedLinks) }
    chart.nodes.push(...batch.nodes)
    chart.links.push(...batch.links)
    addHistory(xkContext, { act: 'importOutline', data: batch })
    xkContext.value.updateChart = !xkContext.value.updateChart
    closeOutlineImport()
  }

  /** 画布直操：就地编辑器提交 → 共享数据操作（校验/历史/刷新与表单路径同源）；
   *  错误走全局 message（侧栏此刻未必展开）。建点成功后回填落点坐标。 */
  const onCanvasCreateNode = ({
    name,
    category,
    symbolSize,
    des,
    world
  }: {
    name: string
    category: string
    symbolSize?: number
    des?: string
    world?: unknown
  }) => {
    const result = createNodeInChart(xkContext, {
      name,
      des: des ?? '',
      symbolSize: symbolSize ?? 50,
      category
    })
    if (!result.ok) {
      message.error(result.error)
      return
    }
    if (world) graph3dRef.value?.notifyNodeDropPos(result.data.name, world)
  }

  const onCanvasCreateEdge = ({ source, target, name }: { source: string; target: string; name: string }) => {
    const result = createEdgeInChart(xkContext, { source, target, name: name ?? '', des: '' })
    if (!result.ok) message.error(result.error)
  }

  return {
    undo,
    redo,
    deleteNode,
    deleteEdge,
    deleteSelection,
    copySelection,
    pasteSelection,
    onOutlineImport,
    onCanvasCreateNode,
    onCanvasCreateEdge
  }
}
