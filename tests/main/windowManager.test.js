import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: Object.assign(vi.fn(), { getAllWindows: vi.fn(() => []) }),
  Menu: { setApplicationMenu: vi.fn() },
  shell: { openExternal: vi.fn() },
  nativeTheme: { themeSource: 'system' }
}))

import { BrowserWindow, nativeTheme } from 'electron'
import {
  applyTheme,
  enterChartMode,
  exitChartMode,
  enterWorldMode,
  exitWorldMode,
  setWindowTitle,
  setOverlayDimmed
} from '../../src/main/windowManager'
import { IPC } from '../../src/shared/ipc-channels'

/** 造一个 fake BrowserWindow，带图表模式进入/退出用到的方法 */
const fakeWindow = (overrides = {}) => ({
  id: 1,
  on: vi.fn(),
  once: vi.fn(),
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

describe('世界树模式：仅解锁尺寸', () => {
  // worldModeWindows 同为模块级 Map，各用例用独立 id 隔离（同图表模式标题组惯例）
  it('enterWorldMode 解锁最大化/最小化/缩放并设最小尺寸', () => {
    const win = fakeWindow({ id: 10 })
    enterWorldMode(win)
    expect(win.setMaximizable).toHaveBeenCalledWith(true)
    expect(win.setMinimizable).toHaveBeenCalledWith(true)
    expect(win.setResizable).toHaveBeenCalledWith(true)
    expect(win.setMinimumSize).toHaveBeenCalledWith(900, 670)
  })

  it('与图表模式的差异：不注册 close 拦截、不改窗口标题（只读页无未保存态）', () => {
    const win = fakeWindow({ id: 11 })
    enterWorldMode(win)
    expect(win.on).not.toHaveBeenCalledWith('close', expect.anything())
    expect(win.setTitle).not.toHaveBeenCalled()
  })

  it('exitWorldMode 对称恢复：锁回三项并取消最大化、恢复默认 900x670', () => {
    const win = fakeWindow({ id: 12 })
    enterWorldMode(win)
    exitWorldMode(win)
    expect(win.setMaximizable).toHaveBeenCalledWith(false)
    expect(win.setMinimizable).toHaveBeenCalledWith(false)
    expect(win.setResizable).toHaveBeenCalledWith(false)
    expect(win.unmaximize).toHaveBeenCalledTimes(1)
    expect(win.setMinimumSize).toHaveBeenCalledWith(0, 0)
    expect(win.setSize).toHaveBeenCalledWith(900, 670)
  })

  it('未进入世界树模式时 exitWorldMode 为空操作，不碰窗口', () => {
    const win = fakeWindow({ id: 13 })
    exitWorldMode(win)
    expect(win.unmaximize).not.toHaveBeenCalled()
    expect(win.setSize).not.toHaveBeenCalled()
  })

  it('重复 enter 幂等：closed 清理器只注册一次', () => {
    const win = fakeWindow({ id: 14 })
    enterWorldMode(win)
    enterWorldMode(win)
    const closedCalls = win.on.mock.calls.filter(([evt]) => evt === 'closed')
    expect(closedCalls).toHaveLength(1)
  })

  it('窗口已销毁时 enter 后 exit 不抛异常', () => {
    const win = fakeWindow({ id: 15, isDestroyed: vi.fn(() => true) })
    enterWorldMode(win)
    expect(() => exitWorldMode(win)).not.toThrow()
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
    setWindowTitle(win, '金融 • — XKnowledge', '• 金融 — XKnowledge')
    expect(win.setTitle).toHaveBeenCalledWith('• 金融 — XKnowledge')
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.APP_TITLE_CHANGED, '金融 • — XKnowledge')
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

describe('applyTheme：主题上报联动', () => {
  it('设 nativeTheme.themeSource：auto→system，强制模式直译', () => {
    applyTheme({ mode: 'auto', effective: 'light' })
    expect(nativeTheme.themeSource).toBe('system')
    applyTheme({ mode: 'dark', effective: 'dark' })
    expect(nativeTheme.themeSource).toBe('dark')
    applyTheme({ mode: 'light', effective: 'light' })
    expect(nativeTheme.themeSource).toBe('light')
  })

  it('遍历所有窗口，深色换深底原生标题栏', () => {
    // id 独立隔离：默认 id:1 已残留在 chartModeWindows（模块级 Map 跨用例
    // 存留），按页面选色会被判为图表窗口而取布局底配色
    const win = fakeWindow({ id: 30, setTitleBarOverlay: vi.fn() })
    BrowserWindow.getAllWindows.mockReturnValue([win])
    applyTheme({ mode: 'dark', effective: 'dark' })
    expect(win.setTitleBarOverlay).toHaveBeenCalledWith({
      color: '#141414',
      symbolColor: '#a1a8b0'
    })
  })

  it('浅色恢复白底标题栏（与创建时配置一致）', () => {
    const win = fakeWindow({ id: 31, setTitleBarOverlay: vi.fn() })
    BrowserWindow.getAllWindows.mockReturnValue([win])
    applyTheme({ mode: 'light', effective: 'light' })
    expect(win.setTitleBarOverlay).toHaveBeenCalledWith({
      color: '#ffffff',
      symbolColor: '#74b1be'
    })
  })

  it('setTitleBarOverlay 抛错时静默（Linux 等平台不支持）', () => {
    const win = fakeWindow({
      setTitleBarOverlay: vi.fn(() => {
        throw new Error('not supported')
      })
    })
    BrowserWindow.getAllWindows.mockReturnValue([win])
    expect(() => applyTheme({ mode: 'dark', effective: 'dark' })).not.toThrow()
  })

  it('已销毁窗口跳过', () => {
    const win = fakeWindow({
      setTitleBarOverlay: vi.fn(),
      isDestroyed: vi.fn(() => true)
    })
    BrowserWindow.getAllWindows.mockReturnValue([win])
    applyTheme({ mode: 'dark', effective: 'dark' })
    expect(win.setTitleBarOverlay).not.toHaveBeenCalled()
  })
})

describe('标题栏配色随页面切换（图表/世界树页头部为布局底）', () => {
  // 模块级 Map 与 lastEffectiveTheme 均跨用例存留，用例内先显式定主题；
  // getAllWindows 复位为空避免遍历到上一组遗留的窗口桩
  beforeEach(() => {
    BrowserWindow.getAllWindows.mockReturnValue([])
  })

  it('enterChartMode 换布局底配色，exitChartMode 恢复内容底配色（浅色）', () => {
    applyTheme({ mode: 'light', effective: 'light' })
    const win = fakeWindow({ id: 20, setTitleBarOverlay: vi.fn() })
    enterChartMode(win)
    expect(win.setTitleBarOverlay).toHaveBeenLastCalledWith({
      color: '#f5f5f5',
      symbolColor: '#74b1be'
    })
    exitChartMode(win)
    expect(win.setTitleBarOverlay).toHaveBeenLastCalledWith({
      color: '#ffffff',
      symbolColor: '#74b1be'
    })
  })

  it('enterWorldMode / exitWorldMode 同样切换（深色）', () => {
    applyTheme({ mode: 'dark', effective: 'dark' })
    const win = fakeWindow({ id: 21, setTitleBarOverlay: vi.fn() })
    enterWorldMode(win)
    expect(win.setTitleBarOverlay).toHaveBeenLastCalledWith({
      color: '#1f1f1f',
      symbolColor: '#a1a8b0'
    })
    exitWorldMode(win)
    expect(win.setTitleBarOverlay).toHaveBeenLastCalledWith({
      color: '#141414',
      symbolColor: '#a1a8b0'
    })
  })

  it('主题切换时：图表模式窗口用布局底，普通窗口用内容底', () => {
    applyTheme({ mode: 'light', effective: 'light' })
    const chartWin = fakeWindow({ id: 22, setTitleBarOverlay: vi.fn() })
    const homeWin = fakeWindow({ id: 23, setTitleBarOverlay: vi.fn() })
    enterChartMode(chartWin)
    BrowserWindow.getAllWindows.mockReturnValue([chartWin, homeWin])
    applyTheme({ mode: 'dark', effective: 'dark' })
    expect(chartWin.setTitleBarOverlay).toHaveBeenLastCalledWith({
      color: '#1f1f1f',
      symbolColor: '#a1a8b0'
    })
    expect(homeWin.setTitleBarOverlay).toHaveBeenLastCalledWith({
      color: '#141414',
      symbolColor: '#a1a8b0'
    })
  })
})

describe('setOverlayDimmed：模态遮罩期按钮条同步暗化（随 antFadeIn 200ms 线性步进）', () => {
  // 模块级 Map/Set 与 lastEffectiveTheme 跨用例存留，用例内先显式定主题；
  // 步进动画依赖定时器与 Date.now，用假时钟驱动
  beforeEach(() => {
    vi.useFakeTimers()
    BrowserWindow.getAllWindows.mockReturnValue([])
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('暗化按遮罩节奏步进：起始帧不变 → 中间态 → 200ms 后全暗（浅色）', () => {
    applyTheme({ mode: 'light', effective: 'light' })
    const win = fakeWindow({ id: 40, setTitleBarOverlay: vi.fn() })
    setOverlayDimmed(win, true)
    const last = () => win.setTitleBarOverlay.mock.calls.at(-1)?.[0]
    expect(last()).toEqual({ color: '#ffffff', symbolColor: '#74b1be' }) // 起始帧未暗
    vi.advanceTimersByTime(100)
    expect(last().color).not.toBe('#ffffff')
    expect(last().color).not.toBe('#8c8c8c') // 半程中间态
    expect(win.setTitleBarOverlay.mock.calls.length).toBeGreaterThan(3) // 步进非一步到位
    vi.advanceTimersByTime(150)
    expect(last()).toEqual({ color: '#8c8c8c', symbolColor: '#406169' })
  })

  it('关闭对称：200ms 内回到基础配色', () => {
    applyTheme({ mode: 'light', effective: 'light' })
    const win = fakeWindow({ id: 41, setTitleBarOverlay: vi.fn() })
    setOverlayDimmed(win, true)
    vi.advanceTimersByTime(250)
    setOverlayDimmed(win, false)
    vi.advanceTimersByTime(250)
    expect(win.setTitleBarOverlay.mock.calls.at(-1)?.[0]).toEqual({
      color: '#ffffff',
      symbolColor: '#74b1be'
    })
  })

  it('动画中途反向：从当前进度按比例缩短时长回到基础配色', () => {
    applyTheme({ mode: 'light', effective: 'light' })
    const win = fakeWindow({ id: 42, setTitleBarOverlay: vi.fn() })
    setOverlayDimmed(win, true)
    vi.advanceTimersByTime(100) // 半程反向
    setOverlayDimmed(win, false)
    vi.advanceTimersByTime(150)
    expect(win.setTitleBarOverlay.mock.calls.at(-1)?.[0]).toEqual({
      color: '#ffffff',
      symbolColor: '#74b1be'
    })
  })

  it('图表模式窗口暗化到底为布局底暗色（深色）', () => {
    applyTheme({ mode: 'dark', effective: 'dark' })
    const win = fakeWindow({ id: 43, setTitleBarOverlay: vi.fn() })
    enterChartMode(win)
    setOverlayDimmed(win, true)
    vi.advanceTimersByTime(250)
    expect(win.setTitleBarOverlay.mock.calls.at(-1)?.[0]).toEqual({
      color: '#111111',
      symbolColor: '#595c61'
    })
  })

  it('暗化中切主题：随新主题继续暗化', () => {
    applyTheme({ mode: 'light', effective: 'light' })
    const win = fakeWindow({ id: 44, setTitleBarOverlay: vi.fn() })
    setOverlayDimmed(win, true)
    vi.advanceTimersByTime(250)
    BrowserWindow.getAllWindows.mockReturnValue([win])
    applyTheme({ mode: 'dark', effective: 'dark' })
    expect(win.setTitleBarOverlay.mock.calls.at(-1)?.[0]).toEqual({
      color: '#0b0b0b',
      symbolColor: '#595c61'
    })
  })

  it('窗口为空或已销毁时空操作', () => {
    expect(() => setOverlayDimmed(null, true)).not.toThrow()
    const win = fakeWindow({ id: 45, isDestroyed: vi.fn(() => true), setTitleBarOverlay: vi.fn() })
    setOverlayDimmed(win, true)
    expect(win.setTitleBarOverlay).not.toHaveBeenCalled()
  })
})
