import { describe, it, expect, vi } from 'vitest'
import {
  STORAGE_KEY,
  loadOverrides,
  mergeBindings,
  bindings,
  setBinding,
  resetBinding,
  resetAll,
  isCustomized,
  initKeybindingSync
} from '../../src/renderer/src/store/keybindingStore'
import { DEFAULT_BINDINGS } from '../../src/renderer/src/utils/keybindings'

// node 测试环境无 localStorage：模块加载的读取经 try-catch 回落空覆盖，
// 写入的持久化也被 try-catch 吞掉（themeStore 同款惯例），内存态照常可测

describe('loadOverrides：存储原文 → 合法覆盖表', () => {
  it('null / 坏 JSON / 非对象 → 空覆盖（回落默认）', () => {
    expect(loadOverrides(null)).toEqual({})
    expect(loadOverrides('not json')).toEqual({})
    expect(loadOverrides('"str"')).toEqual({})
    expect(loadOverrides('[1,2]')).toEqual({})
  })
  it('非法绑定与未知键位丢弃，合法项保留', () => {
    const raw = JSON.stringify({
      save: { modifiers: ['primary'], key: 'k' },
      undo: { modifiers: ['ctrl'], key: 'z' }, // 越界修饰键
      redo: { modifiers: ['primary'] }, // 缺 key
      delete: { modifiers: [], key: 'x' },
      nope: { modifiers: [], key: 'q' } // 未知键位
    })
    expect(loadOverrides(raw)).toEqual({
      save: { modifiers: ['primary'], key: 'k' },
      delete: { modifiers: [], key: 'x' }
    })
  })
  it('手改乱序 modifiers 规范化为 primary→shift→alt 顺序（文案拼接稳定）', () => {
    const raw = JSON.stringify({ save: { modifiers: ['shift', 'primary'], key: 's' } })
    expect(loadOverrides(raw)).toEqual({ save: { modifiers: ['primary', 'shift'], key: 's' } })
  })
})

describe('mergeBindings：生效视图 = 默认 ⊕ 覆盖', () => {
  it('空覆盖即全默认；只覆盖出现过的键位', () => {
    expect(mergeBindings({})).toEqual(DEFAULT_BINDINGS)
    const merged = mergeBindings({ delete: { modifiers: [], key: 'x' } })
    expect(merged.delete).toEqual({ modifiers: [], key: 'x' })
    expect(merged.save).toEqual(DEFAULT_BINDINGS.save)
  })
})

describe('store 单例（内存态；node 环境持久化被吞不影响）', () => {
  it('setBinding 生效并点亮 isCustomized；resetBinding / resetAll 回落', () => {
    expect(isCustomized('delete')).toBe(false)
    setBinding('delete', { modifiers: [], key: 'x' })
    expect(bindings.value.delete).toEqual({ modifiers: [], key: 'x' })
    expect(isCustomized('delete')).toBe(true)
    resetBinding('delete')
    expect(isCustomized('delete')).toBe(false)
    setBinding('delete', { modifiers: [], key: 'x' })
    setBinding('save', { modifiers: ['primary'], key: 'k' })
    resetAll()
    expect(bindings.value).toEqual(DEFAULT_BINDINGS)
    expect(isCustomized('save')).toBe(false)
  })
  it('setBinding 拒绝未知键位与非法绑定（静默不变）', () => {
    const before = JSON.stringify(bindings.value)
    setBinding('nope', { modifiers: [], key: 'q' })
    setBinding('save', { modifiers: ['ctrl'], key: 'z' })
    expect(JSON.stringify(bindings.value)).toBe(before)
  })
})

describe('STORAGE_KEY', () => {
  it('固定为 xk-keybindings', () => {
    expect(STORAGE_KEY).toBe('xk-keybindings')
  })
})

describe('initKeybindingSync：跨窗口 storage 跟随', () => {
  it('其他窗口改键本窗口跟随（key 匹配才应用、坏值回落默认），幂等不叠加监听', () => {
    const handlers = {}
    const windowAdd = vi.fn((type, h) => (handlers[type] = h))
    vi.stubGlobal('window', { addEventListener: windowAdd })

    initKeybindingSync()

    // 其他窗口存了 save 覆盖：本窗口生效视图即时跟随
    handlers.storage({
      key: STORAGE_KEY,
      newValue: JSON.stringify({ save: { modifiers: [], key: 'j' } })
    })
    expect(bindings.value.save).toEqual({ modifiers: [], key: 'j' })
    expect(isCustomized('save')).toBe(true)

    // 非本 key 的 storage 事件忽略
    handlers.storage({
      key: 'other-key',
      newValue: JSON.stringify({ save: { modifiers: [], key: 'z' } })
    })
    expect(bindings.value.save.key).toBe('j')

    // 坏 JSON 覆盖 → 全量回落默认（loadOverrides 语义）
    handlers.storage({ key: STORAGE_KEY, newValue: 'notjson' })
    expect(isCustomized('save')).toBe(false)

    // 幂等：重复调用不再注册监听
    const callsAfterInit = windowAdd.mock.calls.length
    initKeybindingSync()
    expect(windowAdd.mock.calls.length).toBe(callsAfterInit)

    resetAll()
    vi.unstubAllGlobals()
  })
})
