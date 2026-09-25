import { describe, it, expect } from 'vitest'
import {
  superNodeVal,
  buildSuperGraph,
  searchWorldNodes,
  createWorldState,
  applyExpansion,
  applyCollapse,
  worldScene,
  worldFocusNeighborhood,
  defaultFocusNodeId
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

describe('worldFocusNeighborhood：全场景 id 版 BFS', () => {
  // A、C 收拢超节点；B 已展开为 B|n1/B|n2。三种边全覆盖：
  // 收拢缝合(A—C)、脐带(A—B|n1)、域内真实边(B|n1—B|n2)
  const scene = {
    nodes: [
      { id: 'A', __kind: 'graph' },
      { id: 'C', __kind: 'graph' },
      { id: 'B|n1', __kind: 'node' },
      { id: 'B|n2', __kind: 'node' }
    ],
    links: [
      { source: 'A', target: 'C', __kind: 'stitch' },
      { source: 'A', target: 'B|n1', __kind: 'stitch' },
      { source: 'B|n1', target: 'B|n2', __kind: 'link' }
    ]
  }

  it('1 跳：缝合边与脐带边混合扩展，含焦点自身', () => {
    expect([...worldFocusNeighborhood(scene, 'A', 1)].sort()).toEqual(['A', 'B|n1', 'C'])
  })

  it('2 跳：继续沿域内真实边扩展', () => {
    expect([...worldFocusNeighborhood(scene, 'A', 2)].sort()).toEqual(['A', 'B|n1', 'B|n2', 'C'])
  })

  it('0 跳只有焦点自身；焦点不在场景返回空集', () => {
    expect([...worldFocusNeighborhood(scene, 'A', 0)]).toEqual(['A'])
    expect(worldFocusNeighborhood(scene, 'X', 2).size).toBe(0)
  })

  it('不连通的孤立域不越界混入', () => {
    const withIsland = {
      nodes: [...scene.nodes, { id: 'D', __kind: 'graph' }],
      links: scene.links
    }
    expect([...worldFocusNeighborhood(withIsland, 'A', 3)].sort()).toEqual([
      'A',
      'B|n1',
      'B|n2',
      'C'
    ])
  })

  it('边端点为已解析节点对象（d3 灌库后）也按 id 识别', () => {
    const resolved = {
      nodes: scene.nodes,
      links: [
        { source: { id: 'A' }, target: { id: 'C' }, __kind: 'stitch' },
        { source: { id: 'A' }, target: { id: 'B|n1' }, __kind: 'stitch' },
        { source: { id: 'B|n1' }, target: { id: 'B|n2' }, __kind: 'link' }
      ]
    }
    expect([...worldFocusNeighborhood(resolved, 'A', 1)].sort()).toEqual(['A', 'B|n1', 'C'])
  })
})

describe('defaultFocusNodeId', () => {
  const nodes = [
    { id: 'A', __kind: 'graph', nodeCount: 10 },
    { id: 'B', __kind: 'graph', nodeCount: 99 },
    { id: 'C|n', __kind: 'node', symbolSize: 50 }
  ]

  it('度数最高优先', () => {
    const links = [
      { source: 'A', target: 'C|n' },
      { source: 'A', target: 'B' }
    ]
    expect(defaultFocusNodeId(nodes, links)).toBe('A')
  })

  it('同度数比体量：超节点 nodeCount / 真实节点 symbolSize', () => {
    expect(defaultFocusNodeId(nodes, [{ source: 'A', target: 'B' }])).toBe('B')
  })

  it('空场景返回空串', () => {
    expect(defaultFocusNodeId([], [])).toBe('')
  })
})
