import { describe, it, expect } from 'vitest'
import { assignCategoryColors, PALETTE } from '../../src/renderer/src/utils/categoryColor'

describe('assignCategoryColors：类型集合顺延分配', () => {
  it('任意类型分得的颜色都在调色板内', () => {
    const m = assignCategoryColors(['类目0', '随便什么名字', ''])
    for (const c of m.values()) expect(PALETTE).toContain(c)
  })

  it('同一集合结果确定，且与输入顺序无关', () => {
    const a = assignCategoryColors(['物理学', '化学', '数学'])
    const b = assignCategoryColors(['数学', '物理学', '化学'])
    const again = assignCategoryColors(['物理学', '化学', '数学'])
    expect([...a.entries()]).toEqual([...b.entries()])
    expect([...a.entries()]).toEqual([...again.entries()])
  })

  it('19 个类型（饮食与风味规模）零撞色', () => {
    const names = [
      '中餐技法谱系', '产区与名茶', '产地风土', '六大茶类谱系', '冲煮与品鉴',
      '制茶工艺链', '发酵与保存', '品鉴与风味', '器具与冲泡', '处理与发酵',
      '总览', '植物与品种', '母酱与乳化', '源流与传播', '火候与热',
      '烘焙与火候', '起源与传播', '风味的化学', '食材搭配网络'
    ]
    const colors = [...assignCategoryColors(names).values()]
    expect(colors).toHaveLength(19)
    expect(new Set(colors).size).toBe(19)
  })

  it('20 个类型零撞色（顺延兜底的边界）', () => {
    const names = Array.from({ length: 20 }, (_, i) => `类型${i}`)
    const colors = [...assignCategoryColors(names).values()]
    expect(new Set(colors).size).toBe(20)
  })

  it('21 个类型：用满 20 色，恰有一个类型与别人共色', () => {
    const names = Array.from({ length: 21 }, (_, i) => `类型${i}`)
    const colors = [...assignCategoryColors(names).values()]
    expect(colors).toHaveLength(21)
    expect(new Set(colors).size).toBe(20)
  })

  it('空值归一化：undefined/null/空串共占一个键，查询端归一化能查到', () => {
    const m = assignCategoryColors([undefined, null, ''])
    expect(m.size).toBe(1)
    expect(m.get('')).toBeTruthy()
    // 查询端约定：get(String(cat ?? '')) —— undefined 归一后能查到同一色
    expect(m.get(String(undefined ?? ''))).toBe(m.get(''))
  })
})
