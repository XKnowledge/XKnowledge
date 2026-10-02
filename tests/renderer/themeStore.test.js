import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  normalizeMode,
  resolveEffective,
  THEME_MODES,
  STORAGE_KEY,
  mode,
  effective,
  setMode,
  initTheme
} from '../../src/renderer/src/store/themeStore'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveEffective：生效主题推导', () => {
  it('显式模式直接生效，不看系统', () => {
    expect(resolveEffective('light', true)).toBe('light')
    expect(resolveEffective('dark', false)).toBe('dark')
  })
  it('auto 跟随系统', () => {
    expect(resolveEffective('auto', true)).toBe('dark')
    expect(resolveEffective('auto', false)).toBe('light')
  })
  it('非法值回落浅色（不误判深色）', () => {
    expect(resolveEffective('blue', true)).toBe('light')
    expect(resolveEffective(undefined, false)).toBe('light')
  })
})

describe('normalizeMode：存储值归一', () => {
  it('合法三态透传', () => {
    expect(normalizeMode('auto')).toBe('auto')
    expect(normalizeMode('light')).toBe('light')
    expect(normalizeMode('dark')).toBe('dark')
  })
  it('非法/空值回落 auto', () => {
    expect(normalizeMode('blue')).toBe('auto')
    expect(normalizeMode(null)).toBe('auto')
    expect(normalizeMode(undefined)).toBe('auto')
  })
})

describe('THEME_MODES：合法三态', () => {
  it('auto / light / dark', () => {
    expect(THEME_MODES).toEqual(['auto', 'light', 'dark'])
  })
})

// store 单例：node 环境无 localStorage → 模块加载回落 auto，内存态照常可测
describe('themeStore：store 单例', () => {
  it('STORAGE_KEY 固定 xk-theme-mode（跨窗口 storage 同步的锚点）', () => {
    expect(STORAGE_KEY).toBe('xk-theme-mode')
  })

  it('默认 auto，系统未判深色时生效浅色', () => {
    expect(mode.value).toBe('auto')
    expect(effective.value).toBe('light')
  })

  it('setMode：写 CSS 变量钩子并上报主进程；非法值归一 auto', () => {
    const dataset = {}
    const themeApplied = vi.fn(() => Promise.resolve())
    vi.stubGlobal('document', { documentElement: { dataset } })
    vi.stubGlobal('window', { electronAPI: { themeApplied } })

    setMode('dark')
    expect(mode.value).toBe('dark')
    expect(effective.value).toBe('dark')
    expect(dataset.theme).toBe('dark')
    expect(themeApplied).toHaveBeenCalledWith({ mode: 'dark', effective: 'dark' })

    setMode('blue') // 非法值归一 auto，不写坏值进存储
    expect(mode.value).toBe('auto')
    expect(dataset.theme).toBe('light')

    setMode('auto') // 还原单例，避免影响其他用例
  })

  it('initTheme：首次应用、系统偏好变化仅 auto 跟随、storage 跨窗口同步、幂等', () => {
    const dataset = {}
    const themeApplied = vi.fn(() => Promise.resolve())
    const handlers = {}
    const mqHandlers = {}
    const mq = { matches: true, addEventListener: (t, h) => (mqHandlers[t] = h) }
    const windowAdd = vi.fn((type, h) => (handlers[type] = h))
    vi.stubGlobal('document', { documentElement: { dataset } })
    vi.stubGlobal('window', {
      matchMedia: () => mq,
      addEventListener: windowAdd,
      electronAPI: { themeApplied }
    })

    initTheme()
    // 首次应用：系统深色（mq.matches=true）+ auto → dark
    expect(dataset.theme).toBe('dark')

    // 系统切浅色：auto 模式即时重算
    mqHandlers.change({ matches: false })
    expect(dataset.theme).toBe('light')

    // 强制 dark 模式下系统变化不重算（Electron themeSource 已钉住媒体查询）
    setMode('dark')
    mqHandlers.change({ matches: false })
    expect(dataset.theme).toBe('dark')
    setMode('auto')

    // 其他窗口改偏好：storage 事件只认本 key，坏值归一
    handlers.storage({ key: 'other-key', newValue: 'dark' })
    expect(mode.value).toBe('auto')
    handlers.storage({ key: STORAGE_KEY, newValue: 'light' })
    expect(mode.value).toBe('light')
    handlers.storage({ key: STORAGE_KEY, newValue: 'blue' })
    expect(mode.value).toBe('auto')

    // 幂等：HMR/重复调用不叠加监听
    const callsAfterInit = windowAdd.mock.calls.length
    initTheme()
    expect(windowAdd.mock.calls.length).toBe(callsAfterInit)
  })
})
