/**
 * 底部导航条文案选择（XkGraph3D 的 .scene-nav-info 覆盖文案）：
 * 选中节点 → 连线手势触点提示（用户正握着一根边的原材料，教 {modifier}+拖
 * 的最佳时机）；无选中 → 默认导航提示。装载/语言切换/选中变更三方共用，
 * 语言切换经同一选择器重设——切语言不清掉连线提示。
 * @param {boolean} hasNodeSelection 是否有节点处于选中态
 * @returns {'chart.navInfo3d' | 'chart.navInfoConnect'} i18n key
 */
export const navInfoKey = (hasNodeSelection) =>
  hasNodeSelection ? 'chart.navInfoConnect' : 'chart.navInfo3d'
