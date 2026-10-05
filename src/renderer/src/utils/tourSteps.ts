/** 新手教程步骤纯数据：目标锚点选择器 + i18n 文案 key + 气泡摆放位。
 *  target 为 null 的步骤居中显示（a-tour 对无 target/找不到 target 的内置
 *  行为）。锚点全部复用 ChartView/XkGraph3D 现有稳定选择器，不加新锚点。
 *  锚点必须离视口边缘 >6px：vc-tour 遮罩默认 gap=6 会把锚点 rect 四周
 *  外扩成挖洞 pos（left-6/top-6），贴边锚点（left/top=0）会算出负 pos，
 *  Mask 挡板 rect 拿负值触发 SVG 属性校验 Error（rendering 级报错，不
 *  崩溃但污染控制台）——画布 .echarts-style 贴视口左缘，画布三步因此
 *  走居中气泡。文案 key 的双语齐全性由 tests/renderer/tourSteps.test.js
 *  锁定。 */
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
  // 2 菜单（左上角图标本体——sider 容器贴视口左上缘，锚点用内部图标），
  //   气泡放右下避免出屏
  {
    target: '.sider-menu-style .no-move',
    placement: 'bottomLeft',
    titleKey: 'tour.menuTitle',
    descKey: 'tour.menuDesc'
  },
  // 3 工具栏（顶栏中部，锚点用首个工具栏按钮——.move-header 容器贴视口
  //   上缘），气泡放下方
  {
    target: '.move-header [data-toolbar-action]',
    placement: 'bottom',
    titleKey: 'tour.toolbarTitle',
    descKey: 'tour.toolbarDesc'
  },
  // 4-6 画布三连：建点 → 连线 → 导航（内容递进；画布贴视口左缘不可做
  //   锚点，居中气泡承载手势文案）
  {
    target: null,
    placement: 'top',
    titleKey: 'tour.createNodeTitle',
    descKey: 'tour.createNodeDesc'
  },
  {
    target: null,
    placement: 'top',
    titleKey: 'tour.linkTitle',
    descKey: 'tour.linkDesc'
  },
  {
    target: null,
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
