import { describe, it, expect } from 'vitest'
import {
  jsonReactive,
  addHistory,
  resetNodeRef,
  resetEdgeRef,
  createNodeInChart,
  createEdgeInChart
} from '../../src/renderer/src/utils/XkUtils'

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

describe('jsonReactive：深拷贝入图', () => {
  it('嵌套对象与数组整体脱钩（改副本不回渗原图）', () => {
    const src = { nodes: [{ name: 'A' }], links: [] }
    const copy = jsonReactive(src)
    copy.nodes[0].name = 'changed'
    copy.links.push('x')
    expect(src.nodes[0].name).toBe('A')
    expect(src.links).toHaveLength(0)
  })
})

describe('addHistory：历史栈不变量', () => {
  it('空栈首条：push 后当前序号为 0', () => {
    const ctx = makeCtx()
    addHistory(ctx, { act: 'createNode', data: {} })
    expect(ctx.value.historyList).toHaveLength(1)
    expect(ctx.value.historySequenceNumber).toBe(0)
  })

  it('连续追加：序号随栈顶推进', () => {
    const ctx = makeCtx()
    addHistory(ctx, { act: 'a', data: 1 })
    addHistory(ctx, { act: 'b', data: 2 })
    expect(ctx.value.historySequenceNumber).toBe(1)
  })

  it('undo 后做新操作截断其后的 redo 分支（不截断会重放过期记录）', () => {
    const ctx = makeCtx()
    addHistory(ctx, { act: 'a', data: 1 })
    addHistory(ctx, { act: 'b', data: 2 })
    addHistory(ctx, { act: 'c', data: 3 })
    // 模拟一次 undo：序号回退到第 2 条
    ctx.value.historySequenceNumber = 1
    addHistory(ctx, { act: 'd', data: 4 })
    expect(ctx.value.historyList.map((h) => h.act)).toEqual(['a', 'b', 'd'])
    expect(ctx.value.historySequenceNumber).toBe(2)
  })
})

describe('resetNodeRef / resetEdgeRef：表单复位', () => {
  it('resetNodeRef 回到空节点模板（symbolSize 基线 50）', () => {
    const node = { value: { name: 'A', des: 'x', symbolSize: 99, category: 'c1' } }
    resetNodeRef(node)
    expect(node.value).toEqual({ name: '', des: '', symbolSize: 50, category: '' })
  })

  it('resetEdgeRef 回到空边模板', () => {
    const edge = { value: { source: 'A', target: 'B', name: 'r', des: 'x' } }
    resetEdgeRef(edge)
    expect(edge.value).toEqual({ source: '', target: '', name: '', des: '' })
  })
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
