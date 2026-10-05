import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useChartAttrs } from '../../src/renderer/src/composables/useChartAttrs'
import { useDocument } from '../../src/renderer/src/composables/useDocument'

/** 特征测试（characterization）：锁定 ChartView 属性面板既有行为，动刀前后不得漂移。
 *  覆盖清点结论：该角色此前无任何单测、唯一冒烟 smoke-chart-info 基线为红——
 *  本文件是 useChartAttrs 抽取的入场券（见 docs/chartview-split-checklist.md 第三节）。
 *  文档域用真实 useDocument（简介写入经 setDescription 意图）。 */
const makeDoc = (chartData = null) => {
  const doc = useDocument({ onChange: () => {} })
  if (chartData) doc.load(chartData)
  return doc
}

describe('useChartAttrs（属性面板状态机）', () => {
  it('initAttr 恢复会话默认值：双开关、斥力 100、仅勾「显示小节点名称」', () => {
    const { checkedValues, repulsion, showLinkName, showSmallLabels, initAttr } = useChartAttrs({
      document: makeDoc({ nodes: [], links: [] }),
      graph3dRef: ref(null),
      markDirty: () => {}
    })
    showLinkName.value = true
    repulsion.value = 300
    checkedValues.value = ['showEdgeName']
    initAttr()
    expect(showLinkName.value).toBe(false)
    expect(showSmallLabels.value).toBe(true)
    expect(repulsion.value).toBe(100)
    expect(checkedValues.value).toEqual(['showSmallLabels'])
  })

  it('onChangeAttr：checkedValues → 双开关联动，并置脏', () => {
    const markDirty = vi.fn()
    const { checkedValues, showLinkName, showSmallLabels, onChangeAttr } = useChartAttrs({
      document: makeDoc({ nodes: [], links: [] }),
      graph3dRef: ref(null),
      markDirty
    })
    checkedValues.value = ['showEdgeName', 'showSmallLabels']
    onChangeAttr()
    expect(showLinkName.value).toBe(true)
    expect(showSmallLabels.value).toBe(true)
    expect(markDirty).toHaveBeenCalled()

    checkedValues.value = []
    onChangeAttr()
    expect(showLinkName.value).toBe(false)
    expect(showSmallLabels.value).toBe(false)
    expect(markDirty).toHaveBeenCalledTimes(2)
  })

  it('chartDescription：chartData 为 null 时 get 兜底空串、set 无操作不抛错（装载失败窗口）', () => {
    const { chartDescription } = useChartAttrs({
      document: makeDoc(null),
      graph3dRef: ref(null),
      markDirty: () => {}
    })
    expect(chartDescription.value).toBe('')
    expect(() => (chartDescription.value = 'x')).not.toThrow()
    expect(chartDescription.value).toBe('')
  })

  it('chartDescription：读写 chartData.description（含「无该字段首次创建」路径）', () => {
    const doc = makeDoc({ nodes: [], links: [] })
    const { chartDescription } = useChartAttrs({
      document: doc,
      graph3dRef: ref(null),
      markDirty: () => {}
    })
    expect(chartDescription.value).toBe('')
    chartDescription.value = '图谱简介'
    expect(doc.chartData.value.description).toBe('图谱简介')
    expect(chartDescription.value).toBe('图谱简介')
  })

  it('onChangeRepulsion：向图实例下发 setRepulsion 并置脏', () => {
    const setRepulsion = vi.fn()
    const markDirty = vi.fn()
    const { repulsion, onChangeRepulsion } = useChartAttrs({
      document: makeDoc({ nodes: [], links: [] }),
      graph3dRef: ref({ setRepulsion }),
      markDirty
    })
    repulsion.value = 250
    onChangeRepulsion()
    expect(setRepulsion).toHaveBeenCalledWith(250)
    expect(markDirty).toHaveBeenCalled()
  })

  it('onDescriptionChange：仅置脏（简介文本本身经 chartDescription computed 直写）', () => {
    const markDirty = vi.fn()
    const { onDescriptionChange } = useChartAttrs({
      document: makeDoc({ nodes: [], links: [] }),
      graph3dRef: ref(null),
      markDirty
    })
    onDescriptionChange()
    expect(markDirty).toHaveBeenCalledTimes(1)
  })
})
