import { describe, it, expect } from 'vitest'
import {
  clampEditorPos,
  pickNearestNode,
  focusPlaneDistance,
  buildMarqueeRect,
  pointInRect,
  segmentIntersectsRect
} from '../../src/renderer/src/utils/canvasEdit'

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
      focusPlaneDistance({ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 0 }, [
        { x: NaN, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 }
      ])
    ).toBeCloseTo(100, 5)
  })
})

describe('buildMarqueeRect（框选矩形归一化）', () => {
  it('右下方向拖拽：起点即左上角', () => {
    expect(buildMarqueeRect(100, 100, 300, 250)).toEqual({ x: 100, y: 100, w: 200, h: 150 })
  })

  it('左上方向拖拽：宽高非负、左上角随拖拽方向翻转', () => {
    expect(buildMarqueeRect(300, 250, 100, 100)).toEqual({ x: 100, y: 100, w: 200, h: 150 })
  })

  it('Shift+单击未拖（起止同点）：零尺寸矩形，选择自然为空', () => {
    expect(buildMarqueeRect(120, 80, 120, 80)).toEqual({ x: 120, y: 80, w: 0, h: 0 })
  })
})

describe('pointInRect（节点投影是否入框）', () => {
  const rect = { x: 100, y: 100, w: 200, h: 150 }

  it('框内命中', () => {
    expect(pointInRect(150, 200, rect)).toBe(true)
    expect(pointInRect(100, 100, rect)).toBe(true)
  })

  it('边界含入：贴框线的球心算选中', () => {
    expect(pointInRect(300, 250, rect)).toBe(true)
    expect(pointInRect(100, 250, rect)).toBe(true)
  })

  it('框外不命中', () => {
    expect(pointInRect(99, 200, rect)).toBe(false)
    expect(pointInRect(301, 100, rect)).toBe(false)
    expect(pointInRect(150, 251, rect)).toBe(false)
  })
})

describe('segmentIntersectsRect（边投影线段与框相交）', () => {
  const rect = { x: 100, y: 100, w: 200, h: 150 }

  it('任一端点在框内：命中（边连着框内节点）', () => {
    expect(segmentIntersectsRect(50, 50, 150, 150, rect)).toBe(true)
    expect(segmentIntersectsRect(150, 150, 500, 500, rect)).toBe(true)
  })

  it('两端都在框外但斜穿框：命中（边横贯框住的区域）', () => {
    expect(segmentIntersectsRect(0, 175, 500, 175, rect)).toBe(true)
    expect(segmentIntersectsRect(0, 0, 500, 400, rect)).toBe(true)
  })

  it('两端框外且不相交：不命中', () => {
    expect(segmentIntersectsRect(0, 50, 500, 50, rect)).toBe(false)
    expect(segmentIntersectsRect(400, 0, 500, 400, rect)).toBe(false)
  })

  it('端点恰好落在框边上：命中（贴框拖拽的边也算被框住）', () => {
    expect(segmentIntersectsRect(150, 100, 400, 100, rect)).toBe(true)
  })

  it('与框边平行且在框外的线段：不命中', () => {
    expect(segmentIntersectsRect(0, 300, 500, 300, rect)).toBe(false)
  })
})
