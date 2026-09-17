import { describe, it, expect } from 'vitest'
import { applyUndo, applyRedo } from '../../src/renderer/src/utils/historyActions'

/**
 * undo/redo 补偿操作的数据层测试。
 * 多重边（同一对节点间多条边，靠 name 区分）是真实存在的文件形态
 * （examples/中医基础理论.xk 有 3 对、地理.xk 有 1 对），补偿操作必须
 * 精确定位到目标边，不能按端点对连带误伤邻边。
 */

// 带多重边的图：A-B 之间有 e1、e2 两条边
const multiEdgeChart = () => ({
  version: 2,
  nodes: [
    { name: 'A', des: '', symbolSize: 50, category: 'x' },
    { name: 'B', des: '', symbolSize: 50, category: 'x' },
    { name: 'C', des: '', symbolSize: 50, category: 'y' }
  ],
  links: [
    { source: 'A', target: 'B', name: 'e1', des: '' },
    { source: 'A', target: 'B', name: 'e2', des: '' },
    { source: 'B', target: 'C', name: 'e3', des: '' }
  ]
})

// 模拟 ChartView.deleteEdge 的首次删除（按索引删单条）
const removeLinkAt = (chart, index) => {
  chart.links.splice(index, 1)
}

describe('多重边安全：补偿操作只作用于目标边', () => {
  it('redo deleteEdge 只删除目标边，不连带同端点的其他边', () => {
    const chart = multiEdgeChart()
    const history = { act: 'deleteEdge', data: { ...chart.links[0] } } // 删除 e1
    removeLinkAt(chart, 0)
    expect(chart.links.map((l) => l.name)).toEqual(['e2', 'e3'])

    // Ctrl+Z：e1 回来（push 到末尾，组件既有行为）
    expect(applyUndo(chart, history)).toBe(true)
    expect(chart.links.map((l) => l.name)).toEqual(['e2', 'e3', 'e1'])

    // Ctrl+Y：只应再删 e1，e2 必须保留
    expect(applyRedo(chart, history)).toBe(true)
    expect(chart.links.map((l) => l.name)).toEqual(['e2', 'e3'])
  })

  it('undo changeEdge 修改第二条边时还原正确，不覆盖第一条', () => {
    const chart = multiEdgeChart()
    // 用户把 e2 改名为 z（currentEdgeSubmit 按索引替换）
    const history = {
      act: 'changeEdge',
      old: { ...chart.links[1] },
      new: { ...chart.links[1], name: 'z' }
    }
    chart.links[1] = history.new

    expect(applyUndo(chart, history)).toBe(true)
    expect(chart.links.map((l) => l.name)).toEqual(['e1', 'e2', 'e3'])
  })

  it('redo changeEdge 在多重边图上改回目标边', () => {
    const chart = multiEdgeChart()
    const history = {
      act: 'changeEdge',
      old: { ...chart.links[1] },
      new: { ...chart.links[1], name: 'z' }
    }
    chart.links[1] = history.new
    applyUndo(chart, history)

    expect(applyRedo(chart, history)).toBe(true)
    expect(chart.links.map((l) => l.name)).toEqual(['e1', 'z', 'e3'])
  })

  it('undo createEdge 只移除本次创建的边（图中另有同端点旧边时）', () => {
    const chart = multiEdgeChart()
    // 构造：e1 已删（历史可恢复），创建新边 new(A-B) 后 undo 两次把 e1 push 回来，
    // 此时 redo createEdge / undo createEdge 都不得误伤 e1
    const delHistory = { act: 'deleteEdge', data: { ...chart.links[0] } }
    removeLinkAt(chart, 0) // [e2, e3]
    const created = { source: 'A', target: 'B', name: 'new', des: '' }
    const createHistory = { act: 'createEdge', data: created }
    chart.links.push(created) // [e2, e3, new]

    expect(applyUndo(chart, createHistory)).toBe(true)
    expect(chart.links.map((l) => l.name)).toEqual(['e2', 'e3'])

    // 恢复 e1 后再 redo 创建，new 与 e1/e2 共存；再次 undo 只删 new
    applyUndo(chart, delHistory) // [e2, e3, e1]
    expect(applyRedo(chart, createHistory)).toBe(true) // [e2, e3, e1, new]
    expect(applyUndo(chart, createHistory)).toBe(true)
    expect(chart.links.map((l) => l.name)).toEqual(['e2', 'e3', 'e1'])
  })
})

describe('常规序列回归：单边/节点操作行为不变', () => {
  it('createEdge：undo 移除、redo 恢复', () => {
    const chart = multiEdgeChart()
    chart.links = [chart.links[2]] // [e3]，A-B 无边（满足创建前置条件）
    const created = { source: 'A', target: 'B', name: 'new', des: '' }
    const history = { act: 'createEdge', data: created }
    chart.links.push(created)

    expect(applyUndo(chart, history)).toBe(true)
    expect(chart.links.map((l) => l.name)).toEqual(['e3'])
    expect(applyRedo(chart, history)).toBe(true)
    expect(chart.links.map((l) => l.name)).toEqual(['e3', 'new'])
  })

  it('deleteNode：undo 恢复节点与邻接边，redo 再删除', () => {
    const chart = multiEdgeChart()
    const history = {
      act: 'deleteNode',
      data: { ...chart.nodes[0] },
      links: chart.links.filter((l) => l.source === 'A' || l.target === 'A').map((l) => ({ ...l }))
    }
    chart.nodes = chart.nodes.filter((n) => n.name !== 'A')
    chart.links = chart.links.filter((l) => l.source !== 'A' && l.target !== 'A')
    expect(chart.links.map((l) => l.name)).toEqual(['e3'])

    expect(applyUndo(chart, history)).toBe(true)
    expect(chart.nodes.map((n) => n.name)).toEqual(['B', 'C', 'A'])
    expect([...chart.links].map((l) => l.name).sort()).toEqual(['e1', 'e2', 'e3'])

    expect(applyRedo(chart, history)).toBe(true)
    expect(chart.nodes.map((n) => n.name)).toEqual(['B', 'C'])
    expect(chart.links.map((l) => l.name)).toEqual(['e3'])
  })

  it('changeNode：改名同步边名，undo/redo 对称还原', () => {
    const chart = multiEdgeChart()
    const history = {
      act: 'changeNode',
      old: { ...chart.nodes[0] },
      new: { ...chart.nodes[0], name: 'A2' }
    }
    // 首次修改（currentNodeSubmit 行为：替换节点 + 同步边名）
    chart.nodes[0] = history.new
    chart.links.forEach((l) => {
      if (l.source === 'A') l.source = 'A2'
      if (l.target === 'A') l.target = 'A2'
    })

    expect(applyUndo(chart, history)).toBe(true)
    expect(chart.nodes[0].name).toBe('A')
    expect(chart.links.map((l) => `${l.source}-${l.target}-${l.name}`).sort()).toEqual([
      'A-B-e1',
      'A-B-e2',
      'B-C-e3'
    ])

    expect(applyRedo(chart, history)).toBe(true)
    expect(chart.nodes[0].name).toBe('A2')
    expect(chart.links.every((l) => l.source !== 'A' && l.target !== 'A')).toBe(true)
  })

  it('createNode：undo 移除、redo 恢复', () => {
    const chart = multiEdgeChart()
    const created = { name: 'D', des: '', symbolSize: 50, category: 'y' }
    const history = { act: 'createNode', data: created }
    chart.nodes.push(created)

    expect(applyUndo(chart, history)).toBe(true)
    expect(chart.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C'])
    expect(applyRedo(chart, history)).toBe(true)
    expect(chart.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('未知操作类型返回 false，不改动数据', () => {
    const chart = multiEdgeChart()
    const before = JSON.stringify(chart)
    expect(applyUndo(chart, { act: 'nonsense', data: {} })).toBe(false)
    expect(applyRedo(chart, { act: 'nonsense', data: {} })).toBe(false)
    expect(JSON.stringify(chart)).toBe(before)
  })
})
