import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(), fromId: vi.fn() },
  dialog: { showMessageBox: vi.fn() }
}))

vi.mock('../../src/main/fileService', () => ({
  showOpenDialog: vi.fn(),
  readChartFile: vi.fn(),
  saveChartFileAs: vi.fn(),
  writeChartFile: vi.fn()
}))

vi.mock('../../src/main/windowManager', () => ({
  createChartWindow: vi.fn(),
  enterChartMode: vi.fn(),
  exitChartMode: vi.fn(),
  takePendingChart: vi.fn()
}))

import { ipcMain, BrowserWindow } from 'electron'
import * as fileService from '../../src/main/fileService'
import { createChartWindow, takePendingChart } from '../../src/main/windowManager'
import { registerIpc } from '../../src/main/ipc'
import { IPC } from '../../src/shared/ipc-channels'

/** 取指定通道注册的 handler */
const handlerOf = (channel) => {
  const call = ipcMain.handle.mock.calls.find(([ch]) => ch === channel)
  return call?.[1]
}

/** 造一个 fake BrowserWindow */
const fakeWindow = (overrides = {}) => ({
  focus: vi.fn(),
  show: vi.fn(),
  restore: vi.fn(),
  isMinimized: vi.fn(() => false),
  isDestroyed: vi.fn(() => false),
  once: vi.fn(),
  ...overrides
})

const senderOf = (id) => ({ sender: { id } })

beforeEach(() => {
  vi.clearAllMocks()
  registerIpc()
})

describe('FILE_OPEN：同文件聚焦', () => {
  it('文件未被任何窗口打开时正常走 readChartFile', async () => {
    fileService.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/a.xk']
    })
    fileService.readChartFile.mockResolvedValue({ content: '{}', path: 'C:/a.xk' })
    const res = await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(res).toEqual({ content: '{}', path: 'C:/a.xk' })
    expect(fileService.readChartFile).toHaveBeenCalledWith('C:/a.xk')
  })

  it('同一文件已在其他窗口打开时聚焦该窗口并返回 alreadyOpen，不再读取', async () => {
    // 窗口 2 先登记打开了 a.xk
    const holder = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(holder)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/a.xk' })

    // 窗口 1 再打开同一文件
    BrowserWindow.fromId.mockReturnValue(holder)
    fileService.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/a.xk']
    })
    const res = await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(res).toEqual({ alreadyOpen: true })
    expect(holder.focus).toHaveBeenCalled()
    expect(fileService.readChartFile).not.toHaveBeenCalled()
  })

  it('已打开该文件的是当前窗口自己时返回 alreadyOpen，同样置前自己', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    await handlerOf(IPC.FILE_OPENED)(senderOf(1), { path: 'C:/a.xk' })
    BrowserWindow.fromId.mockReturnValue(win)

    fileService.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/a.xk']
    })
    const res = await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(res).toEqual({ alreadyOpen: true })
    expect(win.show).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
    expect(fileService.readChartFile).not.toHaveBeenCalled()
  })

  it('登记的窗口已销毁时清掉陈旧记录，照常读取', async () => {
    BrowserWindow.fromWebContents.mockReturnValue(fakeWindow())
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/a.xk' })

    BrowserWindow.fromId.mockReturnValue(null) // 窗口没了
    fileService.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/a.xk']
    })
    fileService.readChartFile.mockResolvedValue({ content: '{}', path: 'C:/a.xk' })
    const res = await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(res).toEqual({ content: '{}', path: 'C:/a.xk' })
    expect(fileService.readChartFile).toHaveBeenCalled()
  })

  it('最小化的持有窗口先还原再聚焦', async () => {
    const holder = fakeWindow({ isMinimized: vi.fn(() => true) })
    BrowserWindow.fromWebContents.mockReturnValue(holder)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/a.xk' })
    BrowserWindow.fromId.mockReturnValue(holder)
    fileService.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/a.xk']
    })
    await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(holder.restore).toHaveBeenCalled()
    expect(holder.focus).toHaveBeenCalled()
  })
})

describe('FILE_OPENED：文件-窗口登记', () => {
  it('登记 path 并在窗口 closed 后清理对应记录', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/a.xk' })

    // 模拟窗口关闭：触发 once('closed', cb) 注册的回调
    const closedCb = win.once.mock.calls.find(([evt]) => evt === 'closed')?.[1]
    expect(closedCb).toBeTypeOf('function')

    BrowserWindow.fromId.mockReturnValue(null) // 关闭后 fromId 找不到
    fileService.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/a.xk']
    })
    fileService.readChartFile.mockResolvedValue({ content: '{}', path: 'C:/a.xk' })
    closedCb()
    const res = await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(res).toEqual({ content: '{}', path: 'C:/a.xk' }) // 记录已清，正常读取
  })

  it('同一窗口换文件（另存为后）时清掉旧文件记录', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/a.xk' })
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/b.xk' })

    BrowserWindow.fromId.mockReturnValue(win)
    fileService.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/a.xk']
    })
    fileService.readChartFile.mockResolvedValue({ content: '{}', path: 'C:/a.xk' })
    // a.xk 的记录已被 b.xk 覆盖清除（指向窗口 2 的只有 b.xk），应正常读取
    const res = await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(res).toEqual({ content: '{}', path: 'C:/a.xk' })
  })
})

describe('FILE_OPENED：closed 监听器去重', () => {
  it('同一窗口重复上报同一文件（保存成功后）只注册一个 closed 监听器', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    // 渲染端装载文件 + 两次保存成功后的重复上报，共 3 次 file:opened
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/dup-1.xk' })
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/dup-1.xk' })
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/dup-1.xk' })
    const closedCalls = win.once.mock.calls.filter(([evt]) => evt === 'closed')
    expect(closedCalls).toHaveLength(1)
  })

  it('同一窗口换文件（另存为）后同样不重复注册', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/dup-2.xk' })
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/dup-3.xk' })
    const closedCalls = win.once.mock.calls.filter(([evt]) => evt === 'closed')
    expect(closedCalls).toHaveLength(1)
  })

  it('窗口关闭时清理该窗口登记的全部文件记录', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/dup-4.xk' })
    const closedCb = win.once.mock.calls.find(([evt]) => evt === 'closed')?.[1]
    expect(closedCb).toBeTypeOf('function')
    closedCb()

    // fromId 仍返回活窗口：若记录未被 closed 清理，会误走聚焦而非读取
    BrowserWindow.fromId.mockReturnValue(fakeWindow())
    fileService.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:/dup-4.xk'] })
    fileService.readChartFile.mockResolvedValue({ content: '{}', path: 'C:/dup-4.xk' })
    const res = await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(res).toEqual({ content: '{}', path: 'C:/dup-4.xk' })
  })
})

describe('新窗口 pending 数据传递', () => {
  it('APP_NEW_CHART_WINDOW 把 content 与 path 一并交给 createChartWindow', async () => {
    await handlerOf(IPC.APP_NEW_CHART_WINDOW)(senderOf(1), {
      content: '{"series":[]}',
      path: 'C:/a.xk'
    })
    expect(createChartWindow).toHaveBeenCalledWith({ content: '{"series":[]}', path: 'C:/a.xk' })
  })

  it('APP_TAKE_PENDING_CHART 原样透传 { content, path }，不得双层包裹', async () => {
    takePendingChart.mockReturnValue({ content: '{"series":[]}', path: 'C:/a.xk' })
    const res = await handlerOf(IPC.APP_TAKE_PENDING_CHART)(senderOf(2))
    expect(res).toEqual({ content: '{"series":[]}', path: 'C:/a.xk' })

    // 双层包裹回归检查：res.content 必须是字符串（渲染端要 JSON.parse 它）
    takePendingChart.mockReturnValue(null)
    expect(await handlerOf(IPC.APP_TAKE_PENDING_CHART)(senderOf(2))).toBeNull()
  })
})
