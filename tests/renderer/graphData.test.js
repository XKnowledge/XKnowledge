import { describe, it, expect } from 'vitest'
import {
  mergeGraphNodes,
  linkEnd,
  planHighlightRepaint,
  HL_COLOR,
  LINK_BASE_COLOR
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
    const { categoryColor } = await import('../../src/renderer/src/utils/categoryColor.js')
    const { nodeRepaints } = planHighlightRepaint({
      nodes,
      links,
      prevNodes: ['A'],
      prevLink: null,
      nextNodes: [],
      nextLink: null
    })
    expect(nodeRepaints).toEqual([[nodes[0], categoryColor('x')]])
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
