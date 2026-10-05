import { describe, it, expect } from 'vitest'
import { TOUR_STEPS } from '../../src/renderer/src/utils/tourSteps'
import { zhCN } from '../../src/shared/locales/zh-CN.js'
import { enUS } from '../../src/shared/locales/en-US.js'

/** 点路径取值：'tour.welcomeTitle' → zhCN.tour.welcomeTitle */
const resolve = (dict, dotted) => dotted.split('.').reduce((o, k) => (o ? o[k] : undefined), dict)

describe('tourSteps：教程步骤数据完整性', () => {
  it('步骤顺序固定 9 步（增删步骤须同步教程文案与本断言）', () => {
    expect(TOUR_STEPS.length).toBe(9)
  })

  it('每步 titleKey/descKey 在中英两份字典都存在（缺 key 运行时回落警告）', () => {
    for (const s of TOUR_STEPS) {
      expect(resolve(zhCN, s.titleKey), `zh ${s.titleKey}`).toBeDefined()
      expect(resolve(zhCN, s.descKey), `zh ${s.descKey}`).toBeDefined()
      expect(resolve(enUS, s.titleKey), `en ${s.titleKey}`).toBeDefined()
      expect(resolve(enUS, s.descKey), `en ${s.descKey}`).toBeDefined()
    }
  })

  it('菜单入口文案 menu.tour 双语存在', () => {
    expect(resolve(zhCN, 'menu.tour')).toBeDefined()
    expect(resolve(enUS, 'menu.tour')).toBeDefined()
  })

  it('target 二值合法：非空字符串锚点或 null（居中步）；首/画布三步/尾居中', () => {
    for (const s of TOUR_STEPS) {
      expect(
        s.target === null || (typeof s.target === 'string' && s.target.length > 0),
        `非法 target: ${s.target}`
      ).toBe(true)
    }
    // 居中步：欢迎(1)、画布三连(4-6)、收尾(9)。画布不做锚点——画布贴
    // 视口左缘(left=0)，vc-tour 遮罩 gap(默认6) 外扩会算出负 pos.left/top，
    // Mask 挡板 rect 拿负值触发 SVG 校验 Error（rendering 级控制台报错）
    expect(TOUR_STEPS.filter((s) => s.target === null).length).toBe(5)
    expect(TOUR_STEPS[0].target).toBeNull()
    expect(TOUR_STEPS[3].target).toBeNull()
    expect(TOUR_STEPS[4].target).toBeNull()
    expect(TOUR_STEPS[5].target).toBeNull()
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].target).toBeNull()
  })

  it('锚点集合与 ChartView/XkGraph3D 现有稳定选择器一致（且离视口边缘 >6px，避开遮罩 gap 负值）', () => {
    const anchors = new Set(TOUR_STEPS.map((s) => s.target).filter(Boolean))
    expect([...anchors]).toEqual([
      '.sider-menu-style .no-move',
      '.move-header [data-toolbar-action]',
      '.graph3d-legend',
      '.attr-panel'
    ])
  })
})
