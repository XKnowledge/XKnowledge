import { describe, it, expect } from 'vitest'
import {
  superNodeVal,
  buildSuperGraph,
  labelCommunities,
  searchWorldNodes,
  createWorldState,
  applyExpansion,
  applyCollapse,
  worldScene
} from '../../src/renderer/src/utils/worldGraph'

const g = (id, title) => ({ id, title, source: 'example', nodeCount: 3, linkCount: 2, mtimeMs: 0 })
const chartOf = (...names) => ({
  version: 2,
  nodes: names.map((name) => ({ name, des: `d-${name}`, symbolSize: 50, category: 'c' })),
  links: names.length > 1 ? [{ source: names[0], target: names[1], name: 'r', des: '' }] : []
})

describe('superNodeVal', () => {
  it('nodeCount 语义对齐 symbolSize 立方缩放；空图下限 10 防不可见', () => {
    expect(superNodeVal(50)).toBeCloseTo(50 ** 3 / 2500)
    expect(superNodeVal(0)).toBe(10 ** 3 / 2500)
    expect(superNodeVal(undefined)).toBe(10 ** 3 / 2500)
  })
})

describe('buildSuperGraph', () => {
  it('两两缝合：k 图同名组产出 C(k,2) 条；同对多名字聚合 weight/sharedNames', () => {
    const graphs = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s) => g(s, s))
    const stitches = [
      { name: '大概念', graphIds: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }, // C(7,2)=21 条
      { name: '甲', graphIds: ['A', 'B'] },
      { name: '乙', graphIds: ['A', 'B'] }
    ]
    const { nodes, links } = buildSuperGraph(graphs, stitches)
    expect(nodes).toHaveLength(7)
    expect(nodes.every((n) => n.__kind === 'graph')).toBe(true)
    expect(links).toHaveLength(21) // 21 对各一条（A-B 聚合了 3 个名字仍是 1 条）
    const ab = links.find((l) => l.source === 'A' && l.target === 'B')
    expect(ab.weight).toBe(3)
    // JS 默认 sort 按码点：乙(U+4E59) < 大(U+5927) < 甲(U+7532)
    expect(ab.sharedNames.sort()).toEqual(['乙', '大概念', '甲'])
  })

  it('无缝合：links 为空数组', () => {
    expect(buildSuperGraph([g('A', 'A')], []).links).toEqual([])
  })
})

describe('labelCommunities', () => {
  it('两团结构聚成两个社区，社区编号自 0 连续', () => {
    const nodes = [g('A', 'A'), g('B', 'B'), g('C', 'C'), g('D', 'D')]
    const links = [
      { source: 'A', target: 'B', weight: 3, sharedNames: ['x'] },
      { source: 'B', target: 'C', weight: 3, sharedNames: ['x'] }
    ]
    const labeled = labelCommunities(nodes, links)
    const comm = new Map(labeled.map((n) => [n.id, n.community]))
    expect(comm.get('A')).toBe(comm.get('B'))
    expect(comm.get('B')).toBe(comm.get('C'))
    expect(comm.get('D')).not.toBe(comm.get('A'))
    const ids = [...new Set(labeled.map((n) => n.community))].sort((a, b) => a - b)
    expect(ids).toEqual([0, 1])
  })

  it('确定性：同输入重复调用结果相同；全断图每点自成一社区', () => {
    const nodes = [g('A', 'A'), g('B', 'B'), g('C', 'C')]
    const links = [{ source: 'A', target: 'B', weight: 1, sharedNames: ['x'] }]
    const r1 = labelCommunities(nodes, links)
    const r2 = labelCommunities(nodes, links)
    expect(r1).toEqual(r2)
    const isolated = labelCommunities(nodes, [])
    expect(new Set(isolated.map((n) => n.community)).size).toBe(3)
  })
})

describe('searchWorldNodes', () => {
  const nodes = [
    { graphId: 'A', name: '化学', des: '一门科学', category: 'c' },
    { graphId: 'B', name: '化工', des: 'Engineering 工程学', category: 'c' }
  ]
  const graphsById = new Map([
    ['A', { id: 'A', title: '化学图谱' }],
    ['B', { id: 'B', title: '工业图谱' }]
  ])

  it('name/des 大小写不敏感子串；附带图名；空关键词返回 []', () => {
    expect(searchWorldNodes(nodes, graphsById, '化')).toHaveLength(2)
    expect(searchWorldNodes(nodes, graphsById, '科学')[0]).toMatchObject({
      graphTitle: '化学图谱',
      name: '化学'
    })
    expect(searchWorldNodes(nodes, graphsById, 'ENGINEER')).toHaveLength(1)
    expect(searchWorldNodes(nodes, graphsById, '  ')).toEqual([])
  })
})

describe('世界状态：展开/收拢/场景', () => {
  const graphs = [g('A', '图甲'), g('B', '图乙')]
  const stitches = [{ name: '卢梭', graphIds: ['A', 'B'] }]

  it('展开灌入节点 id 前缀化 + 幂等守卫 + 不改原 state', () => {
    const state = createWorldState(graphs, stitches)
    const next = applyExpansion(state, 'A', chartOf('甲一', '甲二', '卢梭'), { x: 1, y: 2, z: 3 })
    expect(next.graphNodes.map((n) => n.id)).toEqual(['A|甲一', 'A|甲二', 'A|卢梭'])
    expect(next.graphLinks[0]).toMatchObject({ source: 'A|甲一', target: 'A|甲二', graphId: 'A' })
    expect(next.expanded['A']).toEqual({ anchor: { x: 1, y: 2, z: 3 } })
    expect(applyExpansion(next, 'A', chartOf('x'), { x: 0, y: 0, z: 0 })).toBe(next) // 幂等
    expect(state.graphNodes).toHaveLength(0) // 原 state 未被修改
  })

  it('收拢清理该域节点/边；往返后与初态等价', () => {
    const state = createWorldState(graphs, stitches)
    const expanded = applyExpansion(state, 'A', chartOf('甲一'), { x: 0, y: 0, z: 0 })
    const collapsed = applyCollapse(expanded, 'A')
    expect(collapsed.graphNodes).toHaveLength(0)
    expect(collapsed.graphLinks).toHaveLength(0)
    expect(collapsed.expanded).toEqual({})
    expect(collapsed.superNodes).toEqual(state.superNodes)
  })

  it('缝合边三态：收拢聚合 → 单端脐带 → 双端节点对', () => {
    const state0 = createWorldState(graphs, stitches)
    let scene = worldScene(state0)
    expect(scene.links).toEqual([{ source: 'A', target: 'B', __kind: 'stitch', weight: 1 }])

    const stateA = applyExpansion(state0, 'A', chartOf('卢梭'), { x: 0, y: 0, z: 0 })
    scene = worldScene(stateA)
    expect(scene.links).toEqual([{ source: 'A|卢梭', target: 'B', __kind: 'stitch', name: '卢梭' }])

    const stateAB = applyExpansion(stateA, 'B', chartOf('卢梭'), { x: 9, y: 9, z: 9 })
    scene = worldScene(stateAB)
    expect(scene.links).toEqual([
      { source: 'A|卢梭', target: 'B|卢梭', __kind: 'stitch', name: '卢梭' }
    ])
  })

  it('场景隐藏已展开超节点；真实图内边保留；悬空缝合端点跳过', () => {
    const state = applyExpansion(createWorldState(graphs, stitches), 'A', chartOf('卢梭'), {
      x: 0,
      y: 0,
      z: 0
    })
    const scene = worldScene(state)
    expect(scene.nodes.some((n) => n.id === 'A')).toBe(false)
    expect(scene.nodes.some((n) => n.id === 'B')).toBe(true)
    // 图内边（chartOf 单节点无边，改双节点验证保留）
    const state2 = applyExpansion(
      createWorldState(graphs, stitches),
      'A',
      chartOf('甲一', '甲二'),
      {
        x: 0,
        y: 0,
        z: 0
      }
    )
    expect(worldScene(state2).links.some((l) => l.__kind !== 'stitch')).toBe(true)
  })
})
