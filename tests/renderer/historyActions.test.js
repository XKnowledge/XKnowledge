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

describe('importOutline', () => {
  const entry = {
    act: 'importOutline',
    data: {
      nodes: [
        { name: 'A', des: '', category: 'A', symbolSize: 70 },
        { name: 'B', des: '', category: 'A', symbolSize: 50 }
      ],
      links: [{ source: 'A', target: 'B', name: '', des: '' }]
    }
  }

  it('undo 移除本批新增的节点与边，不动既有数据', () => {
    const chartData = {
      nodes: [{ name: '旧', des: '', category: 'x', symbolSize: 50 }, ...entry.data.nodes],
      links: [{ source: '旧', target: 'A', name: '既有边', des: '' }, ...entry.data.links]
    }
    expect(applyUndo(chartData, entry)).toBe(true)
    expect(chartData.nodes.map((n) => n.name)).toEqual(['旧'])
    expect(chartData.links).toEqual([{ source: '旧', target: 'A', name: '既有边', des: '' }])
  })

  it('undo 时同端点的既有边不被误删（边按对象引用移除，天然只命中本批）', () => {
    const chartData = {
      nodes: [{ name: 'A', des: '', category: 'A', symbolSize: 70 }],
      links: [{ source: 'A', target: 'B', name: '手工建的', des: '' }]
    }
    applyUndo(chartData, entry)
    expect(chartData.links).toEqual([{ source: 'A', target: 'B', name: '手工建的', des: '' }])
    expect(chartData.nodes).toEqual([])
  })

  it('redo 把本批节点与边原样加回', () => {
    const chartData = { nodes: [], links: [] }
    expect(applyRedo(chartData, entry)).toBe(true)
    expect(chartData.nodes).toEqual(entry.data.nodes)
    expect(chartData.links).toEqual(entry.data.links)
  })
})

describe('deleteSelection（框选批量删除）', () => {
  // 模拟 ChartView.deleteSelection：框选删 A、B 两节点（连带 e1、e2）+ 直选 e3
  const buildSelectionHistory = (chart) => {
    const names = new Set(['A', 'B'])
    const linkIdxs = new Set([2]) // 直选 e3
    const deletedNodes = chart.nodes.filter((n) => names.has(n.name))
    const removedLinks = chart.links.filter(
      (l, i) => linkIdxs.has(i) || names.has(l.source) || names.has(l.target)
    )
    return {
      act: 'deleteSelection',
      data: {
        nodes: JSON.parse(JSON.stringify(deletedNodes)),
        links: JSON.parse(JSON.stringify(removedLinks))
      }
    }
  }

  it('undo 整批恢复：节点 + 直选边 + 删点连带边一步回全', () => {
    const chart = multiEdgeChart()
    const history = buildSelectionHistory(chart)
    // 模拟 deleteSelection 的删除路径（单次 filter，直选 + 连带一并移除）
    const names = new Set(['A', 'B'])
    const linkIdxs = new Set([2])
    chart.nodes = chart.nodes.filter((n) => !names.has(n.name))
    chart.links = chart.links.filter(
      (l, i) => !linkIdxs.has(i) && !names.has(l.source) && !names.has(l.target)
    )
    expect(chart.nodes.map((n) => n.name)).toEqual(['C'])
    expect(chart.links).toEqual([])

    expect(applyUndo(chart, history)).toBe(true)
    expect([...chart.nodes.map((n) => n.name)].sort()).toEqual(['A', 'B', 'C'])
    expect([...chart.links.map((l) => l.name)].sort()).toEqual(['e1', 'e2', 'e3'])
  })

  it('redo 再删整批：节点按名、边按对象引用（undo push 回的正是 history 持有的对象）', () => {
    const chart = multiEdgeChart()
    const history = buildSelectionHistory(chart)
    chart.nodes = chart.nodes.filter((n) => n.name !== 'A' && n.name !== 'B')
    chart.links = []
    applyUndo(chart, history) // 全部 push 回（data 持有的对象）

    expect(applyRedo(chart, history)).toBe(true)
    expect(chart.nodes.map((n) => n.name)).toEqual(['C'])
    expect(chart.links).toEqual([])
  })

  it('redo 只删本批引用，同端点三元组的非本批边保留（多重边安全）', () => {
    const chart = multiEdgeChart()
    const history = buildSelectionHistory(chart)
    chart.nodes = chart.nodes.filter((n) => n.name !== 'A' && n.name !== 'B')
    chart.links = []
    applyUndo(chart, history)
    // undo 与 redo 之间用户手工建了同端点同名的边（不同对象）
    chart.links.push({ source: 'A', target: 'B', name: 'e1', des: '手工重建' })

    expect(applyRedo(chart, history)).toBe(true)
    // A、B 是本批节点仍被删，但手工边不是本批引用——节点删了边悬空留着
    // （与 createNode 撤销对齐：引用本批节点的既有边保留不动）
    expect(chart.nodes.map((n) => n.name)).toEqual(['C'])
    expect(chart.links).toEqual([{ source: 'A', target: 'B', name: 'e1', des: '手工重建' }])
  })

  it('只框选边不选节点：节点不动，只删直选边', () => {
    const chart = multiEdgeChart()
    const history = {
      act: 'deleteSelection',
      data: {
        nodes: [],
        links: [JSON.parse(JSON.stringify(chart.links[1]))] // 直选 e2
      }
    }
    chart.links = chart.links.filter((l) => l.name !== 'e2')

    expect(applyUndo(chart, history)).toBe(true)
    expect(chart.links.map((l) => l.name).sort()).toEqual(['e1', 'e2', 'e3'])
    expect(chart.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C'])
    expect(applyRedo(chart, history)).toBe(true)
    expect(chart.links.map((l) => l.name)).toEqual(['e1', 'e3'])
  })
})

describe('pasteGraph（粘贴整批，与 importOutline 同构）', () => {
  const batch = {
    nodes: [{ name: 'P', des: '', symbolSize: 50, category: 'c' }],
    links: [{ source: 'P', target: 'Q', name: 'pq', des: '' }]
  }

  it('undo：节点按名移除、边按对象引用移除', () => {
    const chart = {
      nodes: [{ name: 'A' }, batch.nodes[0]],
      links: [{ source: 'A', target: 'B', name: 'ab' }, batch.links[0]]
    }
    expect(applyUndo(chart, { act: 'pasteGraph', data: batch })).toBe(true)
    expect(chart.nodes).toEqual([{ name: 'A' }])
    expect(chart.links).toEqual([{ source: 'A', target: 'B', name: 'ab' }])
  })

  it('undo 边按引用：同键不同对象的既有边不误伤（粘贴后用户手建同键边）', () => {
    const lookalike = { source: 'P', target: 'Q', name: 'pq', des: '手建' } // 同键不同对象
    const chart = { nodes: [{ name: 'A' }, ...batch.nodes], links: [lookalike, batch.links[0]] }
    applyUndo(chart, { act: 'pasteGraph', data: batch })
    expect(chart.links).toEqual([lookalike])
  })

  it('redo：整批 push 回', () => {
    const chart = { nodes: [{ name: 'A' }], links: [] }
    expect(applyRedo(chart, { act: 'pasteGraph', data: batch })).toBe(true)
    expect(chart.nodes).toEqual([
      { name: 'A' },
      { name: 'P', des: '', symbolSize: 50, category: 'c' }
    ])
    expect(chart.links).toEqual([{ source: 'P', target: 'Q', name: 'pq', des: '' }])
  })
})
