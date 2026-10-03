// graphMerge 单测：复制收集三路分发（框选/直选边/最后点击节点，子图自洽）
// + 合并批量（同名跳过、端点并集过滤、无向端点对去重、多重边）。
// 纯函数 vitest 直测（项目惯例：.vue 交互逻辑抽 utils 单测，组件层冒烟覆盖）。
import { describe, it, expect } from 'vitest'
import { collectCopySelection, mergeGraphBatch } from '../../src/renderer/src/utils/graphMerge'

// 三节点两边的公共夹具：A-B、B-C
const nodes = [
  { name: 'A', category: 'c1' },
  { name: 'B', category: 'c2' },
  { name: 'C', category: 'c1' }
]
const links = [
  { source: 'A', target: 'B', name: 'ab' },
  { source: 'B', target: 'C', name: 'bc' }
]

describe('collectCopySelection 三路分发', () => {
  it('路径1 框选集：选中节点 + 两端都在集内的边（互连边自动带上）', () => {
    const picked = collectCopySelection(nodes, links, ['A', 'B'], [], -1, -1)
    expect(picked.nodes.map((n) => n.name)).toEqual(['A', 'B'])
    expect(picked.links).toEqual([{ source: 'A', target: 'B', name: 'ab' }])
  })

  it('路径1 框选直选边的端点节点并入集（边被框住、端点球不在框内）', () => {
    // 直选 B-C 边 + 选中 A：C 经边端点并入，B-C、A-B 都进边集
    const picked = collectCopySelection(nodes, links, ['A'], [1], -1, -1)
    expect(picked.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C'])
    expect(picked.links).toEqual(links)
  })

  it('路径2 直选边：该边 + 两端节点（多重边只带选中的那条）', () => {
    const multi = [...links, { source: 'A', target: 'B', name: 'ab2' }]
    const picked = collectCopySelection(nodes, multi, [], [], 2, -1)
    expect(picked.nodes.map((n) => n.name).sort()).toEqual(['A', 'B'])
    expect(picked.links).toEqual([{ source: 'A', target: 'B', name: 'ab2' }])
  })

  it('路径3 最后点击节点：节点本身、无边', () => {
    const picked = collectCopySelection(nodes, links, [], [], -1, 1)
    expect(picked.nodes).toEqual([{ name: 'B', category: 'c2' }])
    expect(picked.links).toEqual([])
  })

  it('无任何选中返回 null', () => {
    expect(collectCopySelection(nodes, links, [], [], -1, -1)).toBeNull()
  })

  it('直选边 index 越界时回退节点路径', () => {
    const picked = collectCopySelection(nodes, links, [], [], 99, 0)
    expect(picked.nodes).toEqual([{ name: 'A', category: 'c1' }])
  })
})

describe('mergeGraphBatch 合并语义', () => {
  it('同名节点跳过、skippedCount 计数', () => {
    const merged = mergeGraphBatch(nodes, links, [{ name: 'A', category: 'x' }, { name: 'D' }], [])
    expect(merged.nodes.map((n) => n.name)).toEqual(['D'])
    expect(merged.skippedCount).toBe(1)
  })

  it('边端点在「现有 ∪ 新增」并集内即保留（接上现有同名节点——合并）', () => {
    const merged = mergeGraphBatch(
      nodes,
      links,
      [{ name: 'D' }],
      [{ source: 'D', target: 'A', name: 'da' }]
    )
    expect(merged.links).toEqual([{ source: 'D', target: 'A', name: 'da' }])
  })

  it('边端点不在并集内被丢弃（悬空边不粘）', () => {
    const merged = mergeGraphBatch(nodes, links, [], [{ source: 'X', target: 'Y', name: 'xy' }])
    expect(merged.links).toEqual([])
  })

  it('与现有边无向端点对重复被丢弃（反向端点也算重复）', () => {
    const merged = mergeGraphBatch(
      nodes,
      links,
      [],
      [
        { source: 'B', target: 'A', name: '反' },
        { source: 'A', target: 'B', name: '正' }
      ]
    )
    expect(merged.links).toEqual([])
  })

  it('多重边：现有无同端点对时 incoming 整体恢复', () => {
    const merged = mergeGraphBatch(
      nodes,
      links,
      [],
      [
        { source: 'A', target: 'C', name: 'ac1' },
        { source: 'A', target: 'C', name: 'ac2' }
      ]
    )
    expect(merged.links).toHaveLength(2)
  })

  it('空批次：nodes/links 皆空', () => {
    const merged = mergeGraphBatch(
      nodes,
      links,
      [{ name: 'A' }],
      [{ source: 'A', target: 'B', name: 'ab' }]
    )
    expect(merged.nodes).toEqual([])
    expect(merged.links).toEqual([])
    expect(merged.skippedCount).toBe(1)
  })
})
