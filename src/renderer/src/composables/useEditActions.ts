import { message } from 'ant-design-vue'
import type { DocumentHandle } from './useDocument'
import { collectCopySelection } from '../utils/graphMerge'
import type { GraphLink, GraphNode } from '../utils/graphData'
import { serializeGraphSelection, parseGraphSelection } from '../../../shared/graphClipboard.js'
import { t } from '../i18n.js'
import type { Ref } from 'vue'

export interface UseEditActionsOptions {
  /** 图谱文档（chartData 与历史栈的唯一持有者）：编辑全部经意图方法进入，
   *  校验/历史/变更通知收口在文档域 */
  document: DocumentHandle
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
  /** 录制期间只读判定（可选注入，默认恒 false）：画布直操建点/建边的
   *  emit 入口双保险——组件层手势守卫（XkGraph3D）之外的再守一次，
   *  防未来新增直发路径绕过 dispatch 与组件守卫 */
  isRecording?: () => boolean
}

/**
 * 图谱编辑动作的 UI 编排：撤销/重做、三路删除、复制/粘贴、大纲导入与
 * 画布直操建点建边。数据变换、校验与历史在 useDocument（补偿语义在
 * utils/historyOps、合并语义在 utils/graphMerge，多重边安全），
 * 这里只做选中态读取、播报（画布直操错误走全局 message；侧栏表单错误
 * 由 ChartView 回显红条）与面板复位（afterEdit）。
 */
export function useEditActions({
  document: doc,
  currentNodeDataIndex,
  currentEdgeDataIndex,
  selectionNodeNames,
  selectionLinkIndexes,
  graph3dRef,
  afterEdit,
  closeOutlineImport,
  isRecording = () => false
}: UseEditActionsOptions) {
  const undo = () => {
    /**
     * 实现快捷键Ctrl/⌘+Z：序号与数据补偿在文档域，这里只管面板复位
     */
    if (doc.undo()) afterEdit()
  }

  const redo = () => {
    /**
     * 实现快捷键Ctrl/⌘+Y
     */
    if (doc.redo()) afterEdit()
  }

  const deleteNode = () => {
    /**
     * 删除节点
     */
    if (doc.deleteNodeAt(currentNodeDataIndex.value)) afterEdit()
  }

  const deleteEdge = () => {
    /**
     * 删除连接
     */
    if (doc.deleteEdgeAt(currentEdgeDataIndex.value)) afterEdit()
  }

  const deleteSelection = () => {
    /**
     * 框选批量删除：Delete 在框选集非空时优先走这里。一条历史承载整批
     * （被选节点 + 直选边 + 删点连带边，与单点删除同语义），一步撤销
     */
    const removed = doc.deleteSelection(selectionNodeNames.value, selectionLinkIndexes.value)
    if (!removed) return
    afterEdit()
    message.info(t('chart.deletedSummary', { nodes: removed.nodes, edges: removed.links }))
  }

  const copySelection = async () => {
    /**
     * 复制（三路分发与 Delete 对称：框选集优先→直选边→最后点击节点）：
     * collectCopySelection 收集自洽子图（边端点必在集内）→ 白名单序列化
     * （剥离力布局坐标）→ 系统剪贴板——跨窗口/跨文件/应用重启后仍在。
     * 复制不动数据，选中态保留（Delete 才清）
     */
    const chart = doc.chartData.value
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
    message.info(
      t('chart.copiedSummary', { nodes: picked.nodes.length, edges: picked.links.length })
    )
  }

  const pasteSelection = async () => {
    /**
     * 粘贴（合并语义与大纲导入共用，收口在文档域）：读系统剪贴板 → 严格
     * 解析（非本应用格式提示后中止——用户剪贴板通常是任意文本）→ 同名
     * 节点跳过并合并（其边仍接上）、边端点须在「现有 ∪ 新增」并集且无向
     * 端点对不与现有重复。空批次不进历史
     */
    const chart = doc.chartData.value
    if (!chart) return
    const { text } = await window.electronAPI.readGraphClipboard()
    const parsed = parseGraphSelection(text)
    if (!parsed) {
      message.info(t('chart.clipboardEmpty'))
      return
    }
    const applied = doc.paste(parsed.nodes, parsed.links)
    if (!applied.nodes.length && !applied.links.length) {
      message.info(t('chart.pasteNothing'))
      return
    }
    afterEdit()
    message.info(
      applied.skippedCount > 0
        ? t('chart.pastedSummarySkipped', {
            nodes: applied.nodes.length,
            edges: applied.links.length,
            skipped: applied.skippedCount
          })
        : t('chart.pastedSummary', { nodes: applied.nodes.length, edges: applied.links.length })
    )
  }

  /** 大纲导入：追加合并进当前图，整批一条历史（一步撤销）；无内容时
   *  提示后对话框保持打开 */
  const onOutlineImport = ({ nodes, links }: { nodes: GraphNode[]; links: GraphLink[] }) => {
    if (!doc.importOutline(nodes, links)) {
      message.info(t('outline.nothingToImport'))
      return
    }
    closeOutlineImport()
  }

  /** 画布直操：就地编辑器提交 → 文档意图（校验/历史/刷新与表单路径同源）；
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
    if (isRecording()) return
    const result = doc.createNode({
      name,
      des: des ?? '',
      symbolSize: symbolSize ?? 50,
      category
    })
    // ok 是字面量判别（false | true）：非严格模式下显式比较才能窄化联合
    if (result.ok === false) {
      message.error(result.error)
      return
    }
    if (world) graph3dRef.value?.notifyNodeDropPos(result.data.name, world)
  }

  const onCanvasCreateEdge = ({
    source,
    target,
    name
  }: {
    source: string
    target: string
    name: string
  }) => {
    if (isRecording()) return
    const result = doc.createEdge({ source, target, name: name ?? '', des: '' })
    if (result.ok === false) message.error(result.error)
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
