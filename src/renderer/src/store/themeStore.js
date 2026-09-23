import { computed, ref } from 'vue'

/**
 * 主题三态：auto（跟随系统）/ light / dark，模块级单例（对齐 chartStore 模式）。
 * 偏好持久化 localStorage（xk-theme-mode），storage 事件跨窗口实时同步
 * （同 session 所有窗口）；生效主题由 mode 与系统偏好共同派生。
 * 模块加载期除 localStorage 读取（try-catch 兜底）外无副作用，
 * node 测试环境可直接 import。
 */
export const STORAGE_KEY = 'xk-theme-mode'

/** 三态：auto（跟随系统）/ light / dark */
export const THEME_MODES = ['auto', 'light', 'dark']

/** 非法存储值（手改/损坏）回落 auto */
export const normalizeMode = (v) => (THEME_MODES.includes(v) ? v : 'auto')

/** 生效主题推导（纯函数）：dark 显式即深；auto 跟随系统；其余浅色 */
export const resolveEffective = (mode, systemDark) =>
  mode === 'dark' || (mode === 'auto' && systemDark) ? 'dark' : 'light'

const readStoredMode = () => {
  try {
    return normalizeMode(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'auto' // localStorage 受限/损坏：回默认，不阻塞启动
  }
}

export const mode = ref(readStoredMode())
const systemDark = ref(false)
export const effective = computed(() => resolveEffective(mode.value, systemDark.value))

/** 应用当前生效主题：CSS 变量钩子 + 上报主进程（themeSource/标题栏/新窗口底色） */
const apply = () => {
  document.documentElement.dataset.theme = effective.value
  Promise.resolve(
    window.electronAPI?.themeApplied?.({ mode: mode.value, effective: effective.value })
  ).catch((err) => {
    console.error('主题上报失败', err) // 视觉层降级：本窗口照常生效
  })
}

export const setMode = (next) => {
  mode.value = normalizeMode(next)
  try {
    localStorage.setItem(STORAGE_KEY, mode.value) // 其他窗口经 storage 事件跟随
  } catch {
    /* 持久化失败仅影响记忆，本窗口仍生效 */
  }
  apply()
}

let inited = false

/** 挂监听并做首次应用（main.ts 在 app.mount 前调用一次）：
 * - 系统偏好变化（仅 auto 模式重算；强制模式下 Electron themeSource
 *   已钉住媒体查询，change 不触发）
 * - 其他窗口改偏好（storage 事件只在其他窗口触发，本窗口由 setMode 覆盖）
 * 幂等：HMR/重复调用不叠加监听。
 */
export const initTheme = () => {
  if (inited) return
  inited = true
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mq.matches
  mq.addEventListener('change', (e) => {
    systemDark.value = e.matches
    if (mode.value === 'auto') apply()
  })
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    mode.value = normalizeMode(e.newValue)
    apply()
  })
  apply()
}
