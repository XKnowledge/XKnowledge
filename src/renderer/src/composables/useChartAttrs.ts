import { computed, ref, type Ref } from 'vue'
import type { DocumentHandle } from './useDocument'

export interface UseChartAttrsOptions {
  /** 图谱文档（读 chartData.description、写经 setDescription 意图——元数据
   *  不进撤销栈、不触发结构性刷新；装载失败时 chartData 为 null） */
  document: DocumentHandle
  /** XkGraph3D 实例（expose setRepulsion） */
  graph3dRef: Ref<{ setRepulsion?: (v: number) => void } | null>
  /** 置脏回调：开关/滑块/简介编辑都置脏（saveNodeVisible 由编排层持有） */
  markDirty: () => void
}

/**
 * 属性面板状态机（会话级渲染设置 + 图表级元数据）。
 * 刻意不碰聚焦模式：聚焦三态「不置脏、跨图保持」是设计意图
 * （见 ChartView 模板内注释），不与本面板的置脏管道混流。
 */
export function useChartAttrs({ document: doc, graph3dRef, markDirty }: UseChartAttrsOptions) {
  const checkedValues = ref<string[]>([])
  const repulsion = ref(100)
  const showLinkName = ref(false) // 会话级渲染设置：悬浮时是否显示边名
  const showSmallLabels = ref(true) // 会话级渲染设置：是否常显小节点名称（默认开，全显）

  const onChangeAttr = () => {
    showLinkName.value = checkedValues.value.includes('showEdgeName')
    showSmallLabels.value = checkedValues.value.includes('showSmallLabels')
    markDirty()
  }

  // 图谱简介：双向包装 chartData.description——装载失败时 chartData 为 null，
  // 而属性面板仅被 v-show 隐藏仍会渲染，裸绑 description 会在渲染期抛
  // TypeError；get 兜底空串，set 顺带覆盖「新建文件无该字段」的首次创建
  const chartDescription = computed({
    get: () => doc.chartData.value?.description ?? '',
    set: (v) => doc.setDescription(v)
  })

  const onDescriptionChange = () => {
    markDirty()
  }

  const onChangeRepulsion = () => {
    graph3dRef.value?.setRepulsion(repulsion.value)
    markDirty()
  }

  /** v2 格式不存渲染配置，装载时恢复会话默认值（编排层 loadChartData 调用） */
  const initAttr = () => {
    showLinkName.value = false
    showSmallLabels.value = true
    repulsion.value = 100
    checkedValues.value = ['showSmallLabels']
  }

  return {
    checkedValues,
    repulsion,
    showLinkName,
    showSmallLabels,
    chartDescription,
    onChangeAttr,
    onDescriptionChange,
    onChangeRepulsion,
    initAttr
  }
}
