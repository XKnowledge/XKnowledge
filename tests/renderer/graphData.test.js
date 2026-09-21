import { describe, it, expect } from 'vitest'
import {
  mergeGraphNodes,
  linkEnd,
  planHighlightRepaint,
  labelThreshold,
  defaultFocusNode,
  focusNeighborhood,
  HL_COLOR,
  LINK_BASE_COLOR,
  FOCUS_DIM_COLOR
} from '../../src/renderer/src/utils/graphData'

describe('mergeGraphNodes：编辑刷新时合并旧坐标', () => {
  const newNodes = [
    { name: 'A', des: 'a', symbolSize: 50, category: 'x' },
    { name: 'B', des: 'b', symbolSize: 40, category: 'y' },
    { name: 'C', des: 'c', symbolSize: 30, category: 'x' }
  ]

  it('同名节点保留旧图坐标，新节点不带坐标', () => {
    const oldNodes = [
      { name: 'A', x: 1, y: 2, z: 3 },
      { name: 'B', x: 4, y: 5, z: 6 }
    ]
    const merged = mergeGraphNodes(newNodes, oldNodes)
    expect(merged[0]).toMatchObject({ name: 'A', __idx: 0, x: 1, y: 2, z: 3 })
    expect(merged[1]).toMatchObject({ name: 'B', __idx: 1, x: 4, y: 5, z: 6 })
    // C 是新节点：不应有 d3 坐标字段，交给库初始化布局
    expect(merged[2]).toEqual({ name: 'C', des: 'c', symbolSize: 30, category: 'x', __idx: 2 })
  })

  it('旧节点带固定坐标（fx/fy/fz，拖拽钉住）时一并保留', () => {
    const merged = mergeGraphNodes(newNodes, [{ name: 'A', x: 1, y: 2, z: 3, fx: 9, fy: 8, fz: 7 }])
    expect(merged[0]).toMatchObject({ fx: 9, fy: 8, fz: 7 })
    // 未钉住的节点不应被添上 fx/fy/fz（会把节点错误地钉死在原点）
    expect(merged[0].fx).toBe(9)
    expect('fx' in merged[1]).toBe(false)
  })

  it('旧节点集合为空/未初始化时全部按新节点处理', () => {
    const merged = mergeGraphNodes(newNodes, [])
    expect(merged.map((n) => n.__idx)).toEqual([0, 1, 2])
    expect(merged.every((n) => !('x' in n))).toBe(true)
    expect(mergeGraphNodes(newNodes, null)).toHaveLength(3)
  })

  it('旧集合有重名节点时与 find 语义一致：取第一个匹配', () => {
    const merged = mergeGraphNodes(
      [{ name: 'A' }],
      [
        { name: 'A', x: 1, y: 1, z: 1 },
        { name: 'A', x: 9, y: 9, z: 9 }
      ]
    )
    expect(merged[0]).toMatchObject({ x: 1, y: 1, z: 1 })
  })

  it('不修改入参（新数组与旧数组都保持原样）', () => {
    const newIn = [{ name: 'A' }]
    const oldIn = [{ name: 'A', x: 1, y: 2, z: 3 }]
    mergeGraphNodes(newIn, oldIn)
    expect(newIn[0]).toEqual({ name: 'A' })
    expect(oldIn[0]).toEqual({ name: 'A', x: 1, y: 2, z: 3 })
  })
})

describe('linkEnd：d3 反解对象归一化回名字', () => {
  it('对象取 name，字符串透传', () => {
    expect(linkEnd({ name: 'A', x: 1 })).toBe('A')
    expect(linkEnd('A')).toBe('A')
  })
})

describe('labelThreshold：小节点标签开关的显示阈值', () => {
  // 按尺寸列表生成节点（尺寸在真实示例里就是这样的分层：70/50/40）
  const bySizes = (sizes) => sizes.map((s, i) => ({ name: `n${i}`, symbolSize: s }))

  it('开关打开时返回 -Infinity，所有节点都显示名称', () => {
    expect(labelThreshold(bySizes([70, 50, 40]), true)).toBe(-Infinity)
  })

  it('阈值取升序 60% 分位处的值：最小的 60% 节点算小节点（中国通史形态 → 50）', () => {
    const nodes = bySizes([...Array(6).fill(70), ...Array(36).fill(50), ...Array(50).fill(40)])
    expect(labelThreshold(nodes, false)).toBe(50)
  })

  it('分位值落在最小尺寸层时上提一档（人工智能形态 → 50），保证开关有效', () => {
    // 最小层 40 占 75%：分位值取到 40（=最小值），没有节点小于它，
    // 不上提的话取消勾选一个标签都藏不掉（开关失效）
    const nodes = bySizes([...Array(4).fill(70), ...Array(20).fill(50), ...Array(75).fill(40)])
    expect(labelThreshold(nodes, false)).toBe(50)
  })

  it('小图同样按 60% 分位切，不再有「不足 30 个全显」的例外', () => {
    // 升序 [40,50,60,70,80]，60% 分位取第 3 个（60），40/50 被隐藏
    expect(labelThreshold(bySizes([80, 40, 70, 50, 60]), false)).toBe(60)
  })

  it('全图同一尺寸时没有小节点可隐藏，阈值停在原值', () => {
    expect(labelThreshold(bySizes(Array(60).fill(50)), false)).toBe(50)
  })

  it('空节点集合返回 undefined（比较恒为 false，全显）', () => {
    expect(labelThreshold([], false)).toBeUndefined()
  })

  it('大图（>2000 节点）按预算封顶：开关关时取头部 600 个的尺寸层', () => {
    // 1400 个 40 + 601 个 50：降序第 600 个落在 50 层 → 阈值 50，头部整层保留
    const nodes = bySizes([...Array(1400).fill(40), ...Array(601).fill(50)])
    expect(labelThreshold(nodes, false)).toBe(50)
  })

  it('大图开关打开时预算放宽到 1200，不再全显（防万级 canvas 纹理卡死）', () => {
    const nodes = bySizes([...Array(1400).fill(40), ...Array(601).fill(50)])
    // 降序第 1200 个落在 40 层 → 阈值 40
    expect(labelThreshold(nodes, true)).toBe(40)
  })

  it('恰好 2000 节点不算大图，仍走分位逻辑', () => {
    const nodes = bySizes([...Array(1000).fill(50), ...Array(1000).fill(40)])
    expect(labelThreshold(nodes, true)).toBe(-Infinity)
    expect(labelThreshold(nodes, false)).toBe(50)
  })

  it('不修改入参顺序', () => {
    const nodes = bySizes([40, 70, 50])
    labelThreshold(nodes, false)
    expect(nodes.map((n) => n.symbolSize)).toEqual([40, 70, 50])
  })
})

describe('planHighlightRepaint：高亮变化的增量重着色计划', () => {
  const nodes = [
    { name: 'A', category: 'x', __threeObj: { material: { color: { set: () => {} } } } },
    { name: 'B', category: 'y', __threeObj: { material: { color: { set: () => {} } } } },
    { name: 'C', category: 'x', __threeObj: { material: { color: { set: () => {} } } } }
  ]
  const links = [
    { source: 'A', target: 'B', name: 'e1' },
    { source: { name: 'B' }, target: 'C', name: 'e2' } // d3 反解后的形态也要能匹配
  ]

  it('新增高亮节点：该节点重着色为高亮色', () => {
    const { nodeRepaints, linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: [],
      prevLink: null,
      nextNodes: ['A'],
      nextLink: null
    })
    expect(nodeRepaints).toEqual([[nodes[0], HL_COLOR]])
    expect(linkRepaints).toEqual([])
  })

  it('取消高亮节点：该节点还原为类目底色', async () => {
    const { assignCategoryColors } = await import('../../src/renderer/src/utils/categoryColor.js')
    const categoryColors = assignCategoryColors(['x', 'y'])
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: ['A'],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      categoryColors
    })
    expect(nodeRepaints).toEqual([[nodes[0], categoryColors.get('x')]])
  })

  it('高亮集合不变时不产生任何重着色', () => {
    const { nodeRepaints, linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: ['A'],
      prevLink: { source: 'A', target: 'B', name: 'e1' },
      nextNodes: ['A'],
      nextLink: { source: 'A', target: 'B', name: 'e1' }
    })
    expect(nodeRepaints).toEqual([])
    expect(linkRepaints).toEqual([])
  })

  it('换高亮边：旧边还原底色、新边着高亮色（d3 反解对象形态也能匹配）', () => {
    const { linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: [],
      prevLink: { source: 'A', target: 'B', name: 'e1' },
      nextNodes: [],
      nextLink: { source: 'B', target: 'C', name: 'e2' }
    })
    expect(linkRepaints).toEqual([
      [links[0], LINK_BASE_COLOR],
      [links[1], HL_COLOR]
    ])
  })

  it('取消高亮边：还原底色', () => {
    const { linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: [],
      prevLink: { source: 'A', target: 'B', name: 'e1' },
      nextNodes: [],
      nextLink: null
    })
    expect(linkRepaints).toEqual([[links[0], LINK_BASE_COLOR]])
  })

  it('图数据为空时安全返回空计划', () => {
    const plan = planHighlightRepaint({
      nodes: [],
      links: [],
      prevNodes: null,
      prevLink: null,
      nextNodes: ['A'],
      nextLink: null
    })
    expect(plan).toEqual({ nodeRepaints: [], linkRepaints: [] })
  })
})

describe('defaultFocusNode：默认焦点三级规则', () => {
  const nodes = [
    { name: 'A', symbolSize: 50 },
    { name: 'B', symbolSize: 70 },
    { name: 'C', symbolSize: 40 },
    { name: 'D', symbolSize: 40 }
  ]
  it('度数最高者优先（A 3 条边胜出）', () => {
    const links = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'C' },
      { source: 'A', target: 'D' },
      { source: 'B', target: 'C' }
    ]
    expect(defaultFocusNode(nodes, links)).toBe('A')
  })
  it('度数并列取 symbolSize 大的（B、C 各 1 条边，B 70 > C 40）', () => {
    expect(defaultFocusNode(nodes, [{ source: 'B', target: 'C' }])).toBe('B')
  })
  it('再并列取先出现者（C、D 同度数同尺寸，C 在前）', () => {
    expect(defaultFocusNode(nodes, [{ source: 'C', target: 'D' }])).toBe('C')
  })
  it('全孤点图取第一个（度数全 0、尺寸并列时顺序兜底）', () => {
    expect(defaultFocusNode([{ name: 'X' }, { name: 'Y' }], [])).toBe('X')
  })
  it('自环计入度数', () => {
    expect(defaultFocusNode(nodes, [{ source: 'A', target: 'A' }, { source: 'B', target: 'C' }])).toBe('A')
  })
  it('空图返回空串', () => {
    expect(defaultFocusNode([], [])).toBe('')
  })
})

describe('focusNeighborhood：N 跳邻域 BFS', () => {
  // 链形 A-B-C-D（含环 A-B-C-A）+ 孤岛 E-F
  const nodes = ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => ({ name: n }))
  const links = [
    { source: 'A', target: 'B' },
    { source: 'B', target: 'C' },
    { source: 'C', target: 'D' },
    { source: 'E', target: 'F' },
    { source: 'A', target: 'C' }
  ]
  it('2 跳：环（A-C 直连）缩短直径，D 经 A→C→D 也在 2 跳内', () => {
    expect(focusNeighborhood(nodes, links, 'A', 2)).toEqual(new Set(['A', 'B', 'C', 'D']))
  })
  it('1 跳只含直接邻居', () => {
    expect(focusNeighborhood(nodes, links, 'B', 1)).toEqual(new Set(['A', 'B', 'C']))
  })
  it('3 跳沿链走满，孤岛 E/F 永不进', () => {
    expect(focusNeighborhood(nodes, links, 'A', 3)).toEqual(new Set(['A', 'B', 'C', 'D']))
  })
  it('环不导致重复计数或死循环', () => {
    expect(focusNeighborhood(nodes, links, 'C', 2)).toEqual(new Set(['A', 'B', 'C', 'D']))
  })
  it('自环边不重复入队', () => {
    expect(focusNeighborhood([{ name: 'A' }], [{ source: 'A', target: 'A' }], 'A', 2)).toEqual(
      new Set(['A'])
    )
  })
  it('d3 反解对象形态的端点也能走（linkEnd 归一）', () => {
    expect(
      focusNeighborhood(nodes, [{ source: { name: 'A' }, target: { name: 'B' } }], 'A', 1)
    ).toEqual(new Set(['A', 'B']))
  })
  it('焦点不在图中返回空集合（调用方以空集表达「无聚焦」）', () => {
    expect(focusNeighborhood(nodes, links, 'NOPE', 2)).toEqual(new Set())
  })
  it('hops 超出图直径时返回整个连通分量', () => {
    expect(focusNeighborhood(nodes, links, 'A', 99)).toEqual(new Set(['A', 'B', 'C', 'D']))
  })
})

describe('planHighlightRepaint：聚焦灰化的组合色增量计划', () => {
  const nodes = [
    { name: 'A', category: 'x' },
    { name: 'B', category: 'y' },
    { name: 'C', category: 'x' }
  ]
  it('开启聚焦：邻域外节点进计划、着灰', () => {
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevDimNodes: null,
      nextDimNodes: new Set(['A', 'B'])
    })
    expect(nodeRepaints).toEqual([[nodes[2], FOCUS_DIM_COLOR]])
  })
  it('关闭聚焦：灰化节点还原类目色', async () => {
    const { assignCategoryColors } = await import('../../src/renderer/src/utils/categoryColor.js')
    const categoryColors = assignCategoryColors(['x', 'y'])
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevDimNodes: new Set(['A']),
      nextDimNodes: null,
      categoryColors
    })
    expect(nodeRepaints).toEqual([
      [nodes[1], categoryColors.get('y')],
      [nodes[2], categoryColors.get('x')]
    ])
  })
  it('高亮优先于灰化：邻域外但被选中的节点仍着高亮色', () => {
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: ['C'],
      nextLink: null,
      prevDimNodes: null,
      nextDimNodes: new Set(['A'])
    })
    expect(nodeRepaints).toEqual([
      [nodes[1], FOCUS_DIM_COLOR],
      [nodes[2], HL_COLOR]
    ])
  })
  it('换焦点：A 退出邻域（类目色→灰）、C 进入邻域（灰→类目色）', async () => {
    const { assignCategoryColors } = await import('../../src/renderer/src/utils/categoryColor.js')
    const categoryColors = assignCategoryColors(['x', 'y'])
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevDimNodes: new Set(['A', 'B']),
      nextDimNodes: new Set(['B', 'C']),
      categoryColors
    })
    expect(nodeRepaints).toEqual([
      [nodes[0], FOCUS_DIM_COLOR],
      [nodes[2], categoryColors.get('x')]
    ])
  })
  it('状态完全不变时无重着色', () => {
    const plan = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevDimNodes: new Set(['A']),
      nextDimNodes: new Set(['A'])
    })
    expect(plan.nodeRepaints).toEqual([])
  })
  it('边灰化：任一端不在邻域即着灰，邻域内边保持底色', () => {
    const links = [
      { source: 'A', target: 'B', name: 'e1' }, // 两端都在邻域
      { source: 'B', target: 'C', name: 'e2' } // C 不在
    ]
    const { linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevDimNodes: null,
      nextDimNodes: new Set(['A', 'B'])
    })
    expect(linkRepaints).toEqual([[links[1], FOCUS_DIM_COLOR]])
  })
})
