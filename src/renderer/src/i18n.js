import { createI18n } from 'vue-i18n'
import { zhCN } from '../../shared/locales/zh-CN.js'
import { enUS } from '../../shared/locales/en-US.js'
import { normalizeLocaleMode, resolveEffectiveLocale } from '../../shared/localeUtil.js'

/**
 * 初始生效语言：localStorage 偏好 ⊕ 系统语言（与 localeStore 读同一 key、
 * 同一派生规则，加载期必然一致）；后续切换统一走 localeStore.setLocaleMode，
 * 本模块只负责建实例与导出 t。
 */
const initialLocale = resolveEffectiveLocale(
  (() => {
    try {
      return normalizeLocaleMode(localStorage.getItem('xk-locale'))
    } catch {
      return 'auto'
    }
  })(),
  navigator.language
)

export const i18n = createI18n({
  legacy: false, // Composer API：i18n.global.t 在非组件模块（utils）可用
  globalInjection: true, // 模板 $t 可用
  locale: initialLocale,
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS }
})

/** 非组件模块（utils/keybindings、composables/useDocument 等）用的快捷引用 */
export const t = i18n.global.t
