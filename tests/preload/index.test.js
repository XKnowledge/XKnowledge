import { describe, it, expect, beforeEach, vi } from 'vitest'

// preload 在 import 时即执行 contextBridge.exposeInMainWorld：用 vi.hoisted
// 拿到 mock 侧句柄，捕获暴露出来的 electronAPI 供断言
const bridge = vi.hoisted(() => ({
  exposed: null,
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_key, api) => {
      bridge.exposed = api
    }
  },
  ipcRenderer: {
    invoke: bridge.invoke,
    on: bridge.on,
    removeListener: bridge.removeListener
  }
}))

import '../../src/preload/index.js'
import { IPC } from '../../src/shared/ipc-channels.js'

// 通道名单一处定义（ipc-channels）：preload 桥接面逐一映射，漏一个
// 渲染层调用就是 undefined 报错且只有运行到才暴露——这里静态核对
describe('preload：electronAPI 桥接面 → IPC 通道映射', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('contextBridge 暴露 electronAPI', () => {
    expect(bridge.exposed).toBeTruthy()
  })

  it('platform 暴露 process.platform（XkWindowControls 判 macOS 隐藏自绘关闭钮）', () => {
    expect(bridge.exposed.platform).toBe(process.platform)
  })

  it('请求-响应类 API 逐一走 invoke 对应通道（无参调用不夹带 payload）', () => {
    const { exposed } = bridge
    exposed.openFile()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.FILE_OPEN)

    exposed.listExamples()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.EXAMPLE_LIST)

    exposed.takePendingChart()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_TAKE_PENDING_CHART)

    exposed.enterChartMode()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_ENTER_CHART_MODE)

    exposed.exitChartMode()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_EXIT_CHART_MODE)

    exposed.enterWorldMode()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_ENTER_WORLD_MODE)

    exposed.exitWorldMode()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_EXIT_WORLD_MODE)

    exposed.closeWindow()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_CLOSE_WINDOW)

    exposed.confirmUnsaved()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_CONFIRM_UNSAVED)

    exposed.worldLoadIndex()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.WORLD_LOAD_INDEX)

    exposed.minimizeWindow()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_WINDOW_MINIMIZE)

    exposed.toggleMaximizeWindow()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_WINDOW_MAXIMIZE_TOGGLE)

    exposed.closeWindowRequest()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_CLOSE_WINDOW_REQUEST)

    exposed.readGraphClipboard()
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.CLIPBOARD_READ_GRAPH)
  })

  it('带 payload 的 API 原样透传（参数序列化跨 IPC 边界）', () => {
    const { exposed } = bridge

    const opened = { path: 'C:/a.xk', content: '{}' }
    exposed.fileOpened(opened)
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.FILE_OPENED, opened)

    const dirty = { path: 'C:/a.xk', dirty: true }
    exposed.fileDirty(dirty)
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.FILE_DIRTY, dirty)

    const example = { id: 'finance' }
    exposed.openExample(example)
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.EXAMPLE_OPEN, example)

    const save = { path: 'C:/a.xk', content: '{}' }
    exposed.saveFile(save)
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.FILE_SAVE, save)

    exposed.saveFileAs(save)
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.FILE_SAVE_AS, save)

    const video = { bytes: new Uint8Array([1]), defaultName: 'x.mp4', ext: 'mp4' }
    exposed.saveVideoFile(video)
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.VIDEO_SAVE, video)

    const html = { data: { title: 't', nodes: [] }, defaultName: 't.html' }
    exposed.exportHtmlFile(html)
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.EXPORT_HTML_SAVE, html)

    const newChart = { content: '{}', path: '' }
    exposed.newChartWindow(newChart)
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_NEW_CHART_WINDOW, newChart)

    const theme = { mode: 'dark', effective: 'dark' }
    exposed.themeApplied(theme)
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_THEME_APPLIED, theme)

    exposed.localeApplied({ locale: 'zh-CN' })
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.APP_LOCALE_APPLIED, { locale: 'zh-CN' })

    exposed.worldReadGraph('world-1')
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.WORLD_READ_GRAPH, { id: 'world-1' })

    exposed.worldSetUserDir('D:/graphs')
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.WORLD_SET_USER_DIR, { dir: 'D:/graphs' })

    exposed.writeGraphClipboard('{"app":"xknowledge"}')
    expect(bridge.invoke).toHaveBeenCalledWith(IPC.CLIPBOARD_WRITE_GRAPH, {
      text: '{"app":"xknowledge"}'
    })
  })

  it('主进程推送三件套：注册到对应通道、回调剥掉 event 只传 payload、返回解绑函数', () => {
    const { exposed } = bridge

    // onRequestClose：无 payload，仅通知
    const offClose = exposed.onRequestClose(vi.fn())
    expect(bridge.on).toHaveBeenCalledWith(IPC.APP_REQUEST_CLOSE, expect.any(Function))
    offClose()
    expect(bridge.removeListener).toHaveBeenCalledWith(IPC.APP_REQUEST_CLOSE, expect.any(Function))

    // onTitleChanged：(_event, title) => callback(title)
    const titleCb = vi.fn()
    exposed.onTitleChanged(titleCb)
    const titleListener = bridge.on.mock.calls.find(
      ([channel]) => channel === IPC.APP_TITLE_CHANGED
    )[1]
    titleListener({ sender: {} }, '金融 — XKnowledge')
    expect(titleCb).toHaveBeenCalledWith('金融 — XKnowledge')

    // onMaximizeChanged：(_event, maximized) => callback(maximized)
    const maxCb = vi.fn()
    exposed.onMaximizeChanged(maxCb)
    const maxListener = bridge.on.mock.calls.find(
      ([channel]) => channel === IPC.APP_MAXIMIZE_CHANGED
    )[1]
    maxListener({ sender: {} }, true)
    expect(maxCb).toHaveBeenCalledWith(true)
  })
})
