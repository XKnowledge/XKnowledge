import { describe, it, expect } from 'vitest'
import { useDocument } from '../../src/renderer/src/composables/useDocument'

/**
 * 特征测试（characterization）：锁定收敛进 useDocument 前分散在
 * XkUtils（建点建边/历史栈不变量）、XkCurrentNode/XkCurrentEdge（表单提交）、
 * useEditActions（删除/粘贴/大纲导入/撤销重做）与 ChartView（updateChart
 * 翻转 + watch 派生计算）的既有行为，动刀前后不得漂移。
 * 历史栈断言只走行为与长度（undo/redo 后的数据状态），不锁条目形状——
 * 历史表示的演进（形状约定 → 操作对象）不应惊动本文件。
 * onChange 是结构性变更的唯一出口：dirty 区分「编辑置脏」与「装载换图」。
 */

const node = (name, category = 'c1', extra = {}) => ({
  name,
  des: '',
  symbolSize: 50,
  category,
  ...extra
})
const link = (source, target, name = '') => ({ source, target, name, des: '' })

const makeDoc = () => {
  const changes = []
  const doc = useDocument({ onChange: (c) => changes.push({ ...c }) })
  return { doc, changes }
}

/** 图里已有一条 A-B 边、A/B/C 三节点的文档 */
const makeLoadedDoc = () => {
  const { doc, changes } = makeDoc()
  doc.load({
    nodes: [node('A'), node('B'), node('C', 'c2')],
    links: [link('A', 'B', 'e1'), link('B', 'C', 'e2')]
  })
  changes.length = 0
  return { doc, changes }
}

describe('load：装载换图', () => {
  it('装载后 chartData 就位，以 dirty:false 通知（换图不置脏）', () => {
    const { doc, changes } = makeDoc()
    doc.load({ nodes: [node('A')], links: [] })
    expect(doc.chartData.value.nodes.map((n) => n.name)).toEqual(['A'])
    expect(changes).toEqual([{ dirty: false }])
  })

  it('换图清空历史：装载 → 编辑 → 再装载后 undo 是无操作', () => {
    const { doc } = makeLoadedDoc()
    doc.createNode(node('D'))
    doc.load({ nodes: [node('X')], links: [] })
    expect(doc.undo()).toBe(false)
    expect(doc.chartData.value.nodes.map((n) => n.name)).toEqual(['X'])
  })
})

describe('createNode：建点（表单与画布直操共用）', () => {
  it('成功：入图、进历史、以 dirty:true 通知，返回数据与入参脱钩', () => {
    const { doc, changes } = makeLoadedDoc()
    const input = node('D')
    const r = doc.createNode(input)
    expect(r.ok).toBe(true)
    input.name = 'changed'
    expect(doc.chartData.value.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(doc.historyList.value).toHaveLength(1)
    expect(changes).toEqual([{ dirty: true }])
    expect(r.data.name).toBe('D')
  })

  it('拒绝：名称为空 / 类目为空 / 同名节点——数据不动、不进历史、无通知', () => {
    const { doc, changes } = makeLoadedDoc()
    expect(doc.createNode(node('  ')).ok).toBe(false)
    expect(doc.createNode(node('D', '')).ok).toBe(false)
    expect(doc.createNode(node('A')).ok).toBe(false)
    expect(doc.chartData.value.nodes).toHaveLength(3)
    expect(doc.historyList.value).toHaveLength(0)
    expect(changes).toEqual([])
  })
})

describe('createEdge：建边', () => {
  it('成功：入图（含空名边）、进历史、通知', () => {
    const { doc, changes } = makeLoadedDoc()
    const r = doc.createEdge(link('A', 'C', '新边'))
    expect(r.ok).toBe(true)
    expect(doc.chartData.value.links).toHaveLength(3)
    expect(doc.historyList.value).toHaveLength(1)
    expect(changes).toEqual([{ dirty: true }])
  })

  it('拒绝：端点对无向判重，正反序都算重复', () => {
    const { doc, changes } = makeLoadedDoc()
    expect(doc.createEdge(link('A', 'B', 'x')).ok).toBe(false)
    expect(doc.createEdge(link('B', 'A', 'x')).ok).toBe(false)
    expect(doc.chartData.value.links).toHaveLength(2)
    expect(changes).toEqual([])
  })
})

describe('changeNode：侧栏节点表单提交', () => {
  it('改名：节点替换、邻边端点同步改写、进历史、通知', () => {
    const { doc, changes } = makeLoadedDoc()
    const r = doc.changeNode(0, node('A2', 'c1', { des: '新描述' }))
    expect(r.ok).toBe(true)
    expect(doc.chartData.value.nodes[0]).toEqual(node('A2', 'c1', { des: '新描述' }))
    expect(doc.chartData.value.links.map((l) => `${l.source}-${l.target}`)).toEqual(['A2-B', 'B-C'])
    expect(doc.historyList.value).toHaveLength(1)
    expect(changes).toEqual([{ dirty: true }])
  })

  it('改名撞名：返回错误，节点与边完全不动、无历史、无通知', () => {
    const { doc, changes } = makeLoadedDoc()
    const r = doc.changeNode(0, node('B'))
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
    expect(doc.chartData.value.nodes[0].name).toBe('A')
    expect(doc.chartData.value.links[0].source).toBe('A')
    expect(doc.historyList.value).toHaveLength(0)
    expect(changes).toEqual([])
  })

  it('仅改描述（名不变）：直接成功（无重名校验）', () => {
    const { doc } = makeLoadedDoc()
    const r = doc.changeNode(0, node('A', 'c1', { des: '只改描述' }))
    expect(r.ok).toBe(true)
    expect(doc.chartData.value.nodes[0].des).toBe('只改描述')
    expect(doc.chartData.value.links[0].source).toBe('A')
  })

  it('历史快照与 chartData 脱钩（撤销按快照还原，不受后续改动影响）', () => {
    const { doc } = makeLoadedDoc()
    doc.changeNode(0, node('A2'))
    // 改完再动 chartData 同一位置，undo 仍按提交时快照还原
    doc.changeNode(0, node('A3'))
    doc.undo()
    expect(doc.chartData.value.nodes[0].name).toBe('A2')
  })
})

describe('changeEdge：侧栏边表单提交', () => {
  it('按索引替换边并进历史', () => {
    const { doc, changes } = makeLoadedDoc()
    const r = doc.changeEdge(0, link('A', 'B', '改名'))
    expect(r.ok).toBe(true)
    expect(doc.chartData.value.links[0].name).toBe('改名')
    expect(doc.historyList.value).toHaveLength(1)
    expect(changes).toEqual([{ dirty: true }])
  })
})

describe('deleteNodeAt / deleteEdgeAt', () => {
  it('删点连带删邻边，进历史', () => {
    const { doc, changes } = makeLoadedDoc()
    expect(doc.deleteNodeAt(0)).toBe(true)
    expect(doc.chartData.value.nodes.map((n) => n.name)).toEqual(['B', 'C'])
    expect(doc.chartData.value.links.map((l) => l.name)).toEqual(['e2'])
    expect(doc.historyList.value).toHaveLength(1)
    expect(changes).toEqual([{ dirty: true }])
  })

  it('删边只删目标索引', () => {
    const { doc } = makeLoadedDoc()
    expect(doc.deleteEdgeAt(0)).toBe(true)
    expect(doc.chartData.value.links.map((l) => l.name)).toEqual(['e2'])
  })

  it('索引 -1 守卫：无操作、无历史、无通知、返回 false', () => {
    const { doc, changes } = makeLoadedDoc()
    expect(doc.deleteNodeAt(-1)).toBe(false)
    expect(doc.deleteEdgeAt(-1)).toBe(false)
    expect(doc.historyList.value).toHaveLength(0)
    expect(changes).toEqual([])
  })
})

describe('deleteSelection：框选批量删除', () => {
  it('整批一条历史：被选节点 + 直选边 + 删点连带边，返回计数', () => {
    const { doc, changes } = makeLoadedDoc()
    const r = doc.deleteSelection(['A', 'B'], [1]) // 删 A、B 两点 + 直选 e2
    expect(r).toEqual({ nodes: 2, links: 2 })
    expect(doc.chartData.value.nodes.map((n) => n.name)).toEqual(['C'])
    expect(doc.chartData.value.links).toEqual([])
    expect(doc.historyList.value).toHaveLength(1)
    expect(changes).toEqual([{ dirty: true }])
  })

  it('空选集返回 null：数据不动、无通知', () => {
    const { doc, changes } = makeLoadedDoc()
    expect(doc.deleteSelection([], [])).toBe(null)
    expect(changes).toEqual([])
  })

  it('撤销一步恢复整批（节点 + 直选边 + 连带边）', () => {
    const { doc } = makeLoadedDoc()
    doc.deleteSelection(['A', 'B'], [1])
    doc.undo()
    expect(doc.chartData.value.nodes.map((n) => n.name).sort()).toEqual(['A', 'B', 'C'])
    expect(doc.chartData.value.links.map((l) => l.name).sort()).toEqual(['e1', 'e2'])
  })

  it('重做一步再删整批（redo 经 reactive 代理对账闭包 raw——toRaw 归一回归位）', () => {
    const { doc } = makeLoadedDoc()
    doc.deleteSelection(['A', 'B'], [1])
    doc.undo()
    doc.redo()
    expect(doc.chartData.value.nodes.map((n) => n.name)).toEqual(['C'])
    expect(doc.chartData.value.links).toEqual([])
  })
})

describe('paste / importOutline：合并批次', () => {
  it('同名节点跳过并合并，边按无向端点对去重；返回实际入图的批次', () => {
    const { doc, changes } = makeLoadedDoc()
    const r = doc.paste(
      [node('A', '别的类目'), node('D')],
      [link('A', 'D', '新边'), link('A', 'B', '与 e1 同端点对')]
    )
    expect(r.nodes.map((n) => n.name)).toEqual(['D'])
    expect(r.links.map((l) => l.name)).toEqual(['新边'])
    expect(r.skippedCount).toBe(1)
    expect(doc.chartData.value.nodes).toHaveLength(4)
    expect(doc.chartData.value.links).toHaveLength(3)
    expect(doc.historyList.value).toHaveLength(1)
    expect(changes).toEqual([{ dirty: true }])
  })

  it('入图对象与来源脱钩（粘贴后改来源不影响图）', () => {
    const { doc } = makeLoadedDoc()
    const src = [node('D')]
    doc.paste(src, [])
    src[0].name = 'changed'
    expect(doc.chartData.value.nodes[3].name).toBe('D')
  })

  it('空批次：数据不动、无历史、无通知；paste 返回空批、importOutline 返回 false', () => {
    const { doc, changes } = makeLoadedDoc()
    const r = doc.paste([node('A')], [])
    expect(r.nodes).toHaveLength(0)
    expect(r.links).toHaveLength(0)
    expect(doc.importOutline([node('A')], [])).toBe(false)
    expect(doc.chartData.value.nodes).toHaveLength(3)
    expect(doc.historyList.value).toHaveLength(0)
    expect(changes).toEqual([])
  })

  it('importOutline 成功返回 true 并可一步撤销整批', () => {
    const { doc } = makeLoadedDoc()
    expect(doc.importOutline([node('D'), node('E')], [link('D', 'E', 'de')])).toBe(true)
    expect(doc.chartData.value.nodes).toHaveLength(5)
    doc.undo()
    expect(doc.chartData.value.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C'])
    expect(doc.chartData.value.links.map((l) => l.name)).toEqual(['e1', 'e2'])
  })
})

describe('undo / redo：历史栈不变量', () => {
  it('建点 → 撤销消失（置脏通知）→ 重做回来', () => {
    const { doc, changes } = makeLoadedDoc()
    doc.createNode(node('D'))
    changes.length = 0
    expect(doc.undo()).toBe(true)
    expect(doc.chartData.value.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C'])
    expect(changes).toEqual([{ dirty: true }])
    expect(doc.redo()).toBe(true)
    expect(doc.chartData.value.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('undo 后做新操作截断其后的 redo 分支（不截断会重放过期记录）', () => {
    const { doc } = makeLoadedDoc()
    doc.createNode(node('D'))
    doc.createNode(node('E'))
    doc.undo() // 撤销 E
    doc.createNode(node('F')) // 截断 [D,E] → [D,F]
    doc.undo()
    doc.undo() // 撤销 F、D
    expect(doc.chartData.value.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C'])
    doc.redo() // 重放 D
    doc.redo() // 重放 F（E 已被截断）
    expect(doc.chartData.value.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C', 'D', 'F'])
    expect(doc.redo()).toBe(false) // 栈顶之外无操作
  })

  it('空栈 / 栈顶守卫：undo/redo 返回 false 且不通知', () => {
    const { doc, changes } = makeLoadedDoc()
    expect(doc.undo()).toBe(false)
    expect(doc.redo()).toBe(false)
    expect(changes).toEqual([])
  })
})

describe('setDescription：图表元数据', () => {
  it('写 chartData.description：不进历史、不触发结构性通知', () => {
    const { doc, changes } = makeLoadedDoc()
    doc.setDescription('图谱简介')
    expect(doc.chartData.value.description).toBe('图谱简介')
    expect(doc.historyList.value).toHaveLength(0)
    expect(changes).toEqual([])
  })
})
