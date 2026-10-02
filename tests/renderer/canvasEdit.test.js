import { describe, it, expect } from 'vitest'
import { clampEditorPos, pickNearestNode, focusPlaneDistance } from '../../src/renderer/src/utils/canvasEdit'

describe('clampEditorPos', () => {
  it('位置在安全区内原样返回', () => {
    expect(clampEditorPos(800, 600, 100, 200)).toEqual({ x: 100, y: 200 })
  })

  it('超出右边界钳回（编辑器宽 380 高 90 估计值）', () => {
    const r = clampEditorPos(800, 600, 790, 200)
    expect(r.x).toBeLessThanOrEqual(800)
    expect(r.x).toBe(800 - 380)
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

  it('容器小于编辑器占位时钳制上限退化为边距（防倒挂甩出左上）', () => {
    const r = clampEditorPos(100, 50, 500, 500)
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

describe('focusPlaneDistance', () => {
  it('空图回退相机-lookAt 距离', () => {
    expect(focusPlaneDistance({ x: 0, y: 0, z: 1000 }, { x: 0, y: 0, z: 0 }, [])).toBe(1000)
  })

  it('单节点在原点、相机沿 -z 看：距离=相机到质心（库装载取景后相机 z=170 的场景）', () => {
    // lookAt 是 getter 合成的相机前方 1000 单位点，视线仍沿 -z
    expect(
      focusPlaneDistance({ x: 0, y: 0, z: 170 }, { x: 0, y: 0, z: -830 }, [{ x: 0, y: 0, z: 0 }])
    ).toBeCloseTo(170, 5)
  })

  it('多节点取质心：两节点对称分布时距离=相机到中点', () => {
    const nodes = [
      { x: 174, y: -107, z: 371 },
      { x: -174, y: 107, z: -371 }
    ]
    // 质心 (0,0,0)，相机 (0,0,214) 沿 -z 看
    expect(focusPlaneDistance({ x: 0, y: 0, z: 214 }, { x: 0, y: 0, z: -786 }, nodes)).toBeCloseTo(
      214,
      5
    )
  })

  it('斜视线：距离取质心在视线方向的投影', () => {
    // 相机 (100,0,100) 看向 (0,0,0)：单位视线 (-0.707,0,-0.707)；
    // 质心 (0,0,0) 投影 = 141.42
    expect(
      focusPlaneDistance({ x: 100, y: 0, z: 100 }, { x: 0, y: 0, z: 0 }, [{ x: 0, y: 0, z: 0 }])
    ).toBeCloseTo(141.4214, 3)
  })

  it('质心在相机侧后（投影非正）兜底为 1，防 screen2GraphCoords 拿到非正距离', () => {
    // 质心在相机背后 +z 方向，视线沿 -z → 投影为负
    expect(
      focusPlaneDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -100 }, [{ x: 0, y: 0, z: 50 }])
    ).toBe(1)
  })

  it('非有限坐标节点被忽略', () => {
    expect(
      focusPlaneDistance(
        { x: 0, y: 0, z: 100 },
        { x: 0, y: 0, z: 0 },
        [
          { x: NaN, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 }
        ]
      )
    ).toBeCloseTo(100, 5)
  })
})
