import { ref } from 'vue'

/** 新手教程完成标记 key（xk- 前缀沿用项目 localStorage 惯例）：
 *  看完或中途关闭都写入——之后不再自动弹；菜单「新手教程」随时重开。
 *  多窗口共享同一 localStorage：第二个窗口不重复自动弹。 */
export const TOUR_DONE_KEY = 'xk-tour-done'

/** localStorage 读取：异常/缺失视为已看过——自动弹教程是锦上添花，
 *  不因存储不可用打扰（keybindingStore/themeStore 同款 try-catch 惯例） */
const readDone = () => {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === '1'
  } catch {
    return true
  }
}

const writeDone = () => {
  try {
    localStorage.setItem(TOUR_DONE_KEY, '1')
  } catch {
    /* 写入失败静默：open 是内存态，本会话行为不受影响 */
  }
}

/**
 * 新手教程状态机：open 的持有者与「看过一次」标记的读写。
 * 视图（a-tour 组装）在 XkTour.vue，UI 编排在 ChartView——这里无 DOM 依赖。
 * onBeforeStart：每次开启（自动/手动）前执行，编排层注入「侧栏回标准态」
 * （侧栏收起时属性面板步骤的锚点不可见）。
 */
export function useTour(onBeforeStart?: () => void) {
  const open = ref(false)

  const begin = () => {
    onBeforeStart?.()
    open.value = true
  }

  /** 首次自动触发：未看过才开（onMounted 里调） */
  const maybeAutoStart = () => {
    if (!readDone()) begin()
  }

  /** 手动重开（菜单入口）：不看标记 */
  const start = () => begin()

  /** 关闭（X / 遮罩 / 走完最后一步）：都视为已看过 */
  const stop = () => {
    open.value = false
    writeDone()
  }

  return { open, maybeAutoStart, start, stop }
}
