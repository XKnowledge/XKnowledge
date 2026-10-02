import { describe, it, expect } from 'vitest'
import {
  shortcutModifierActive,
  linkDragModifierActive,
  marqueeModifierActive,
  modifierKeyLabel
} from '../../src/renderer/src/utils/platformModifier'

// 平台由调用方注入（组件里取 window.electronAPI.platform === 'darwin'），
// 纯函数不耦合浏览器环境，双平台逻辑都能在任意机器上测

describe('shortcutModifierActive（键盘快捷键：全平台 Ctrl/Meta 双收）', () => {
  it('Ctrl 按下即激活（Windows 主路径）', () => {
    expect(shortcutModifierActive({ ctrlKey: true })).toBe(true)
  })

  it('Meta 按下即激活（macOS ⌘ 主路径）', () => {
    expect(shortcutModifierActive({ metaKey: true })).toBe(true)
  })

  it('无修饰键不激活', () => {
    expect(shortcutModifierActive({ ctrlKey: false, metaKey: false })).toBe(false)
  })

  it('shift/alt 不算快捷键修饰', () => {
    expect(shortcutModifierActive({ shiftKey: true, altKey: true })).toBe(false)
  })
})

describe('linkDragModifierActive（建边拖拽：平台分流主修饰键）', () => {
  it('mac：⌘(Meta)+拖激活', () => {
    expect(linkDragModifierActive({ metaKey: true }, true)).toBe(true)
  })

  it('mac：Ctrl+拖不激活——Ctrl 留给系统右键语义（ctrl+click），不建边', () => {
    expect(linkDragModifierActive({ ctrlKey: true }, true)).toBe(false)
  })

  it('Windows/Linux：Ctrl+拖激活', () => {
    expect(linkDragModifierActive({ ctrlKey: true }, false)).toBe(true)
  })

  it('Windows/Linux：Meta(Win 键)+拖不激活，防跨平台串台', () => {
    expect(linkDragModifierActive({ metaKey: true }, false)).toBe(false)
  })

  it('无修饰键两平台都不激活', () => {
    expect(linkDragModifierActive({}, true)).toBe(false)
    expect(linkDragModifierActive({}, false)).toBe(false)
  })
})

describe('marqueeModifierActive（框选拖拽：全平台统一 Shift，无平台分流）', () => {
  it('Shift+拖激活（双平台同键）', () => {
    expect(marqueeModifierActive({ shiftKey: true })).toBe(true)
  })

  it('Ctrl/Meta/Alt+拖不激活——只认 Shift，不与连线手势/快捷键修饰串台', () => {
    expect(marqueeModifierActive({ ctrlKey: true })).toBe(false)
    expect(marqueeModifierActive({ metaKey: true })).toBe(false)
    expect(marqueeModifierActive({ altKey: true })).toBe(false)
  })

  it('无修饰键不激活', () => {
    expect(marqueeModifierActive({})).toBe(false)
  })
})

describe('modifierKeyLabel（文案：提示条/菜单快捷键表的平台显示名）', () => {
  it('mac 显示 ⌘', () => {
    expect(modifierKeyLabel(true)).toBe('⌘')
  })

  it('其他平台显示 Ctrl', () => {
    expect(modifierKeyLabel(false)).toBe('Ctrl')
  })
})
