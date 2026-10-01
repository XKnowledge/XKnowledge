import { describe, it, expect } from 'vitest'
import { clampEditorPos, pickNearestNode } from '../../src/renderer/src/utils/canvasEdit'

describe('clampEditorPos', () => {
  it('位置在安全区内原样返回', () => {
    expect(clampEditorPos(800, 600, 100, 200)).toEqual({ x: 100, y: 200 })
  })

  it('超出右边界钳回（编辑器宽 240 高 90 估计值）', () => {
    const r = clampEditorPos(800, 600, 790, 200)
    expect(r.x).toBeLessThanOrEqual(800)
    expect(r.x).toBe(800 - 240)
  })

  it('超出下边界钳回', () => {
    const r = clampEditorPos(800, 600, 100, 590)
    expect(r.y).toBe(600 - 90)
  })

  it('负坐标钳到 8（留边）', () => {
    const r = clampEditorPos(800, 600, -5, -5)
    expect(r.x).toBe(8)
    expect(r.y).toBe(8)
  })
})

describe('pickNearestNode', () => {
  const items = [
    { name: 'A', x: 100, y: 100 },
    { name: 'B', x: 300, y: 100 }
  ]

  it('命中阈值内最近节点', () => {
    expect(pickNearestNode(items, 105, 98, 16).name).toBe('A')
    expect(pickNearestNode(items, 295, 100, 16).name).toBe('B')
  })

  it('阈值外返回 null', () => {
    expect(pickNearestNode(items, 200, 100, 16)).toBeNull()
  })

  it('空数组返回 null', () => {
    expect(pickNearestNode([], 100, 100, 16)).toBeNull()
  })
})
