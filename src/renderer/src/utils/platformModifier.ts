/**
 * 平台相关修饰键的纯判定。平台标识由调用方注入（组件里既有惯例：
 * window.electronAPI.platform === 'darwin'），这里不耦合浏览器环境，
 * 双平台逻辑都能在任意机器上单测。
 *
 * 两类使用场景语义不同，刻意分开：
 * - 键盘快捷键（Ctrl+S/Z/Y/F）：全平台 Ctrl/Meta 双收（VS Code 同款惯例），
 *   远程桌面/外接键盘不踩坑；z/y 的 isTypingContext 守卫在组件侧，不受影响
 * - 建边拖拽手势：平台分流主修饰键——macOS 用 ⌘(metaKey)，Ctrl 留给系统
 *   右键语义（ctrl+click)；Windows/Linux 保持 Ctrl，Meta(Win 键) 不串台
 *
 * 入参用最小结构类型（而非 KeyboardEvent/MouseEvent）：键盘与鼠标事件都
 * 带这些修饰键字段，测试可直接传普通对象，维持「不耦合浏览器环境」。
 */

/** 键盘快捷键的修饰键是否按下（Ctrl 或 ⌘ 任一即可） */
export const shortcutModifierActive = (event: {
  ctrlKey: boolean
  metaKey: boolean
}): boolean => !!(event.ctrlKey || event.metaKey)

/**
 * 建边拖拽的主修饰键是否按下：isMac 时只认 ⌘，否则只认 Ctrl。
 * @param isMac 目标平台是否 macOS
 */
export const linkDragModifierActive = (
  event: { ctrlKey: boolean; metaKey: boolean },
  isMac: boolean
): boolean => !!(isMac ? event.metaKey : event.ctrlKey)

/**
 * 框选拖拽（Shift+拖）的修饰键是否按下：全平台统一 Shift，无平台分流——
 * Shift 拖拽在 macOS 无系统保留语义（Ctrl+点按才是右键），不需要主修饰键那套分流
 */
export const marqueeModifierActive = (event: { shiftKey: boolean }): boolean => !!event.shiftKey

/** 文案用主修饰键显示名：macOS 显示 ⌘，其余显示 Ctrl */
export const modifierKeyLabel = (isMac: boolean): string => (isMac ? '⌘' : 'Ctrl')
