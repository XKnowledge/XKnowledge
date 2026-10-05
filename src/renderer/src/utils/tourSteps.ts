/** 新手教程步骤纯数据：目标锚点选择器 + i18n 文案 key + 气泡摆放位。
 *  target 为 null 的步骤居中显示（a-tour 对无 target/找不到 target 的内置
 *  行为）。锚点全部复用 ChartView/XkGraph3D 现有稳定选择器，不加新锚点。
 *  文案 key 的双语齐全性由 tests/renderer/tourSteps.test.js 锁定。 */
export interface TourStepDef {
  /** 目标元素 CSS 选择器；null = 居中气泡 */
  target: string | null
  /** 气泡相对目标的摆放（vc-tour placements：top / bottom / bottomLeft / left / right…） */
  placement: string
  titleKey: string
  descKey: string
}

export const TOUR_STEPS: TourStepDef[] = [
  // 1 欢迎（居中）：三要素一句话 + 预期时长
  { target: null, placement: 'bottom', titleKey: 'tour.welcomeTitle', descKey: 'tour.welcomeDesc' },
  // 2 菜单（左上角，气泡放右下避免出屏）
  {
    target: '.sider-menu-style',
    placement: 'bottomLeft',
    titleKey: 'tour.menuTitle',
    descKey: 'tour.menuDesc'
  },
  // 3 工具栏（顶栏中部，气泡放下方）
  {
    target: '.move-header',
    placement: 'bottom',
    titleKey: 'tour.toolbarTitle',
    descKey: 'tour.toolbarDesc'
  },
  // 4-6 画布三连：建点 → 连线 → 导航（同一目标内容递进，气泡统一放上方）
  {
    target: '.echarts-style',
    placement: 'top',
    titleKey: 'tour.createNodeTitle',
    descKey: 'tour.createNodeDesc'
  },
  {
    target: '.echarts-style',
    placement: 'top',
    titleKey: 'tour.linkTitle',
    descKey: 'tour.linkDesc'
  },
  {
    target: '.echarts-style',
    placement: 'top',
    titleKey: 'tour.navigateTitle',
    descKey: 'tour.navigateDesc'
  },
  // 7 图例（画布左上角，右侧空间大）
  {
    target: '.graph3d-legend',
    placement: 'right',
    titleKey: 'tour.legendTitle',
    descKey: 'tour.legendDesc'
  },
  // 8 属性面板（右侧栏，气泡放左侧）
  {
    target: '.attr-panel',
    placement: 'left',
    titleKey: 'tour.panelTitle',
    descKey: 'tour.panelDesc'
  },
  // 9 收尾（居中）：搜索/保存快捷键 + 祝福
  { target: null, placement: 'top', titleKey: 'tour.doneTitle', descKey: 'tour.doneDesc' }
]
