import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BINDINGS,
  KEYBINDING_IDS,
  ACTION_NAMES,
  isValidBinding,
  normalizeRecordedEvent,
  matchEvent,
  bindingEquals,
  findConflict,
  formatBindingLabel,
  validateRecording
} from '../../src/renderer/src/utils/keybindings'

describe('DEFAULT_BINDINGS：5 键位默认值', () => {
  it('save/undo/redo/search 带 primary，delete 裸键', () => {
    expect(DEFAULT_BINDINGS).toEqual({
      save: { modifiers: ['primary'], key: 's' },
      undo: { modifiers: ['primary'], key: 'z' },
      redo: { modifiers: ['primary'], key: 'y' },
      delete: { modifiers: [], key: 'delete' },
      search: { modifiers: ['primary'], key: 'f' }
    })
  })
  it('KEYBINDING_IDS 与 ACTION_NAMES 覆盖同一组键位', () => {
    expect(KEYBINDING_IDS).toEqual(['save', 'undo', 'redo', 'delete', 'search'])
    expect(Object.keys(ACTION_NAMES)).toEqual(KEYBINDING_IDS)
  })
})

describe('isValidBinding：schema 校验', () => {
  it('合法绑定通过（含空 modifiers 与裸键）', () => {
    expect(isValidBinding({ modifiers: [], key: 'delete' })).toBe(true)
    expect(isValidBinding({ modifiers: ['primary', 'shift'], key: 's' })).toBe(true)
  })
  it('非对象 / 缺字段 / 越界修饰键 / 重复修饰键 / 空 key 拒绝', () => {
    expect(isValidBinding(null)).toBe(false)
    expect(isValidBinding('ctrl+s')).toBe(false)
    expect(isValidBinding({ key: 's' })).toBe(false)
    expect(isValidBinding({ modifiers: ['ctrl'], key: 's' })).toBe(false)
    expect(isValidBinding({ modifiers: ['shift', 'shift'], key: 's' })).toBe(false)
    expect(isValidBinding({ modifiers: [], key: '' })).toBe(false)
    expect(isValidBinding({ modifiers: [], key: 123 })).toBe(false)
  })
})

describe('normalizeRecordedEvent：录制归一', () => {
  it('Ctrl 与 ⌘(Meta) 都归一为 primary（双平台双收惯例）', () => {
    expect(normalizeRecordedEvent({ ctrlKey: true, key: 'S' })).toEqual({
      modifiers: ['primary'],
      key: 's'
    })
    expect(normalizeRecordedEvent({ metaKey: true, key: 's' })).toEqual({
      modifiers: ['primary'],
      key: 's'
    })
  })
  it('大写字母小写归一；shift/alt 修饰收集且顺序固定', () => {
    expect(normalizeRecordedEvent({ ctrlKey: true, shiftKey: true, key: 'S' })).toEqual({
      modifiers: ['primary', 'shift'],
      key: 's'
    })
    expect(normalizeRecordedEvent({ altKey: true, key: 'q' })).toEqual({
      modifiers: ['alt'],
      key: 'q'
    })
  })
  it('单按修饰键返回 null（继续等待组合，不算录制结果）', () => {
    expect(normalizeRecordedEvent({ ctrlKey: true, key: 'Control' })).toBeNull()
    expect(normalizeRecordedEvent({ shiftKey: true, key: 'Shift' })).toBeNull()
    expect(normalizeRecordedEvent({ key: 'Meta' })).toBeNull()
  })
  it('Shift+符号键按 e.key 归一（Shift+1 录成 ! + shift）', () => {
    expect(normalizeRecordedEvent({ shiftKey: true, key: '!' })).toEqual({
      modifiers: ['shift'],
      key: '!'
    })
  })
})

describe('matchEvent：精确匹配判定', () => {
  it('primary 双收：Ctrl 或 Meta 任一都匹配默认 save', () => {
    const b = DEFAULT_BINDINGS.save
    expect(matchEvent({ ctrlKey: true, key: 's' }, b)).toBe(true)
    expect(matchEvent({ metaKey: true, key: 's' }, b)).toBe(true)
  })
  it('绑定未列的修饰键按下则不匹配（Ctrl+Shift+S 不触发 Ctrl+S）', () => {
    expect(matchEvent({ ctrlKey: true, shiftKey: true, key: 's' }, DEFAULT_BINDINGS.save)).toBe(
      false
    )
  })
  it('列出的修饰键未按下则不匹配', () => {
    expect(matchEvent({ key: 's' }, DEFAULT_BINDINGS.save)).toBe(false)
    expect(matchEvent({ shiftKey: true, key: 's' }, DEFAULT_BINDINGS.save)).toBe(false)
  })
  it('裸键绑定：无修饰精确（Delete 默认）', () => {
    expect(matchEvent({ key: 'Delete' }, DEFAULT_BINDINGS.delete)).toBe(true)
    expect(matchEvent({ ctrlKey: true, key: 'Delete' }, DEFAULT_BINDINGS.delete)).toBe(false)
    expect(matchEvent({ key: 'x' }, DEFAULT_BINDINGS.delete)).toBe(false)
  })
  it('key 不匹配直接 false', () => {
    expect(matchEvent({ ctrlKey: true, key: 'x' }, DEFAULT_BINDINGS.save)).toBe(false)
  })
})

describe('bindingEquals：组合相等（与 modifiers 顺序无关）', () => {
  it('手改存储乱序仍视为同一绑定', () => {
    expect(
      bindingEquals(
        { modifiers: ['shift', 'primary'], key: 's' },
        { modifiers: ['primary', 'shift'], key: 's' }
      )
    ).toBe(true)
    expect(
      bindingEquals({ modifiers: ['primary'], key: 's' }, { modifiers: ['primary'], key: 'z' })
    ).toBe(false)
    expect(bindingEquals({ modifiers: [] }, { modifiers: ['shift'] })).toBe(false)
  })
})

describe('findConflict：冲突检测', () => {
  it('撞车返回占用者 id；自身跳过；无冲突 null', () => {
    const bindings = { ...DEFAULT_BINDINGS }
    expect(findConflict(bindings, 'undo', { modifiers: ['primary'], key: 's' })).toBe('save')
    expect(findConflict(bindings, 'save', { modifiers: ['primary'], key: 's' })).toBeNull()
    expect(findConflict(bindings, 'save', { modifiers: ['primary', 'shift'], key: 's' })).toBeNull()
  })
})

describe('formatBindingLabel：显示文案', () => {
  it('primary 按平台渲染 Ctrl / ⌘', () => {
    expect(formatBindingLabel(DEFAULT_BINDINGS.save, false)).toBe('Ctrl+S')
    expect(formatBindingLabel(DEFAULT_BINDINGS.save, true)).toBe('⌘+S')
  })
  it('组合与裸键', () => {
    expect(formatBindingLabel({ modifiers: ['primary', 'shift'], key: 's' }, false)).toBe(
      'Ctrl+Shift+S'
    )
    expect(formatBindingLabel({ modifiers: ['alt'], key: 'q' }, false)).toBe('Alt+Q')
    expect(formatBindingLabel(DEFAULT_BINDINGS.delete, false)).toBe('Delete')
  })
  it('特殊键名映射：空格/箭头/F 区/Backspace', () => {
    expect(formatBindingLabel({ modifiers: [], key: ' ' }, false)).toBe('Space')
    expect(formatBindingLabel({ modifiers: [], key: 'arrowup' }, false)).toBe('↑')
    expect(formatBindingLabel({ modifiers: [], key: 'f5' }, false)).toBe('F5')
    expect(formatBindingLabel({ modifiers: [], key: 'backspace' }, false)).toBe('Backspace')
  })
})

describe('validateRecording：录制结果校验', () => {
  it('黑名单：Esc / Tab / F5 / primary+R（主进程防刷新拦截）', () => {
    expect(validateRecording('save', { modifiers: [], key: 'escape' })).toContain('Esc')
    expect(validateRecording('save', { modifiers: [], key: 'tab' })).toContain('Tab')
    expect(validateRecording('save', { modifiers: [], key: 'f5' })).toContain('F5')
    expect(validateRecording('save', { modifiers: ['primary'], key: 'r' })).toContain('R')
    expect(validateRecording('save', { modifiers: ['primary', 'shift'], key: 'r' })).toContain('R')
  })
  it('search 裸键拒绝（无输入框守卫，裸键打断打字）', () => {
    expect(validateRecording('search', { modifiers: [], key: 'g' })).toContain('修饰键')
    expect(validateRecording('search', { modifiers: ['primary'], key: 'g' })).toBeNull()
  })
  it('其余键位裸键放行（有 isTypingContext 守卫兜底）', () => {
    expect(validateRecording('delete', { modifiers: [], key: 'x' })).toBeNull()
    expect(validateRecording('save', { modifiers: [], key: 'b' })).toBeNull()
  })
})
