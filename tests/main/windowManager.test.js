import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  Menu: { setApplicationMenu: vi.fn() },
  shell: { openExternal: vi.fn() }
}))

import { enterChartMode, exitChartMode } from '../../src/main/windowManager'

/** 造一个 fake BrowserWindow，带图表模式进入/退出用到的方法 */
const fakeWindow = (overrides = {}) => ({
  id: 1,
  on: vi.fn(),
  removeListener: vi.fn(),
  isDestroyed: vi.fn(() => false),
  setMaximizable: vi.fn(),
  setMinimizable: vi.fn(),
  setResizable: vi.fn(),
  setMinimumSize: vi.fn(),
  setSize: vi.fn(),
  unmaximize: vi.fn(),
  webContents: { id: 1 },
  ...overrides
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('exitChartMode：对称恢复', () => {
  it('退出图表模式时取消最大化、回退最小尺寸并恢复默认 900x670', () => {
    const win = fakeWindow()
    enterChartMode(win)
    exitChartMode(win)
    expect(win.unmaximize).toHaveBeenCalledTimes(1)
    expect(win.setMinimumSize).toHaveBeenCalledWith(0, 0)
    expect(win.setSize).toHaveBeenCalledWith(900, 670)
  })

  it('先 unmaximize 再 setSize（最大化中的窗口直接 setSize 不生效）', () => {
    const order = []
    const win = fakeWindow({
      unmaximize: vi.fn(() => order.push('unmaximize')),
      setMinimumSize: vi.fn(() => order.push('setMinimumSize')),
      setSize: vi.fn(() => order.push('setSize'))
    })
    enterChartMode(win)
    exitChartMode(win)
    expect(order.indexOf('unmaximize')).toBeLessThan(order.indexOf('setSize'))
  })

  it('未进入图表模式时 exitChartMode 为空操作，不碰窗口', () => {
    const win = fakeWindow()
    exitChartMode(win)
    expect(win.unmaximize).not.toHaveBeenCalled()
    expect(win.setSize).not.toHaveBeenCalled()
  })

  it('窗口已销毁时直接返回，不抛异常也不碰窗口', () => {
    const win = fakeWindow({ isDestroyed: vi.fn(() => true) })
    enterChartMode(win)
    expect(() => exitChartMode(win)).not.toThrow()
    expect(win.setSize).not.toHaveBeenCalled()
  })
})
