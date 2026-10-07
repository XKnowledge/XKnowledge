// useSelection 单测：单击高亮（节点名/边索引）与 Shift+框选两套状态的
// 读写、互斥清空（downplayAllHightlight 只清高亮、clearSelection 只清
// 框选——复制后选中态保留的语义靠这对独立出口）与 highlightEdgeObj 的
// 派生边界（-1 / 越界 / chartData 缺失）。
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useSelection } from '../../src/renderer/src/composables/useSelection'

const node = (name, category = 'c1', symbolSize = 50) => ({
  name,
  des: '',
  symbolSize,
  category
})

describe('useSelection（选中态）', () => {
  const makeChart = () =>
    ref({
      nodes: [node('A'), node('B', 'c2'), node('C')],
      links: [
        { source: 'A', target: 'B', name: 'e1', des: '' },
        { source: 'B', target: 'C', name: 'e2', des: '' }
      ]
    })

  it('初始态：无高亮、无框选', () => {
    const s = useSelection(makeChart())
    expect(s.highlightEdgeIndex.value).toBe(-1)
    expect(s.highlightNodeName.value).toBe('')
    expect(s.selectionNodeNames.value).toEqual([])
    expect(s.selectionLinkIndexes.value).toEqual([])
    expect(s.highlightEdgeObj.value).toBeNull()
  })

  it('highlightEdgeObj：有效索引派生 {source,target,name}', () => {
    const chart = makeChart()
    const s = useSelection(chart)
    s.highlightEdgeIndex.value = 1
    expect(s.highlightEdgeObj.value).toEqual({
      source: 'B',
      target: 'C',
      name: 'e2'
    })
  })

  it('highlightEdgeObj 边界：-1 / 越界 / chartData 为 null 均 null', () => {
    const s = useSelection(makeChart())
    s.highlightEdgeIndex.value = 99
    expect(s.highlightEdgeObj.value).toBeNull()
    s.highlightEdgeIndex.value = -1
    expect(s.highlightEdgeObj.value).toBeNull()

    const chart = ref(null)
    const s2 = useSelection(chart)
    s2.highlightEdgeIndex.value = 0
    expect(s2.highlightEdgeObj.value).toBeNull()
  })

  it('highlightEdgeObj 随 links 数组响应（换图重算，索引是快照语义）', () => {
    const chart = makeChart()
    const s = useSelection(chart)
    s.highlightEdgeIndex.value = 0
    expect(s.highlightEdgeObj.value.name).toBe('e1')
    chart.value = { nodes: [node('X')], links: [{ source: 'X', target: 'X', name: 'n1', des: '' }] }
    expect(s.highlightEdgeObj.value.name).toBe('n1')
  })

  it('downplayAllHightlight 只清单击高亮，框选集保留（复制后态）', () => {
    const s = useSelection(makeChart())
    s.highlightEdgeIndex.value = 0
    s.highlightNodeName.value = 'A'
    s.selectionNodeNames.value = ['A', 'B']
    s.selectionLinkIndexes.value = [1]
    s.downplayAllHightlight()
    expect(s.highlightEdgeIndex.value).toBe(-1)
    expect(s.highlightNodeName.value).toBe('')
    expect(s.selectionNodeNames.value).toEqual(['A', 'B'])
    expect(s.selectionLinkIndexes.value).toEqual([1])
  })

  it('clearSelection 只清框选集，高亮保留（与 downplay 对称）', () => {
    const s = useSelection(makeChart())
    s.highlightEdgeIndex.value = 0
    s.highlightNodeName.value = 'A'
    s.selectionNodeNames.value = ['A']
    s.selectionLinkIndexes.value = [0]
    s.clearSelection()
    expect(s.selectionNodeNames.value).toEqual([])
    expect(s.selectionLinkIndexes.value).toEqual([])
    expect(s.highlightEdgeIndex.value).toBe(0)
    expect(s.highlightNodeName.value).toBe('A')
  })
})
