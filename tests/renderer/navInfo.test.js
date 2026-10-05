import { describe, it, expect } from 'vitest'
import { navInfoKey } from '../../src/renderer/src/utils/navInfo'

// 底部导航条文案选择：选中节点时切为连线手势触点提示（用户此刻正握着一根
// 边的原材料，是教 {modifier}+拖的最佳时机），无选中回落默认导航提示。
// 语言切换与选中变更经同一选择器重设——切语言不得清掉连线提示（回归锚点）
describe('navInfoKey：底部导航条文案选择', () => {
  it('无节点选中：默认导航文案', () => {
    expect(navInfoKey(false)).toBe('chart.navInfo3d')
  })

  it('有节点选中：连线手势提示', () => {
    expect(navInfoKey(true)).toBe('chart.navInfoConnect')
  })
})
