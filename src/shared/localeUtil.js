/**
 * 语言偏好纯函数（主进程 i18nMain 与渲染层 localeStore 共用）。
 * 三态偏好：auto（跟随系统）/ zh-CN / en-US；生效语言由偏好与系统语言派生。
 * 与字典一样属双端共用数据，禁止 import vue / electron。
 */
export const LOCALE_MODES = ['auto', 'zh-CN', 'en-US']

/** 非法存储值（手改/损坏）回落 auto */
export const normalizeLocaleMode = (v) => (LOCALE_MODES.includes(v) ? v : 'auto')

/** 系统语言映射：zh* 前缀 → zh-CN，否则 en-US */
export const resolveSystemLocale = (sysLang) =>
  String(sysLang || '')
    .toLowerCase()
    .startsWith('zh')
    ? 'zh-CN'
    : 'en-US'

/** 生效语言推导（纯函数）：显式选择直译，auto 跟随系统 */
export const resolveEffectiveLocale = (mode, sysLang) =>
  mode === 'auto' ? resolveSystemLocale(sysLang) : mode
