import { describe, it, expect } from 'vitest'
import {
  syncPlacedNodes,
  syncPlacedLinks,
  planLabelSync,
  linkEnd,
  linkKey,
  planHighlightRepaint,
  reconcileNodeHighlight,
  labelThreshold,
  defaultFocusNode,
  focusNeighborhood,
  searchGraphNodes,
  sameNameSet,
  deepClone,
  emptyNode,
  emptyEdge,
  SCENE_COLORS,
  HL_COLOR,
  LINK_BASE_COLOR,
  FOCUS_DIM_COLOR,
  SEARCH_HIT_COLOR,
  SEARCH_ACTIVE_COLOR
} from '../../src/renderer/src/utils/graphData'

describe('syncPlacedNodes：编辑刷新时按名同步到图实例旧对象（稳定引用）', () => {
  const newNodes = [
    { name: 'A', des: 'a2', symbolSize: 70, category: 'x' },
    { name: 'C', des: 'c', symbolSize: 30, category: 'x' },
    { name: 'B', des: 'b', symbolSize: 40, category: 'z' }
  ]

  it('同名节点复用旧图对象引用——坐标/拖拽锚天然在同一对象上', () => {
    const oldA = { name: 'A', des: 'a', symbolSize: 50, category: 'x', __idx: 0, x: 1, y: 2, z: 3 }
    const oldB = {
      name: 'B',
      des: 'b',
      symbolSize: 40,
      category: 'y',
      __idx: 1,
      x: 4,
      y: 5,
      z: 6,
      fx: 9,
      fy: 8,
      fz: 7
    }
    const merged = syncPlacedNodes(newNodes, [oldA, oldB])
    // 引用相等是本函数的全部意义：库 digest 按对象身份判 update，mesh 复用
    expect(merged[0]).toBe(oldA)
    expect(merged[2]).toBe(oldB)
    expect(merged[0]).toMatchObject({ x: 1, y: 2, z: 3 })
    expect(merged[2]).toMatchObject({ x: 4, y: 5, z: 6, fx: 9, fy: 8, fz: 7 })
  })

  it('业务字段就地同步为 chartData 新值，__idx 按新数组序重算', () => {
    const oldA = { name: 'A', des: 'a', symbolSize: 50, category: 'w', __idx: 5, x: 1 }
    const oldB = { name: 'B', des: 'b', symbolSize: 40, category: 'y', __idx: 0, x: 4 }
    const merged = syncPlacedNodes(newNodes, [oldA, oldB])
    expect(merged[0]).toMatchObject({ des: 'a2', symbolSize: 70, category: 'x', __idx: 0 })
    expect(merged[2]).toMatchObject({ des: 'b', category: 'z', __idx: 2 })
  })

  it('新节点新建对象：浅拷贝业务字段 + __idx，无 d3 坐标字段', () => {
    const merged = syncPlacedNodes(newNodes, [{ name: 'A', des: 'a', x: 1 }])
    expect(merged[1]).toEqual({ name: 'C', des: 'c', symbolSize: 30, category: 'x', __idx: 1 })
    expect('x' in merged[1]).toBe(false)
  })

  it('悬空旧对象（对应节点已删）不进结果数组', () => {
    const merged = syncPlacedNodes(newNodes, [
      { name: 'A', x: 1 },
      { name: 'D', x: 9, y: 9, z: 9 }
    ])
    expect(merged).toHaveLength(3)
    expect(merged.some((n) => n.name === 'D')).toBe(false)
  })

  it('不修改 chartData 源入参（旧集合是图实例私有数据，允许就地更新）', () => {
    const newIn = [{ name: 'A', des: 'a2', symbolSize: 70, category: 'x' }]
    const snapshot = JSON.parse(JSON.stringify(newIn))
    syncPlacedNodes(newIn, [{ name: 'A', des: 'a', symbolSize: 50, category: 'x', __idx: 0, x: 1 }])
    expect(newIn).toEqual(snapshot)
  })

  it('旧集合有重名节点时与 find 语义一致：取第一个匹配', () => {
    const first = { name: 'A', x: 1, y: 1, z: 1 }
    const merged = syncPlacedNodes([{ name: 'A' }], [first, { name: 'A', x: 9, y: 9, z: 9 }])
    expect(merged[0]).toBe(first)
  })

  it('旧集合为空/null 时全部按新节点处理', () => {
    const merged = syncPlacedNodes(newNodes, [])
    expect(merged.map((n) => n.__idx)).toEqual([0, 1, 2])
    expect(merged.every((n) => !('x' in n))).toBe(true)
    expect(syncPlacedNodes(newNodes, null)).toHaveLength(3)
  })
})

describe('syncPlacedLinks：编辑刷新时按三元组键同步到图实例旧边对象（稳定引用）', () => {
  it('同键边复用旧对象引用，source/target 保持已反解的节点对象形态，业务字段就地同步', () => {
    const srcA = { name: 'A', x: 1 }
    const tgtB = { name: 'B', x: 2 }
    const old1 = { source: srcA, target: tgtB, name: 'n1', des: 'd1', __idx: 3 }
    const merged = syncPlacedLinks([{ source: 'A', target: 'B', name: 'n1', des: 'd1x' }], [old1])
    // 引用相等：digest 身份命中 update，边 mesh 复用
    expect(merged[0]).toBe(old1)
    // source/target 不重赋——已反解的节点对象引用保持有效
    expect(merged[0].source).toBe(srcA)
    expect(merged[0].target).toBe(tgtB)
    expect(merged[0].des).toBe('d1x')
    expect(merged[0].__idx).toBe(0)
  })

  it('新边新建对象：字符串端点透传 + __idx（交库反解）', () => {
    const merged = syncPlacedLinks([{ source: 'A', target: 'B', name: 'n2', des: 'd2' }], [])
    expect(merged[0]).toEqual({ source: 'A', target: 'B', name: 'n2', des: 'd2', __idx: 0 })
  })

  it('键变（改端点顺序/改边名）＝ 删旧增新，旧对象不进结果', () => {
    const old1 = { source: { name: 'A' }, target: { name: 'B' }, name: 'n1', __idx: 0 }
    const merged = syncPlacedLinks([{ source: 'B', target: 'A', name: 'n1' }], [old1])
    expect(merged[0]).not.toBe(old1)
    expect(merged[0].source).toBe('B')
  })

  it('悬空旧边（对应数据已删）不进结果', () => {
    const oldGone = { source: { name: 'A' }, target: { name: 'D' }, name: 'nd', __idx: 0 }
    const merged = syncPlacedLinks([{ source: 'A', target: 'B', name: 'n1' }], [oldGone])
    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('n1')
  })

  it('旧集合重键时取第一个匹配（与 linkKey 同键竞争语义一致）', () => {
    const first = { source: 'A', target: 'B', name: 'n1', __idx: 0 }
    const merged = syncPlacedLinks(
      [{ source: 'A', target: 'B', name: 'n1' }],
      [first, { source: { name: 'A' }, target: { name: 'B' }, name: 'n1', __idx: 1 }]
    )
    expect(merged[0]).toBe(first)
  })

  it('不修改 chartData 源入参', () => {
    const newIn = [{ source: 'A', target: 'B', name: 'n1', des: 'x' }]
    const snapshot = JSON.parse(JSON.stringify(newIn))
    syncPlacedLinks(newIn, [{ source: { name: 'A' }, target: { name: 'B' }, name: 'n1', __idx: 0 }])
    expect(newIn).toEqual(snapshot)
  })

  it('旧集合为空/null 时全部新建', () => {
    expect(syncPlacedLinks(null, null)).toEqual([])
    expect(syncPlacedLinks([], null)).toEqual([])
  })
})

describe('planLabelSync：标签集合变化的手动增删决策（按节点序稳定返回引用）', () => {
  const nodes = [
    { name: 'A', symbolSize: 70, __idx: 0 },
    { name: 'B', symbolSize: 40, __idx: 1 },
    { name: 'C', symbolSize: 30, __idx: 2 }
  ]

  it('进集合的返回 adds（成员是节点引用，非名字）', () => {
    const { adds, removes } = planLabelSync(nodes, new Set(['B']), new Set(['B', 'A']))
    expect(adds).toEqual([nodes[0]])
    expect(removes).toEqual([])
  })

  it('跌出集合的返回 removes', () => {
    const { adds, removes } = planLabelSync(nodes, new Set(['A', 'C']), new Set(['A']))
    expect(adds).toEqual([])
    expect(removes).toEqual([nodes[2]])
  })

  it('名字不在图实例节点里的不产生操作——已删节点由 digest exit 连带摘除，新 enter 节点的标签由稳定闭包建', () => {
    const { adds, removes } = planLabelSync(nodes, new Set(['A', 'GONE']), new Set(['A', 'NEW']))
    expect(adds).toEqual([])
    expect(removes).toEqual([])
  })

  it('前后集合一致（含插入序不同）或双空时零操作', () => {
    expect(planLabelSync(nodes, new Set(['A']), new Set(['A']))).toEqual({ adds: [], removes: [] })
    expect(planLabelSync(nodes, new Set(['A', 'B']), new Set(['B', 'A']))).toEqual({
      adds: [],
      removes: []
    })
    expect(planLabelSync(nodes, new Set(), new Set())).toEqual({ adds: [], removes: [] })
  })

  it('空节点数组返回零操作', () => {
    expect(planLabelSync([], new Set(['A']), new Set(['B']))).toEqual({ adds: [], removes: [] })
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

describe('reconcileNodeHighlight：结构性变更后选中高亮名的校准', () => {
  const nodes = [
    { name: 'Alpha', category: 'x' },
    { name: 'Beta', category: 'y' },
    { name: 'Gamma', category: 'x' }
  ]

  it('高亮名仍在图中：原样返回（普通变更不动既有高亮）', () => {
    expect(reconcileNodeHighlight(nodes, 'Beta', 0)).toBe('Beta')
  })

  it('高亮名消失且索引有效：跟随索引指向的新名（改名提交）', () => {
    expect(reconcileNodeHighlight(nodes, 'Old', 1)).toBe('Beta')
  })

  it('高亮名消失且索引无效：清空（删除/撤销路径）', () => {
    expect(reconcileNodeHighlight(nodes, 'Old', -1)).toBe('')
  })

  it('高亮名消失且索引越界：清空（防御）', () => {
    expect(reconcileNodeHighlight(nodes, 'Old', 99)).toBe('')
  })

  it('空高亮名直通（未选中时零开销）', () => {
    expect(reconcileNodeHighlight(nodes, '', 0)).toBe('')
  })
})

describe('planHighlightRepaint：选中高亮与其他状态的组合', () => {
  const nodes = [
    { name: 'A', category: 'x' },
    { name: 'B', category: 'y' },
    { name: 'C', category: 'x' }
  ]

  it('选中与搜索当前项同节点：选中（hl）最高优先', () => {
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      prevNodes: [],
      nextNodes: ['A'],
      prevSearchActive: 'A',
      nextSearchActive: 'A',
      prevSearchNodes: ['A'],
      nextSearchNodes: ['A']
    })
    expect(nodeRepaints).toEqual([[nodes[0], HL_COLOR]])
  })

  it('选中节点不被聚焦灰化压住（邻域外照常灰化）', () => {
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      prevNodes: [],
      nextNodes: ['B'],
      prevDimNodes: null,
      nextDimNodes: new Set(['B'])
    })
    expect(nodeRepaints).toEqual([
      [nodes[0], FOCUS_DIM_COLOR],
      [nodes[1], HL_COLOR],
      [nodes[2], FOCUS_DIM_COLOR]
    ])
  })

  it('换选：旧节点还原类目色、新节点上 hl（与边高亮并存）', async () => {
    const { assignCategoryColors } = await import('../../src/renderer/src/utils/categoryColor.js')
    const categoryColors = assignCategoryColors(['x', 'y'])
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      prevNodes: ['A'],
      nextNodes: ['C'],
      categoryColors
    })
    expect(nodeRepaints).toEqual([
      [nodes[0], categoryColors.get('x')],
      [nodes[2], HL_COLOR]
    ])
  })
})

describe('planHighlightRepaint：框选批量集合（节点名集 + 边三元组键集）', () => {
  const nodes = [
    { name: 'A', category: 'x' },
    { name: 'B', category: 'y' },
    { name: 'C', category: 'x' }
  ]
  const links = [
    { source: 'A', target: 'B', name: 'e1' },
    { source: 'A', target: 'B', name: 'e2' }, // 同端点多重边：靠 name 区分
    { source: { name: 'B' }, target: 'C', name: 'e3' } // d3 反解形态
  ]
  const keyOf = (l) => linkKey(l)

  it('新增批量选中：集合内节点/边上 hl，集合外不动', () => {
    const { nodeRepaints, linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: [],
      prevLinks: [],
      nextNodes: ['A', 'C'],
      nextLinks: [keyOf(links[0]), keyOf(links[2])]
    })
    expect(nodeRepaints).toEqual([
      [nodes[0], HL_COLOR],
      [nodes[2], HL_COLOR]
    ])
    expect(linkRepaints).toEqual([
      [links[0], HL_COLOR],
      [links[2], HL_COLOR]
    ])
  })

  it('多重边只选中键匹配的那条：同端点同名靠 name、同端点异名靠三元组区分', () => {
    const { linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: [],
      prevLinks: [],
      nextNodes: [],
      nextLinks: [keyOf(links[1])] // 只选 e2
    })
    expect(linkRepaints).toEqual([[links[1], HL_COLOR]])
  })

  it('清空框选：集合内全部还原（节点回类目色、边回底色）', async () => {
    const { assignCategoryColors } = await import('../../src/renderer/src/utils/categoryColor.js')
    const categoryColors = assignCategoryColors(['x', 'y'])
    const { nodeRepaints, linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: ['A', 'C'],
      prevLinks: [keyOf(links[0]), keyOf(links[2])],
      nextNodes: [],
      nextLinks: [],
      categoryColors
    })
    expect(nodeRepaints).toEqual([
      [nodes[0], categoryColors.get('x')],
      [nodes[2], categoryColors.get('x')]
    ])
    expect(linkRepaints).toEqual([
      [links[0], LINK_BASE_COLOR],
      [links[2], LINK_BASE_COLOR]
    ])
  })

  it('集合不变时不产生任何重着色（框选后重复 emit 同集合）', () => {
    const plan = planHighlightRepaint({
      nodes,
      links,
      prevNodes: ['A'],
      prevLinks: [keyOf(links[0])],
      nextNodes: ['A'],
      nextLinks: [keyOf(links[0])]
    })
    expect(plan).toEqual({ nodeRepaints: [], linkRepaints: [] })
  })

  it('批量选中边不被聚焦灰化压住（与单选边同优先级）', () => {
    const { linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: [],
      prevLinks: [],
      nextNodes: [],
      nextLinks: [keyOf(links[0])],
      prevDimNodes: null,
      nextDimNodes: new Set(['A'])
    })
    expect(linkRepaints).toEqual([
      [links[0], HL_COLOR],
      [links[1], FOCUS_DIM_COLOR],
      [links[2], FOCUS_DIM_COLOR]
    ])
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
    expect(
      defaultFocusNode(nodes, [
        { source: 'A', target: 'A' },
        { source: 'B', target: 'C' }
      ])
    ).toBe('A')
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

describe('searchGraphNodes：节点名/描述搜索过滤', () => {
  const nodes = [
    { name: '张三', des: '武当掌门', symbolSize: 50, category: '人物' },
    { name: 'Zhang San', des: '拼音转写', symbolSize: 40, category: '人物' },
    { name: '李白', des: '诗人', symbolSize: 70, category: '人物' },
    { name: '唐诗', des: '李白的作品集', symbolSize: 40, category: '作品' }
  ]

  it('名字子串命中（大小写不敏感）', () => {
    expect(searchGraphNodes(nodes, '张三', null).map((n) => n.name)).toEqual(['张三'])
    expect(searchGraphNodes(nodes, 'zhang', null).map((n) => n.name)).toEqual(['Zhang San'])
    expect(searchGraphNodes(nodes, 'ZHANG', null).map((n) => n.name)).toEqual(['Zhang San'])
  })

  it('描述子串同样命中', () => {
    expect(searchGraphNodes(nodes, '诗人', null).map((n) => n.name)).toEqual(['李白'])
  })

  it('命中按 nodes 原始顺序稳定返回', () => {
    expect(searchGraphNodes(nodes, '李白', null).map((n) => n.name)).toEqual(['李白', '唐诗'])
  })

  it('排除隐藏类目的节点', () => {
    expect(searchGraphNodes(nodes, '李白', new Set(['作品'])).map((n) => n.name)).toEqual(['李白'])
    expect(searchGraphNodes(nodes, '张三', new Set(['人物']))).toEqual([])
  })

  it('空关键词（含纯空白）返回空数组', () => {
    expect(searchGraphNodes(nodes, '', null)).toEqual([])
    expect(searchGraphNodes(nodes, '   ', null)).toEqual([])
  })

  it('空图/空匹配返回空数组', () => {
    expect(searchGraphNodes([], 'x', null)).toEqual([])
    expect(searchGraphNodes(nodes, '不存在的关键词', null)).toEqual([])
  })

  it('name/des 缺失的节点不抛错', () => {
    expect(searchGraphNodes([{ name: 'A' }, { des: 'b' }], 'a', null).map((n) => n.name)).toEqual([
      'A'
    ])
  })

  it('不修改入参', () => {
    const inNodes = [{ name: 'A', des: 'a', category: 'x' }]
    searchGraphNodes(inNodes, 'a', new Set())
    expect(inNodes).toEqual([{ name: 'A', des: 'a', category: 'x' }])
  })

  it('搜索色常量已定义（白底与类目/黑/灰拉开距离）', () => {
    expect(SEARCH_HIT_COLOR).toBe('#faad14')
    expect(SEARCH_ACTIVE_COLOR).toBe('#fa541c')
  })
})

describe('planHighlightRepaint：搜索高亮的组合色增量计划', () => {
  const nodes = [
    { name: 'A', category: 'x' },
    { name: 'B', category: 'y' },
    { name: 'C', category: 'x' }
  ]

  it('进入搜索：命中着命中色、当前项着当前项色', () => {
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevSearchNodes: null,
      nextSearchNodes: new Set(['A', 'B']),
      prevSearchActive: null,
      nextSearchActive: 'B'
    })
    expect(nodeRepaints).toEqual([
      [nodes[0], SEARCH_HIT_COLOR],
      [nodes[1], SEARCH_ACTIVE_COLOR]
    ])
  })

  it('当前项切换：旧当前项落回命中色、新当前项着当前项色', () => {
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevSearchNodes: new Set(['A', 'B']),
      nextSearchNodes: new Set(['A', 'B']),
      prevSearchActive: 'B',
      nextSearchActive: 'A'
    })
    expect(nodeRepaints).toEqual([
      [nodes[0], SEARCH_ACTIVE_COLOR],
      [nodes[1], SEARCH_HIT_COLOR]
    ])
  })

  it('退出搜索：命中还原类目色', async () => {
    const { assignCategoryColors } = await import('../../src/renderer/src/utils/categoryColor.js')
    const categoryColors = assignCategoryColors(['x', 'y'])
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevSearchNodes: new Set(['A', 'B']),
      nextSearchNodes: null,
      prevSearchActive: 'A',
      nextSearchActive: null,
      categoryColors
    })
    expect(nodeRepaints).toEqual([
      [nodes[0], categoryColors.get('x')],
      [nodes[1], categoryColors.get('y')]
    ])
  })

  it('点击选中黑优先于搜索色', () => {
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: ['B'],
      nextLink: null,
      prevSearchNodes: null,
      nextSearchNodes: new Set(['A', 'B']),
      prevSearchActive: null,
      nextSearchActive: 'B'
    })
    expect(nodeRepaints).toEqual([
      [nodes[0], SEARCH_HIT_COLOR],
      [nodes[1], HL_COLOR]
    ])
  })

  it('搜索色优先于聚焦灰化（找到了就该看见）', () => {
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevDimNodes: null,
      nextDimNodes: new Set(['A']), // 邻域只有 A：B/C 在灰化区
      prevSearchNodes: null,
      nextSearchNodes: new Set(['B']),
      prevSearchActive: null,
      nextSearchActive: null
    })
    expect(nodeRepaints).toEqual([
      [nodes[1], SEARCH_HIT_COLOR], // B 命中搜索，不被灰化
      [nodes[2], FOCUS_DIM_COLOR] // C 无搜索，照常灰
    ])
  })

  it('搜索状态完全不变时不产生重着色', () => {
    const plan = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevSearchNodes: new Set(['A']),
      nextSearchNodes: new Set(['A']),
      prevSearchActive: 'A',
      nextSearchActive: 'A'
    })
    expect(plan.nodeRepaints).toEqual([])
    expect(plan.linkRepaints).toEqual([])
  })

  it('不传搜索参数时与旧行为完全一致（向后兼容）', () => {
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: ['A'],
      nextLink: null
    })
    expect(nodeRepaints).toEqual([[nodes[0], HL_COLOR]])
  })

  it('边不染搜索色：命中集合变化时边无重着色', () => {
    const links = [{ source: 'A', target: 'B', name: 'e1' }]
    const { linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevSearchNodes: null,
      nextSearchNodes: new Set(['A', 'B'])
    })
    expect(linkRepaints).toEqual([])
  })
})

describe('SCENE_COLORS：双色套场景色表', () => {
  it('浅色套与既有具名常量一致（现状锁定）', () => {
    expect(SCENE_COLORS.light.hl).toBe(HL_COLOR)
    expect(SCENE_COLORS.light.link).toBe(LINK_BASE_COLOR)
    expect(SCENE_COLORS.light.dim).toBe(FOCUS_DIM_COLOR)
    expect(SCENE_COLORS.light.hit).toBe(SEARCH_HIT_COLOR)
    expect(SCENE_COLORS.light.active).toBe(SEARCH_ACTIVE_COLOR)
  })
  it('两套色各自的高亮/边/标签色都不同于背景色（防黑高亮黑底退化）', () => {
    for (const c of [SCENE_COLORS.light, SCENE_COLORS.dark]) {
      expect(c.hl).not.toBe(c.bg)
      expect(c.link).not.toBe(c.bg)
      expect(c.label).not.toBe(c.bg)
    }
  })
  it('深色套：antd 基准底 + 点灯白高亮（与浅色套熄灯黑对称）', () => {
    expect(SCENE_COLORS.dark.bg).toBe('#141414')
    expect(SCENE_COLORS.dark.hl).toBe('#f0f0f0')
    expect(SCENE_COLORS.dark.label).toBe('#e0e0e0')
    expect(SCENE_COLORS.dark.watermark).toBe('#ffffff')
  })
})

describe('planHighlightRepaint：sceneColors 传参', () => {
  it('传深色套时高亮节点/边用深色值', () => {
    const nodes = [{ name: 'A', category: 'x' }]
    const links = [{ source: 'A', target: 'A', name: 'e1' }]
    const { nodeRepaints, linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: [],
      prevLink: null,
      nextNodes: ['A'],
      nextLink: { source: 'A', target: 'A', name: 'e1' },
      sceneColors: SCENE_COLORS.dark
    })
    expect(nodeRepaints).toEqual([[nodes[0], SCENE_COLORS.dark.hl]])
    expect(linkRepaints).toEqual([[links[0], SCENE_COLORS.dark.hl]])
  })
  it('传深色套时灰化/底色用深色值', () => {
    const nodes = [{ name: 'A' }, { name: 'B' }]
    const links = [{ source: 'A', target: 'B', name: 'e1' }]
    const { nodeRepaints, linkRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: [],
      prevLink: null,
      nextNodes: [],
      nextLink: null,
      prevDimNodes: null,
      nextDimNodes: new Set(['A']),
      sceneColors: SCENE_COLORS.dark
    })
    expect(nodeRepaints).toEqual([[nodes[1], SCENE_COLORS.dark.dim]])
    expect(linkRepaints).toEqual([[links[0], SCENE_COLORS.dark.dim]])
  })
  it('不传 sceneColors 时与旧行为一致（浅色套，向后兼容）', () => {
    const nodes = [{ name: 'A' }]
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links: [],
      prevNodes: [],
      prevLink: null,
      nextNodes: ['A'],
      nextLink: null
    })
    expect(nodeRepaints).toEqual([[nodes[0], HL_COLOR]])
  })
})

describe('deepClone：入图/入历史前的深拷贝', () => {
  it('嵌套对象与数组整体脱钩（改副本不回渗原图）', () => {
    const src = { nodes: [{ name: 'A' }], links: [] }
    const copy = deepClone(src)
    copy.nodes[0].name = 'changed'
    copy.links.push('x')
    expect(src.nodes[0].name).toBe('A')
    expect(src.links).toHaveLength(0)
  })
})

describe('emptyNode / emptyEdge：侧栏表单空模板', () => {
  it('emptyNode 回到空节点模板（symbolSize 基线 50）', () => {
    expect(emptyNode()).toEqual({ name: '', des: '', symbolSize: 50, category: '' })
  })

  it('emptyEdge 回到空边模板', () => {
    expect(emptyEdge()).toEqual({ source: '', target: '', name: '', des: '' })
  })
})

describe('sameNameSet：名字集合相等（聚焦相机 watcher 的重复合发短路）', () => {
  it('内容相同即相等（顺序无关、空集相等）：邻域 computed 换新数组不重复取景', () => {
    expect(sameNameSet(['A', 'B', 'C'], ['C', 'B', 'A'])).toBe(true)
    expect(sameNameSet([], [])).toBe(true)
  })

  it('长度不同或成员不同返回 false：换焦点/改跳数仍要取景', () => {
    expect(sameNameSet(['A', 'B'], ['A', 'B', 'C'])).toBe(false)
    expect(sameNameSet(['A', 'B'], ['A', 'D'])).toBe(false)
  })
})
