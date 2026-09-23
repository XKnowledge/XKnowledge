import { describe, it, expect } from 'vitest'
import {
  normalizeMode,
  resolveEffective,
  THEME_MODES
} from '../../src/renderer/src/store/themeStore'

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
