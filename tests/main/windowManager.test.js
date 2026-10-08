import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: Object.assign(vi.fn(), { getAllWindows: vi.fn(() => []) }),
  Menu: { setApplicationMenu: vi.fn() },
  shell: { openExternal: vi.fn() },
  nativeTheme: { themeSource: 'system' },
  app: { getLocale: vi.fn(() => 'zh-CN') }
}))

import { nativeTheme, BrowserWindow } from 'electron'
import {
  applyTheme,
  enterChartMode,
  exitChartMode,
  enterWorldMode,
  exitWorldMode,
  setWindowTitle,
  createChartWindow,
  takePendingChart,
  setRecordingLock
} from '../../src/main/windowManager'
import { IPC } from '../../src/shared/ipc-channels'

/** 造一个 fake BrowserWindow，带图表模式进入/退出用到的方法。
 *  webContents 用真实的事件登记实现（而非 vi.fn 空壳）：生产代码里
 *  enterChartMode 的崩溃兜底挂在 webContents 上、createWindow 的同款兜底
 *  也挂它——空壳会把「挂错对象」这类错误契约放过去。 */
const fakeWindow = (overrides = {}) => {
  const wcListeners = new Map()
  return {
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
    webContents: {
      id: 1,
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      on: (evt, h) => {
        if (!wcListeners.has(evt)) wcListeners.set(evt, new Set())
        wcListeners.get(evt).add(h)
        return undefined
      },
      removeListener: (evt, h) => {
        wcListeners.get(evt)?.delete(h)
        return undefined
      },
      listenerCount: (evt) => wcListeners.get(evt)?.size ?? 0
    },
    ...overrides
  }
}

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
  // 注：原生标题栏配色随主题/页面切换的联动测试已随 titleBarOverlay
  // 机制移除（窗口控制按钮改由渲染层自绘，主题随 CSS 变量自动切换）
})

describe('createChartWindow / takePendingChart：新窗口图表暂存', () => {
  /** 造一个能走完 createWindow 全流程的独立 fake（含 setWindowOpenHandler 等缺省方法） */
  const makeChartWindow = (id) => ({
    id,
    on: vi.fn(),
    isDestroyed: vi.fn(() => false),
    show: vi.fn(),
    loadFile: vi.fn(),
    loadURL: vi.fn(),
    webContents: {
      id,
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      openDevTools: vi.fn()
    }
  })

  it('未知 webContentsId 取值为 null（不抛错）', () => {
    expect(takePendingChart(99999)).toBeNull()
  })

  it('创建即暂存，渲染端取后即清；生产模式 loadFile + hash 直达图表页', () => {
    // createWindow 走 new BrowserWindow()：mock 须是可 new 的构造器
    // （构造函数返回对象时 new 表达式取该对象）
    BrowserWindow.mockImplementation(function () {
      return makeChartWindow(101)
    })
    const win = createChartWindow({ content: '{"nodes":[]}', path: 'C:/a.xk' })

    expect(win.webContents.id).toBe(101)
    // 测试进程无 ELECTRON_RENDERER_URL → 走 loadFile + { hash: 'chart' }
    expect(win.loadFile).toHaveBeenCalledWith(expect.stringContaining('index.html'), {
      hash: 'chart'
    })
    expect(takePendingChart(101)).toEqual({ content: '{"nodes":[]}', path: 'C:/a.xk' })
    expect(takePendingChart(101)).toBeNull() // 取后即清：ChartView 挂载只装一次
  })

  it('缺省 path 为空串（新图表走另存为）', () => {
    BrowserWindow.mockImplementation(function () {
      return makeChartWindow(102)
    })
    createChartWindow({ content: '{}' })
    expect(takePendingChart(102)).toEqual({ content: '{}', path: '' })
  })

  it('窗口 closed 即清暂存（防 Map 泄漏），其他窗口暂存不受影响', () => {
    const closedHandlers = []
    const withClosedCapture = (id) => {
      const win = makeChartWindow(id)
      win.on = vi.fn((evt, h) => {
        if (evt === 'closed') closedHandlers.push(h)
      })
      return win
    }

    BrowserWindow.mockImplementation(function () {
      return withClosedCapture(201)
    })
    createChartWindow({ content: 'a', path: 'a.xk' })
    BrowserWindow.mockImplementation(function () {
      return withClosedCapture(202)
    })
    createChartWindow({ content: 'b', path: 'b.xk' })

    // 窗口 201 销毁：只清自己的暂存
    closedHandlers[0]()
    expect(takePendingChart(201)).toBeNull()
    expect(takePendingChart(202)).toEqual({ content: 'b', path: 'b.xk' })
  })

  it('渲染进程崩溃（render-process-gone）即解锁并清登记（防锁残留）', () => {
    const wcHandlers = {}
    const win = {
      ...makeChartWindow(306),
      setMaximizable: vi.fn(),
      setMinimizable: vi.fn(),
      setResizable: vi.fn()
    }
    win.webContents.on = vi.fn((evt, h) => {
      wcHandlers[evt] = h
    })
    BrowserWindow.mockImplementation(function () {
      return win
    })
    createChartWindow({ content: '{}', path: '' })
    setRecordingLock(win, true)
    vi.clearAllMocks()
    wcHandlers['render-process-gone']()
    expect(win.setResizable).toHaveBeenCalledWith(true)
    expect(win.setMaximizable).toHaveBeenCalledWith(true)
    expect(win.setMinimizable).toHaveBeenCalledWith(true)
    // 登记已清：未锁时解锁为空操作（不再碰窗口）
    vi.clearAllMocks()
    setRecordingLock(win, false)
    expect(win.setResizable).not.toHaveBeenCalled()
  })
})

describe('enterChartMode：关窗拦截的崩溃兜底', () => {
  /** 分类记录监听器：winHandlers 只收挂在窗口本体上的，wcHandlers 收
   *  webContents 上的（fakeWindow 的 webContents 已实现真实事件登记，
   *  这里在它之上再记一份按事件名索引的引用以便断言挂载目标） */
  const trackedWindow = (id) => {
    const winHandlers = {}
    const wcHandlers = {}
    const win = fakeWindow({
      // 窗口 id 也要唯一：chartModeWindows 是模块级 Map，fakeWindow 默认
      // id=1 会让「已进入图表模式」的幂等守卫直接 return（同名用例互相干扰）
      id,
      on: vi.fn((evt, h) => {
        winHandlers[evt] = h
      }),
      removeListener: vi.fn((evt) => {
        delete winHandlers[evt]
      })
    })
    win.webContents.id = id
    const realWcOn = win.webContents.on
    const realWcOff = win.webContents.removeListener
    win.webContents.on = (evt, h) => {
      wcHandlers[evt] = h
      return realWcOn(evt, h)
    }
    win.webContents.removeListener = (evt, h) => {
      delete wcHandlers[evt]
      return realWcOff(evt, h)
    }
    return { win, winHandlers, wcHandlers }
  }

  it('render-process-gone 兜底挂在 webContents 上（BrowserWindow 不转发该事件）', () => {
    // 挂到 BrowserWindow 上是死代码：崩溃后无人响应 request-close，关窗
    // 拦截永不解除，窗口永远关不掉（点 X/Alt+F4 只对已死的 webContents
    // 发消息）。断言挂载目标而非只断言行为——旧用例用 vi.fn() 收任意事件名，
    // 恰好把这个错误契约放过去了
    const { win, winHandlers, wcHandlers } = trackedWindow(401)
    enterChartMode(win)

    expect(typeof wcHandlers['render-process-gone']).toBe('function')
    expect(winHandlers['render-process-gone']).toBeUndefined()
    // 关闭拦截与假死兜底仍在窗口本体上（它们是 BrowserWindow 事件）
    expect(typeof winHandlers['close']).toBe('function')
    expect(typeof winHandlers['unresponsive']).toBe('function')
    expect(typeof winHandlers['responsive']).toBe('function')
  })

  it('崩溃兜底解除关窗拦截：窗口可被关闭', () => {
    const { win, winHandlers, wcHandlers } = trackedWindow(402)
    enterChartMode(win)
    expect(winHandlers['close']).toBeDefined()

    wcHandlers['render-process-gone']()

    // 拦截已摘：不再对已死的渲染进程发 request-close
    expect(winHandlers['close']).toBeUndefined()
    expect(win.webContents.send).not.toHaveBeenCalledWith(IPC.APP_REQUEST_CLOSE)
    // 再走 exitChartMode 不抛（登记已清，空操作）
    expect(() => exitChartMode(win)).not.toThrow()
  })

  it('exitChartMode 从 webContents 摘掉崩溃兜底（对称，防重入叠加）', () => {
    const { win, wcHandlers } = trackedWindow(403)
    enterChartMode(win)
    expect(wcHandlers['render-process-gone']).toBeDefined()

    exitChartMode(win)

    expect(wcHandlers['render-process-gone']).toBeUndefined()
  })
})

describe('setRecordingLock：录制期间冻结窗口尺寸', () => {
  // recordingLocked 是模块级 Map 且 vi.clearAllMocks() 清不掉（同
  // chartModeWindows 惯例）——各用例独立 webContents.id 隔离
  const recWindow = (id, overrides = {}) =>
    fakeWindow({
      webContents: { id, send: vi.fn(), isDestroyed: vi.fn(() => false) },
      ...overrides
    })

  it('加锁冻结三态（resizable/maximizable/minimizable），不动尺寸', () => {
    const win = recWindow(301)
    setRecordingLock(win, true)
    expect(win.setResizable).toHaveBeenCalledWith(false)
    expect(win.setMaximizable).toHaveBeenCalledWith(false)
    expect(win.setMinimizable).toHaveBeenCalledWith(false)
    expect(win.setSize).not.toHaveBeenCalled()
    expect(win.setMinimumSize).not.toHaveBeenCalled()
    setRecordingLock(win, false) // 收尾解锁，防残留进后续用例
  })

  it('解锁恢复三态为 true（录制只在图表页发生，解锁即回图表模式态）', () => {
    const win = recWindow(302)
    setRecordingLock(win, true)
    vi.clearAllMocks()
    setRecordingLock(win, false)
    expect(win.setResizable).toHaveBeenCalledWith(true)
    expect(win.setMaximizable).toHaveBeenCalledWith(true)
    expect(win.setMinimizable).toHaveBeenCalledWith(true)
  })

  it('重复加锁幂等（不重复 set）', () => {
    const win = recWindow(303)
    setRecordingLock(win, true)
    vi.clearAllMocks()
    setRecordingLock(win, true)
    expect(win.setResizable).not.toHaveBeenCalled()
    setRecordingLock(win, false)
  })

  it('未锁时解锁为空操作（不碰窗口）', () => {
    const win = recWindow(304)
    setRecordingLock(win, false)
    expect(win.setResizable).not.toHaveBeenCalled()
  })

  it('窗口销毁/无效时直接返回不抛错', () => {
    const win = recWindow(305, { isDestroyed: vi.fn(() => true) })
    expect(() => setRecordingLock(win, true)).not.toThrow()
    expect(win.setResizable).not.toHaveBeenCalled()
    expect(() => setRecordingLock(null, true)).not.toThrow()
  })
})
