import { describe, it, expect } from 'vitest'
import { parseOutline } from '../../src/renderer/src/utils/outlineParser'

describe('parseOutline', () => {
  it('纯标题层级：父子链与类目/大小', () => {
    const r = parseOutline('# 数学\n## 代数\n### 群论\n## 几何')
    expect(r.nodes.map((n) => n.name)).toEqual(['数学', '代数', '群论', '几何'])
    expect(r.links).toEqual([
      { source: '数学', target: '代数', name: '', des: '' },
      { source: '代数', target: '群论', name: '', des: '' },
      { source: '数学', target: '几何', name: '', des: '' }
    ])
    expect(r.nodes[0]).toEqual({ name: '数学', des: '', category: '数学', symbolSize: 70 })
    expect(r.nodes[2]).toEqual({ name: '群论', des: '', category: '数学', symbolSize: 50 })
  })

  it('缩进列表：2 空格一档，顶层列表项是根', () => {
    const r = parseOutline('- 武器\n  - 剑\n    - 长剑\n  - 盾')
    expect(r.nodes.map((n) => n.name)).toEqual(['武器', '剑', '长剑', '盾'])
    expect(r.links).toHaveLength(3)
    expect(r.nodes[0].category).toBe('武器')
    expect(r.nodes[0].symbolSize).toBe(70)
  })

  it('标题+列表混合：列表项挂在最近标题下', () => {
    const r = parseOutline('# A\n- a1\n- a2\n## B\n- b1')
    expect(r.links).toEqual([
      { source: 'A', target: 'a1', name: '', des: '' },
      { source: 'A', target: 'a2', name: '', des: '' },
      { source: 'A', target: 'B', name: '', des: '' },
      { source: 'B', target: 'b1', name: '', des: '' }
    ])
    expect(r.nodes.find((n) => n.name === 'b1').category).toBe('A')
  })

  it('段落文本 → 最近节点的 des', () => {
    const r = parseOutline('# 数学\n研究数量与结构的学科\n## 代数')
    expect(r.nodes[0].des).toBe('研究数量与结构的学科')
    expect(r.nodes[1].des).toBe('')
  })

  it('标题与段落间隔空行：des 归属跨空行延续', () => {
    const r = parseOutline('# 数学\n\n研究数量与结构的学科\n\n## 代数')
    expect(r.nodes[0].des).toBe('研究数量与结构的学科')
    expect(r.nodes[1].des).toBe('')
  })

  it('[[双链]]：剥离标记、连边、目标不存在则建未分类节点', () => {
    const r = parseOutline('# 数学\n## 代数\n# 物理\n## 量子力学\n与 [[代数]] 相关')
    const target = r.nodes.find((n) => n.name === '量子力学')
    expect(target.des).toBe('与 代数 相关')
    expect(r.links).toContainEqual({ source: '量子力学', target: '代数', name: '', des: '' })
    expect(r.nodes.filter((n) => n.name === '代数')).toHaveLength(1)
    const dangling = parseOutline('# A\n见 [[X]]')
    expect(dangling.nodes.map((n) => n.name)).toEqual(['A', 'X'])
    expect(dangling.nodes[1].category).toBe('未分类')
  })

  it('同名节点去重：不重建但保留连边；自环与重复边跳过', () => {
    const r = parseOutline('# A\n## B\n# C\n## B')
    expect(r.nodes.filter((n) => n.name === 'B')).toHaveLength(1)
    expect(r.links).toEqual([
      { source: 'A', target: 'B', name: '', des: '' },
      { source: 'A', target: 'C', name: '', des: '' },
      { source: 'C', target: 'B', name: '', des: '' }
    ])
    const self = parseOutline('# A\n见 [[A]]')
    expect(self.links).toHaveLength(0)
  })

  it('数字列表与 tab 缩进', () => {
    const r = parseOutline('1. 甲\n\t- 乙\n\t\t- 丙')
    expect(r.nodes.map((n) => n.name)).toEqual(['甲', '乙', '丙'])
    expect(r.links[0]).toEqual({ source: '甲', target: '乙', name: '', des: '' })
  })

  it('空输入返回空结构', () => {
    expect(parseOutline('')).toEqual({ nodes: [], links: [] })
    expect(parseOutline('\n\n  \n')).toEqual({ nodes: [], links: [] })
  })
})
