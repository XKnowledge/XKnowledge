import { describe, it, expect, beforeAll, vi } from 'vitest'

// node 测试环境无 window：setLocaleMode 的上报链走 electronAPI 可选调用
beforeAll(() => {
  vi.stubGlobal('window', {})
})
import {
  LOCALE_MODES,
  normalizeLocaleMode,
  resolveSystemLocale,
  resolveEffectiveLocale
} from '../../src/shared/localeUtil.js'

describe('localeUtil：语言偏好纯函数（双端共用）', () => {
  it('normalizeLocaleMode：合法三态透传，非法回落 auto', () => {
    expect(LOCALE_MODES).toEqual(['auto', 'zh-CN', 'en-US'])
    expect(normalizeLocaleMode('auto')).toBe('auto')
    expect(normalizeLocaleMode('zh-CN')).toBe('zh-CN')
    expect(normalizeLocaleMode('en-US')).toBe('en-US')
    expect(normalizeLocaleMode('fr-FR')).toBe('auto')
    expect(normalizeLocaleMode(null)).toBe('auto')
  })

  it('resolveSystemLocale：zh 前缀映射 zh-CN（含 zh-TW/zh_CN 大小写），其余 en-US', () => {
    expect(resolveSystemLocale('zh-CN')).toBe('zh-CN')
    expect(resolveSystemLocale('zh_tw')).toBe('zh-CN')
    expect(resolveSystemLocale('zh')).toBe('zh-CN')
    expect(resolveSystemLocale('en-US')).toBe('en-US')
    expect(resolveSystemLocale('ja')).toBe('en-US')
    expect(resolveSystemLocale(undefined)).toBe('en-US')
  })

  it('resolveEffectiveLocale：显式直译，auto 跟随系统', () => {
    expect(resolveEffectiveLocale('zh-CN', 'en-US')).toBe('zh-CN')
    expect(resolveEffectiveLocale('en-US', 'zh-CN')).toBe('en-US')
    expect(resolveEffectiveLocale('auto', 'zh-CN')).toBe('zh-CN')
    expect(resolveEffectiveLocale('auto', 'de-DE')).toBe('en-US')
  })
})

describe('localeStore：三态与切换（node 环境 localStorage 不存在 → 回 auto）', () => {
  it('默认 auto，生效语言随系统语言派生', async () => {
    const { mode, locale } = await import('../../src/renderer/src/store/localeStore.js')
    expect(mode.value).toBe('auto')
    expect(['zh-CN', 'en-US']).toContain(locale.value)
  })

  it('setLocaleMode 切换后 locale 即为显式值', async () => {
    const { locale, setLocaleMode } = await import('../../src/renderer/src/store/localeStore.js')
    setLocaleMode('en-US')
    expect(locale.value).toBe('en-US')
    setLocaleMode('auto') // 还原，避免影响其他用例
    expect(locale.value === 'zh-CN' || locale.value === 'en-US').toBe(true)
  })

  it('切换同步 vue-i18n 实例 locale，t() 即时跟随', async () => {
    const { setLocaleMode } = await import('../../src/renderer/src/store/localeStore.js')
    const { i18n } = await import('../../src/renderer/src/i18n.js')
    setLocaleMode('en-US')
    expect(i18n.global.locale.value).toBe('en-US')
    expect(i18n.global.t('common.untitled')).toBe('Untitled')
    setLocaleMode('zh-CN')
    expect(i18n.global.t('common.untitled')).toBe('未命名')
    setLocaleMode('auto') // 还原
  })
})

describe('initLocaleSync：跨窗口 storage 跟随', () => {
  it('其他窗口改语言本窗口跟随（i18n 实例与主进程上报同步），幂等不叠加监听', async () => {
    const handlers = {}
    const localeApplied = vi.fn(() => Promise.resolve())
    const windowAdd = vi.fn((type, h) => (handlers[type] = h))
    vi.stubGlobal('window', {
      addEventListener: windowAdd,
      electronAPI: { localeApplied }
    })
    const store = await import('../../src/renderer/src/store/localeStore.js')
    const { i18n } = await import('../../src/renderer/src/i18n.js')

    store.initLocaleSync()
    // 首次应用即上报当前生效语言（主进程对话框/标题跟随）
    expect(localeApplied).toHaveBeenCalledWith({ locale: store.locale.value })

    // 其他窗口显式切 en：三处同步（偏好、生效值、i18n 实例）
    handlers.storage({ key: store.STORAGE_KEY, newValue: 'en-US' })
    expect(store.mode.value).toBe('en-US')
    expect(store.locale.value).toBe('en-US')
    expect(i18n.global.locale.value).toBe('en-US')
    expect(localeApplied).toHaveBeenCalledWith({ locale: 'en-US' })

    // 非本 key 的 storage 事件忽略；坏值归一 auto
    handlers.storage({ key: 'other-key', newValue: 'zh-CN' })
    expect(store.mode.value).toBe('en-US')
    handlers.storage({ key: store.STORAGE_KEY, newValue: 'fr-FR' })
    expect(store.mode.value).toBe('auto')

    // 幂等：重复调用不再注册监听
    const callsAfterInit = windowAdd.mock.calls.length
    store.initLocaleSync()
    expect(windowAdd.mock.calls.length).toBe(callsAfterInit)

    store.setLocaleMode('auto') // 还原（i18n 实例随 apply 回系统语言）
    vi.unstubAllGlobals()
  })
})
