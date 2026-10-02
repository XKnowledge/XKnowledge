import { computed, ref } from 'vue'
import { i18n } from '../i18n.js'
import { normalizeLocaleMode, resolveEffectiveLocale } from '../../../shared/localeUtil.js'

/**
 * 语言三态：auto（跟随系统）/ zh-CN / en-US，模块级单例（themeStore 同构）。
 * 偏好持久化 localStorage（xk-locale），storage 事件跨窗口实时同步
 * （同 session 所有窗口）；切换时同步 vue-i18n 实例 locale 并上报主进程
 * （对话框/窗口标题跟随）。模块加载期除 localStorage 读取（try-catch
 * 兜底）外无副作用，node 测试环境可直接 import。
 */
export const STORAGE_KEY = 'xk-locale'

const readStoredMode = () => {
  try {
    return normalizeLocaleMode(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'auto' // localStorage 受限/损坏：回默认，不阻塞启动
  }
}

export const mode = ref(readStoredMode())
/** 生效语言（auto 已消解为具体字典键），antd locale / i18n 实例共用 */
export const locale = computed(() => resolveEffectiveLocale(mode.value, navigator.language))

const apply = () => {
  i18n.global.locale.value = locale.value
  Promise.resolve(window.electronAPI?.localeApplied?.({ locale: locale.value })).catch((err) => {
    console.error('语言上报失败', err) // 主进程对话框/标题降级：本窗口照常生效
  })
}

export const setLocaleMode = (next) => {
  mode.value = normalizeLocaleMode(next)
  try {
    localStorage.setItem(STORAGE_KEY, mode.value) // 其他窗口经 storage 事件跟随
  } catch {
    /* 持久化失败仅影响记忆，本窗口仍生效 */
  }
  apply()
}

let inited = false

/** 挂 storage 监听并做首次应用（main.ts 在 app.mount 前调用一次）：
 * 其他窗口改语言（storage 事件只在其他窗口触发，本窗口由 setLocaleMode 覆盖）。
 * 幂等：HMR/重复调用不叠加监听。
 */
export const initLocaleSync = () => {
  if (inited) return
  inited = true
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    mode.value = normalizeLocaleMode(e.newValue)
    apply()
  })
  apply()
}
