import { describe, it, expect } from 'vitest'
import {
  createNodeOp,
  changeNodeOp,
  deleteNodeOp,
  createEdgeOp,
  changeEdgeOp,
  deleteEdgeOp,
  appendBatchOp,
  removeBatchOp
} from '../../src/renderer/src/utils/historyOps'

/**
 * undo/redo 操作对象的补偿语义测试（原 historyActions 的 applyUndo/
 * applyRedo 分发测试随操作对象化移植：同一操作的正反变换在同一家工厂）。
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

// 模拟删除单条边的首次删除（按索引删）
const removeLinkAt = (chart, index) => {
  chart.links.splice(index, 1)
}

describe('多重边安全：补偿操作只作用于目标边', () => {
  it('redo deleteEdge 只删除目标边，不连带同端点的其他边', () => {
    const chart = multiEdgeChart()
    const op = deleteEdgeOp({ ...chart.links[0] }) // 删除 e1
    removeLinkAt(chart, 0)
    expect(chart.links.map((l) => l.name)).toEqual(['e2', 'e3'])

    // Ctrl+Z：e1 回来（push 到末尾，组件既有行为）
    op.undo(chart)
    expect(chart.links.map((l) => l.name)).toEqual(['e2', 'e3', 'e1'])

    // Ctrl+Y：只应再删 e1，e2 必须保留
    op.redo(chart)
    expect(chart.links.map((l) => l.name)).toEqual(['e2', 'e3'])
  })

  it('undo changeEdge 修改第二条边时还原正确，不覆盖第一条', () => {
    const chart = multiEdgeChart()
    // 用户把 e2 改名为 z（changeEdge 按索引替换）
    const op = changeEdgeOp({ ...chart.links[1] }, { ...chart.links[1], name: 'z' })
    chart.links[1] = { ...chart.links[1], name: 'z' }

    op.undo(chart)
    expect(chart.links.map((l) => l.name)).toEqual(['e1', 'e2', 'e3'])
  })

  it('redo changeEdge 在多重边图上改回目标边', () => {
    const chart = multiEdgeChart()
    const op = changeEdgeOp({ ...chart.links[1] }, { ...chart.links[1], name: 'z' })
    chart.links[1] = { ...chart.links[1], name: 'z' }
    op.undo(chart)

    op.redo(chart)
    expect(chart.links.map((l) => l.name)).toEqual(['e1', 'z', 'e3'])
  })

  it('undo createEdge 只移除本次创建的边（图中另有同端点旧边时）', () => {
    const chart = multiEdgeChart()
    // 构造：e1 已删（历史可恢复），创建新边 new(A-B) 后 undo 两次把 e1 push 回来，
    // 此时 redo createEdge / undo createEdge 都不得误伤 e1
    const delOp = deleteEdgeOp({ ...chart.links[0] })
    removeLinkAt(chart, 0) // [e2, e3]
    const created = { source: 'A', target: 'B', name: 'new', des: '' }
    const createOp = createEdgeOp(created)
    chart.links.push(created) // [e2, e3, new]

    createOp.undo(chart)
    expect(chart.links.map((l) => l.name)).toEqual(['e2', 'e3'])

    // 恢复 e1 后再 redo 创建，new 与 e1/e2 共存；再次 undo 只删 new
    delOp.undo(chart) // [e2, e3, e1]
    createOp.redo(chart) // [e2, e3, e1, new]
    createOp.undo(chart)
    expect(chart.links.map((l) => l.name)).toEqual(['e2', 'e3', 'e1'])
  })
})

describe('常规序列回归：单边/节点操作行为不变', () => {
  it('createEdge：undo 移除、redo 恢复', () => {
    const chart = multiEdgeChart()
    chart.links = [chart.links[2]] // [e3]，A-B 无边（满足创建前置条件）
    const created = { source: 'A', target: 'B', name: 'new', des: '' }
    const op = createEdgeOp(created)
    chart.links.push(created)

    op.undo(chart)
    expect(chart.links.map((l) => l.name)).toEqual(['e3'])
    op.redo(chart)
    expect(chart.links.map((l) => l.name)).toEqual(['e3', 'new'])
  })

  it('deleteNode：undo 恢复节点与邻接边，redo 再删除', () => {
    const chart = multiEdgeChart()
    const node = chart.nodes[0]
    const op = deleteNodeOp(
      { ...node },
      chart.links.filter((l) => l.source === 'A' || l.target === 'A').map((l) => ({ ...l }))
    )
    chart.nodes = chart.nodes.filter((n) => n.name !== 'A')
    chart.links = chart.links.filter((l) => l.source !== 'A' && l.target !== 'A')
    expect(chart.links.map((l) => l.name)).toEqual(['e3'])

    op.undo(chart)
    expect(chart.nodes.map((n) => n.name)).toEqual(['B', 'C', 'A'])
    expect([...chart.links].map((l) => l.name).sort()).toEqual(['e1', 'e2', 'e3'])

    op.redo(chart)
    expect(chart.nodes.map((n) => n.name)).toEqual(['B', 'C'])
    expect(chart.links.map((l) => l.name)).toEqual(['e3'])
  })

  it('changeNode：改名同步边名，undo/redo 对称还原', () => {
    const chart = multiEdgeChart()
    const op = changeNodeOp({ ...chart.nodes[0] }, { ...chart.nodes[0], name: 'A2' })
    // 首次修改（changeNode 行为：替换节点 + 同步边名）
    chart.nodes[0] = { ...chart.nodes[0], name: 'A2' }
    chart.links.forEach((l) => {
      if (l.source === 'A') l.source = 'A2'
      if (l.target === 'A') l.target = 'A2'
    })

    op.undo(chart)
    expect(chart.nodes[0].name).toBe('A')
    expect(chart.links.map((l) => `${l.source}-${l.target}-${l.name}`).sort()).toEqual([
      'A-B-e1',
      'A-B-e2',
      'B-C-e3'
    ])

    op.redo(chart)
    expect(chart.nodes[0].name).toBe('A2')
    expect(chart.links.every((l) => l.source !== 'A' && l.target !== 'A')).toBe(true)
  })

  it('createNode：undo 移除、redo 恢复', () => {
    const chart = multiEdgeChart()
    const created = { name: 'D', des: '', symbolSize: 50, category: 'y' }
    const op = createNodeOp(created)
    chart.nodes.push(created)

    op.undo(chart)
    expect(chart.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C'])
    op.redo(chart)
    expect(chart.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('appendBatchOp（粘贴/大纲导入整批追加，同构）', () => {
  const batch = {
    nodes: [
      { name: 'A', des: '', category: 'A', symbolSize: 70 },
      { name: 'B', des: '', category: 'A', symbolSize: 50 }
    ],
    links: [{ source: 'A', target: 'B', name: '', des: '' }]
  }

  it('undo 移除本批新增的节点与边，不动既有数据', () => {
    const chart = {
      nodes: [{ name: '旧', des: '', category: 'x', symbolSize: 50 }, ...batch.nodes],
      links: [{ source: '旧', target: 'A', name: '既有边', des: '' }, ...batch.links]
    }
    const op = appendBatchOp(batch)
    op.undo(chart)
    expect(chart.nodes.map((n) => n.name)).toEqual(['旧'])
    expect(chart.links).toEqual([{ source: '旧', target: 'A', name: '既有边', des: '' }])
  })

  it('undo 时同端点的既有边不被误删（边按对象引用移除，天然只命中本批）', () => {
    const chart = {
      nodes: [{ name: 'A', des: '', category: 'A', symbolSize: 70 }],
      links: [{ source: 'A', target: 'B', name: '手工建的', des: '' }]
    }
    appendBatchOp(batch).undo(chart)
    expect(chart.links).toEqual([{ source: 'A', target: 'B', name: '手工建的', des: '' }])
    expect(chart.nodes).toEqual([])
  })

  it('redo 把本批节点与边原样加回', () => {
    const chart = { nodes: [], links: [] }
    const op = appendBatchOp(batch)
    op.redo(chart)
    expect(chart.nodes).toEqual(batch.nodes)
    expect(chart.links).toEqual(batch.links)
  })

  it('undo 边按引用：同键不同对象的既有边不误伤（粘贴后用户手建同键边）', () => {
    const lookalike = { source: 'A', target: 'B', name: '', des: '手建' } // 同键不同对象
    const chart = { nodes: [...batch.nodes], links: [lookalike, batch.links[0]] }
    appendBatchOp(batch).undo(chart)
    expect(chart.links).toEqual([lookalike])
  })
})

describe('removeBatchOp（框选批量删除，与整批追加互逆）', () => {
  // 模拟 useDocument.deleteSelection：框选删 A、B 两节点（连带 e1、e2）+ 直选 e3
  const buildSelectionOp = (chart) => {
    const names = new Set(['A', 'B'])
    const linkIdxs = new Set([2]) // 直选 e3
    const deletedNodes = chart.nodes.filter((n) => names.has(n.name))
    const removedLinks = chart.links.filter(
      (l, i) => linkIdxs.has(i) || names.has(l.source) || names.has(l.target)
    )
    return removeBatchOp({
      nodes: JSON.parse(JSON.stringify(deletedNodes)),
      links: JSON.parse(JSON.stringify(removedLinks))
    })
  }

  it('undo 整批恢复：节点 + 直选边 + 删点连带边一步回全', () => {
    const chart = multiEdgeChart()
    const op = buildSelectionOp(chart)
    // 模拟 deleteSelection 的删除路径（单次 filter，直选 + 连带一并移除）
    const names = new Set(['A', 'B'])
    const linkIdxs = new Set([2])
    chart.nodes = chart.nodes.filter((n) => !names.has(n.name))
    chart.links = chart.links.filter(
      (l, i) => !linkIdxs.has(i) && !names.has(l.source) && !names.has(l.target)
    )
    expect(chart.nodes.map((n) => n.name)).toEqual(['C'])
    expect(chart.links).toEqual([])

    op.undo(chart)
    expect([...chart.nodes.map((n) => n.name)].sort()).toEqual(['A', 'B', 'C'])
    expect([...chart.links.map((l) => l.name)].sort()).toEqual(['e1', 'e2', 'e3'])
  })

  it('redo 再删整批：节点按名、边按对象引用（undo push 回的正是 op 持有的对象）', () => {
    const chart = multiEdgeChart()
    const op = buildSelectionOp(chart)
    chart.nodes = chart.nodes.filter((n) => n.name !== 'A' && n.name !== 'B')
    chart.links = []
    op.undo(chart) // 全部 push 回（op 持有的对象）

    op.redo(chart)
    expect(chart.nodes.map((n) => n.name)).toEqual(['C'])
    expect(chart.links).toEqual([])
  })

  it('redo 只删本批引用，同端点三元组的非本批边保留（多重边安全）', () => {
    const chart = multiEdgeChart()
    const op = buildSelectionOp(chart)
    chart.nodes = chart.nodes.filter((n) => n.name !== 'A' && n.name !== 'B')
    chart.links = []
    op.undo(chart)
    // undo 与 redo 之间用户手工建了同端点同名的边（不同对象）
    chart.links.push({ source: 'A', target: 'B', name: 'e1', des: '手工重建' })

    op.redo(chart)
    // A、B 是本批节点仍被删，但手工边不是本批引用——节点删了边悬空留着
    // （与 createNode 撤销对齐：引用本批节点的既有边保留不动）
    expect(chart.nodes.map((n) => n.name)).toEqual(['C'])
    expect(chart.links).toEqual([{ source: 'A', target: 'B', name: 'e1', des: '手工重建' }])
  })

  it('只框选边不选节点：节点不动，只删直选边', () => {
    const chart = multiEdgeChart()
    const op = removeBatchOp({
      nodes: [],
      links: [JSON.parse(JSON.stringify(chart.links[1]))] // 直选 e2
    })
    chart.links = chart.links.filter((l) => l.name !== 'e2')

    op.undo(chart)
    expect(chart.links.map((l) => l.name).sort()).toEqual(['e1', 'e2', 'e3'])
    expect(chart.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C'])
    op.redo(chart)
    expect(chart.links.map((l) => l.name)).toEqual(['e1', 'e3'])
  })
})
