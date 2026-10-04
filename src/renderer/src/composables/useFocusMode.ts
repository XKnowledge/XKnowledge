import { computed, ref, watch, type Ref } from 'vue'
import { defaultFocusNode, focusNeighborhood } from '../utils/graphData'
import type { ChartData, GraphNode } from '../utils/graphData'

/** xkContext 里聚焦模式关心的部分（ChartView 中枢状态的形状切片） */
export interface FocusContextSlice {
  chartData: ChartData | null
}

export interface UseFocusModeOptions {
  /** 中枢状态（读 chartData 的 nodes/links） */
  xkContext: Ref<FocusContextSlice>
  /** 侧栏选中索引（开聚焦时优先当前选中节点） */
  currentNodeDataIndex: Ref<number>
  /** 侧栏节点表单（选中索引无效时的回退） */
  currentNode: Ref<GraphNode | null | undefined>
  /** 焦点同步侧栏选中（仅数据，不弹面板/不切面板——由编排层提供，见 syncCurrentNodeByName） */
  syncCurrentNodeByName: (name: string) => void
}

/**
 * 聚焦模式状态机（会话级，不写盘、不置脏、不进 initAttr——用户开着
 * 探照灯换图，灯不应被默默关掉，否则「打开新图自动聚焦」永远不触发）：
 * off 关闭 / focus 灰化（邻域外退灰）/ deep 隐藏（邻域外直接隐藏）。
 * 刻意与属性面板的置脏管道分流（见 ChartView 模板内注释）。
 */
export function useFocusMode({
  xkContext,
  currentNodeDataIndex,
  currentNode,
  syncCurrentNodeByName
}: UseFocusModeOptions) {
  const focusMode = ref<'off' | 'focus' | 'deep'>('off')
  const focusHops = ref(2)
  const focusNodeId = ref('')
  // 邻域集合：依赖 chartData/focusNodeId/focusHops，图被增删编辑后自动重算
  const focusNodeNames = computed(() => {
    if (focusMode.value === 'off' || !focusNodeId.value) return []
    const chart = xkContext.value.chartData
    return [
      ...focusNeighborhood(
        chart?.nodes ?? [],
        chart?.links ?? [],
        focusNodeId.value,
        focusHops.value
      )
    ]
  })

  /** 模式切换（取 change 的新值而非 ref：antdv select 的 update:value 与 change
   *  的触发顺序无契约，参数值永远可靠）。聚焦/深度聚焦开启路径完全一致 */
  const onFocusModeChange = (mode: string) => {
    if (mode === 'off') {
      // 关闭：去色立即消失、相机恢复（XkGraph3D 的 focusNodeNames watch 处理）
      focusNodeId.value = ''
      return
    }
    // 开启：优先当前选中节点，否则默认焦点（度数最高 → symbolSize → 先出现）
    const nodes = xkContext.value.chartData?.nodes ?? []
    const selected =
      currentNodeDataIndex.value > -1 && nodes[currentNodeDataIndex.value]
        ? nodes[currentNodeDataIndex.value].name
        : currentNode.value?.name || ''
    focusNodeId.value = selected || defaultFocusNode(nodes, xkContext.value.chartData?.links ?? [])
    // 焦点同步选中（仅数据，不强制弹侧栏/切面板——不打扰当前面板状态）
    if (focusNodeId.value) syncCurrentNodeByName(focusNodeId.value)
  }

  // 焦点节点被删：回退默认焦点；全图删空 → '' → 邻域空 = 全图恢复正常色
  watch(
    () => xkContext.value.chartData?.nodes,
    (nodes) => {
      if (focusMode.value === 'off' || !focusNodeId.value) return
      if (!nodes?.some((n) => n.name === focusNodeId.value)) {
        const next = defaultFocusNode(nodes ?? [], xkContext.value.chartData?.links ?? [])
        focusNodeId.value = next
        if (next) syncCurrentNodeByName(next)
      }
    }
  )

  return { focusMode, focusHops, focusNodeId, focusNodeNames, onFocusModeChange }
}
