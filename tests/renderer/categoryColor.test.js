import { describe, it, expect } from 'vitest'
import { categoryColor, PALETTE } from '../../src/renderer/src/utils/categoryColor'

describe('categoryColor', () => {
  it('任意类目名返回调色板中的颜色', () => {
    expect(PALETTE).toContain(categoryColor('类目0'))
    expect(PALETTE).toContain(categoryColor('随便什么名字'))
    expect(PALETTE).toContain(categoryColor(''))
  })

  it('同名类目稳定同色（与调用顺序无关）', () => {
    const a = categoryColor('物理学')
    const b = categoryColor('化学')
    // 先调用别的类目再重复调用，结果必须一致
    categoryColor('数学')
    expect(categoryColor('物理学')).toBe(a)
    expect(categoryColor('化学')).toBe(b)
  })

  it('不同类目名有较大概率不同色（12 色下抽 5 个互不相同）', () => {
    const colors = ['a', 'b', 'c', 'd', 'e'].map(categoryColor)
    expect(new Set(colors).size).toBe(5)
  })
})
