import { describe, it, expect } from 'vitest'
import { createNodeInChart, createEdgeInChart } from '../../src/renderer/src/utils/XkUtils'

// xkContext 是 ChartView 里的 ref，这里用普通对象模拟 { value } 形状
const makeCtx = (nodes = [], links = []) => ({
  value: {
    errorMessage: '',
    chartData: { nodes, links },
    updateChart: false,
    historyList: [],
    historySequenceNumber: -1
  }
})

describe('createNodeInChart', () => {
  it('成功：push 节点、进历史、翻转 updateChart', () => {
    const ctx = makeCtx()
    const r = createNodeInChart(ctx, { name: 'A', des: '', symbolSize: 50, category: 'c1' })
    expect(r.ok).toBe(true)
    expect(ctx.value.chartData.nodes).toHaveLength(1)
    expect(ctx.value.chartData.nodes[0]).toEqual({
      name: 'A',
      des: '',
      symbolSize: 50,
      category: 'c1'
    })
    expect(ctx.value.historyList).toEqual([
      { act: 'createNode', data: { name: 'A', des: '', symbolSize: 50, category: 'c1' } }
    ])
    expect(ctx.value.historySequenceNumber).toBe(0)
    expect(ctx.value.updateChart).toBe(true)
  })

  it('拒绝：名称为空', () => {
    const ctx = makeCtx()
    const r = createNodeInChart(ctx, { name: '  ', des: '', symbolSize: 50, category: 'c1' })
    expect(r.ok).toBe(false)
    expect(ctx.value.chartData.nodes).toHaveLength(0)
    expect(ctx.value.historyList).toHaveLength(0)
  })

  it('拒绝：类目为空', () => {
    const ctx = makeCtx()
    const r = createNodeInChart(ctx, { name: 'A', des: '', symbolSize: 50, category: '' })
    expect(r.ok).toBe(false)
  })

  it('拒绝：同名节点', () => {
    const ctx = makeCtx([{ name: 'A', des: '', symbolSize: 50, category: 'c1' }])
    const r = createNodeInChart(ctx, { name: 'A', des: '', symbolSize: 50, category: 'c1' })
    expect(r.ok).toBe(false)
  })

  it('入参对象与 chartData 脱钩（jsonReactive 深拷贝）', () => {
    const ctx = makeCtx()
    const input = { name: 'A', des: '', symbolSize: 50, category: 'c1' }
    createNodeInChart(ctx, input)
    input.name = 'changed'
    expect(ctx.value.chartData.nodes[0].name).toBe('A')
  })
})

describe('createEdgeInChart', () => {
  it('成功：push 边、进历史、翻转 updateChart（含空名边）', () => {
    const ctx = makeCtx()
    const r = createEdgeInChart(ctx, { source: 'A', target: 'B', name: '', des: '' })
    expect(r.ok).toBe(true)
    expect(ctx.value.chartData.links).toHaveLength(1)
    expect(ctx.value.historyList[0].act).toBe('createEdge')
    expect(ctx.value.updateChart).toBe(true)
  })

  it('拒绝：重复边（端点对无向，正反序都算）', () => {
    const ctx = makeCtx([], [{ source: 'A', target: 'B', name: 'x', des: '' }])
    expect(createEdgeInChart(ctx, { source: 'A', target: 'B', name: 'y', des: '' }).ok).toBe(false)
    expect(createEdgeInChart(ctx, { source: 'B', target: 'A', name: 'y', des: '' }).ok).toBe(false)
    expect(ctx.value.chartData.links).toHaveLength(1)
  })
})
