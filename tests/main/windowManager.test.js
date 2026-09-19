import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  Menu: { setApplicationMenu: vi.fn() },
  shell: { openExternal: vi.fn() }
}))

import { enterChartMode, exitChartMode, setWindowTitle } from '../../src/main/windowManager'
import { IPC } from '../../src/shared/ipc-channels'

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
  setTitle: vi.fn(),
  unmaximize: vi.fn(),
  webContents: { id: 1, send: vi.fn(), isDestroyed: vi.fn(() => false) },
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

describe('图表模式窗口标题', () => {
  // chartModeWindows 是模块级 Map 且 vi.clearAllMocks() 清不掉，上一组用例
  // （已销毁窗口 enter 后 exit 早退）会残留 id:1 记录；本组各用例用独立 id 隔离
  it('enterChartMode 设「未命名 — XKnowledge」并推送渲染端', () => {
    const win = fakeWindow({ id: 2 })
    enterChartMode(win)
    expect(win.setTitle).toHaveBeenCalledWith('未命名 — XKnowledge')
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.APP_TITLE_CHANGED, '未命名 — XKnowledge')
  })

  it('exitChartMode 恢复「XKnowledge」并推送渲染端', () => {
    const win = fakeWindow({ id: 3 })
    enterChartMode(win)
    exitChartMode(win)
    expect(win.setTitle).toHaveBeenCalledWith('XKnowledge')
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.APP_TITLE_CHANGED, 'XKnowledge')
  })

  it('未进入图表模式时 exitChartMode 不改标题', () => {
    const win = fakeWindow({ id: 4 })
    exitChartMode(win)
    expect(win.setTitle).not.toHaveBeenCalled()
    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('窗口已销毁时 enterChartMode 后 exit 不抛也不恢复标题', () => {
    const win = fakeWindow({ id: 5, isDestroyed: vi.fn(() => true) })
    enterChartMode(win)
    expect(() => exitChartMode(win)).not.toThrow()
    expect(win.setTitle).not.toHaveBeenCalledWith('XKnowledge')
  })
})

describe('setWindowTitle：setTitle + 推送双动作', () => {
  it('同时 setTitle 与向渲染端推送标题', () => {
    const win = fakeWindow()
    setWindowTitle(win, '金融 — XKnowledge')
    expect(win.setTitle).toHaveBeenCalledWith('金融 — XKnowledge')
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.APP_TITLE_CHANGED, '金融 — XKnowledge')
  })

  it('display 与 taskbar 不同时：setTitle 用 taskbar，推送用 display', () => {
    const win = fakeWindow()
    setWindowTitle(win, '金融 ● — XKnowledge', '● 金融 — XKnowledge')
    expect(win.setTitle).toHaveBeenCalledWith('● 金融 — XKnowledge')
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.APP_TITLE_CHANGED, '金融 ● — XKnowledge')
  })

  it('只传 display 时 taskbar 缺省同 display（现状调用不变）', () => {
    const win = fakeWindow()
    setWindowTitle(win, 'XKnowledge')
    expect(win.setTitle).toHaveBeenCalledWith('XKnowledge')
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.APP_TITLE_CHANGED, 'XKnowledge')
  })

  it('窗口为空或已销毁时空操作', () => {
    expect(() => setWindowTitle(null, 'x')).not.toThrow()
    const win = fakeWindow({ isDestroyed: vi.fn(() => true) })
    setWindowTitle(win, 'x')
    expect(win.setTitle).not.toHaveBeenCalled()
  })

  it('webContents 已销毁时跳过推送但 setTitle 仍执行', () => {
    const win = fakeWindow({
      webContents: { id: 1, send: vi.fn(), isDestroyed: vi.fn(() => true) }
    })
    setWindowTitle(win, 'x')
    expect(win.setTitle).toHaveBeenCalledWith('x')
    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})
