import { computed, ref, type Ref } from 'vue'
import type { ChartData, GraphLink } from '../utils/graphData'

/** xkContext 里选中/高亮关心的部分（ChartView 中枢状态的形状切片） */
export interface SelectionContextSlice {
  chartData: ChartData | null
}

/**
 * 单击高亮与 Shift+拖框选的选中态。
 * 单击（highlightNodeName/highlightEdgeIndex）与框选（selection*）互斥——
 * Delete 删「框选集优先，否则最后点击的对象」，同一时刻只有一个
 * 「当前删除对象」；对称清空由编排层在单击/背景点击路径完成。
 */
export function useSelection(xkContext: Ref<SelectionContextSlice>) {
  // 高亮边 index（-1 表示无）；原 `let highlightEdge` 变量由此 ref 替代
  const highlightEdgeIndex = ref(-1)
  // 选中高亮节点名（''=无）。name 键：增删后 index 漂移，name 全图唯一稳定；
  // 与 highlightEdgeIndex 互斥——同一时刻图上最多一个高亮对象
  const highlightNodeName = ref('')
  // Shift+拖框选的批量选中集：节点名 + 边 index（chartData.links 索引，选择时
  // 快照；后续任何单击选中/结构变更都会清空，index 不会失配）。与单击高亮
  // （highlightNodeName/highlightEdgeIndex）互斥——Delete 按框选优先分发的
  // 语义只能有一个「当前删除对象」
  const selectionNodeNames = ref<string[]>([])
  const selectionLinkIndexes = ref<number[]>([])
  const highlightEdgeObj = computed(() => {
    const i = highlightEdgeIndex.value
    const links = xkContext.value.chartData?.links
    return i > -1 && links?.[i]
      ? { source: links[i].source, target: links[i].target, name: links[i].name }
      : null
  })

  /** 清全部高亮（点空白/结构变更/收侧栏时由编排层调用） */
  const downplayAllHightlight = () => {
    highlightEdgeIndex.value = -1
    highlightNodeName.value = ''
  }

  /** 清框选集（与高亮独立：复制后选中态保留，Delete/结构变更才清） */
  const clearSelection = () => {
    selectionNodeNames.value = []
    selectionLinkIndexes.value = []
  }

  return {
    highlightEdgeIndex,
    highlightNodeName,
    highlightEdgeObj,
    selectionNodeNames,
    selectionLinkIndexes,
    downplayAllHightlight,
    clearSelection
  }
}
