import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(), fromId: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
  // examplePaths 经 app.getAppPath() 定位 examples 目录
  app: { getAppPath: vi.fn(() => 'C:/mock-app') }
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
  takePendingChart: vi.fn(),
  setWindowTitle: vi.fn()
}))

vi.mock('../../src/main/exampleService', () => ({
  listExamples: vi.fn(),
  openExample: vi.fn()
}))

import { ipcMain, BrowserWindow } from 'electron'
import * as fileService from '../../src/main/fileService'
import { listExamples, openExample } from '../../src/main/exampleService'
import { createChartWindow, takePendingChart, setWindowTitle } from '../../src/main/windowManager'
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
  setTitle: vi.fn(),
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

  it('空路径上报只清本窗口记录、不登记新文件（关闭文件返回首页时清登记）', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:/close-1.xk' })

    // 关闭文件：上报空路径清登记
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: '' })

    // 再次打开同一文件应正常读取，而不是聚焦到已回首页的窗口 2
    BrowserWindow.fromId.mockReturnValue(win)
    fileService.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/close-1.xk']
    })
    fileService.readChartFile.mockResolvedValue({ content: '{}', path: 'C:/close-1.xk' })
    const res = await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(res).toEqual({ content: '{}', path: 'C:/close-1.xk' })
    expect(win.focus).not.toHaveBeenCalled()
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

describe('示例文件保护（examples 内文件只读，保存必走另存）', () => {
  it('FILE_OPEN 打开 examples 内文件时返回 path 为空，装载即副本语义', async () => {
    fileService.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/mock-app/examples/金融.xk']
    })
    fileService.readChartFile.mockResolvedValue({
      content: '{}',
      path: 'C:/mock-app/examples/金融.xk'
    })
    const res = await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(fileService.readChartFile).toHaveBeenCalledWith('C:/mock-app/examples/金融.xk')
    expect(res).toEqual({ content: '{}', path: '' })
  })

  it('FILE_OPEN 打开普通文件不受影响，path 原样返回', async () => {
    fileService.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/普通.xk']
    })
    fileService.readChartFile.mockResolvedValue({ content: '{}', path: 'C:/普通.xk' })
    const res = await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(res).toEqual({ content: '{}', path: 'C:/普通.xk' })
  })

  it('FILE_SAVE 收到指向 examples 的 path 时改道 saveChartFileAs，不写原文件', async () => {
    fileService.saveChartFileAs.mockResolvedValue({ path: 'C:/我的副本.xk' })
    const res = await handlerOf(IPC.FILE_SAVE)(senderOf(1), {
      path: 'C:/mock-app/examples/金融.xk',
      content: '{}'
    })
    expect(fileService.saveChartFileAs).toHaveBeenCalled()
    expect(fileService.writeChartFile).not.toHaveBeenCalled()
    expect(res).toEqual({ path: 'C:/我的副本.xk' })
  })

  it('FILE_OPEN 打开 data 内置示例（test.xk）同样返回 path 为空', async () => {
    fileService.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/mock-app/data/test.xk']
    })
    fileService.readChartFile.mockResolvedValue({
      content: '{}',
      path: 'C:/mock-app/data/test.xk'
    })
    const res = await handlerOf(IPC.FILE_OPEN)(senderOf(1))
    expect(res).toEqual({ content: '{}', path: '' })
  })

  it('FILE_SAVE 普通路径仍走 writeChartFile 原地写回', async () => {
    fileService.writeChartFile.mockResolvedValue({ path: 'C:/普通.xk' })
    await handlerOf(IPC.FILE_SAVE)(senderOf(1), { path: 'C:/普通.xk', content: '{}' })
    expect(fileService.writeChartFile).toHaveBeenCalledWith('C:/普通.xk', '{}')
    expect(fileService.saveChartFileAs).not.toHaveBeenCalled()
  })
})

describe('内置示例域', () => {
  it('EXAMPLE_LIST 以 { examples } 包裹透传 exampleService 的列表结果', async () => {
    const list = [
      {
        fileName: '金融.xk',
        title: '金融',
        description: '',
        nodeCount: 87,
        linkCount: 130,
        categories: ['宏观经济', '货币与银行']
      }
    ]
    listExamples.mockResolvedValue(list)
    const res = await handlerOf(IPC.EXAMPLE_LIST)()
    expect(res).toEqual({ examples: list })
  })

  it('EXAMPLE_OPEN 把 fileName 传给 openExample 并透传结果', async () => {
    openExample.mockResolvedValue({ content: '{"version":2}' })
    const res = await handlerOf(IPC.EXAMPLE_OPEN)(senderOf(1), { fileName: '金融.xk' })
    expect(openExample).toHaveBeenCalledWith('金融.xk')
    expect(res).toEqual({ content: '{"version":2}' })
  })

  it('EXAMPLE_OPEN 失败（非法文件名/损坏）时 reject 到渲染端', async () => {
    openExample.mockRejectedValue(new Error('无效的示例文件名'))
    await expect(
      handlerOf(IPC.EXAMPLE_OPEN)(senderOf(1), { fileName: '../evil.xk' })
    ).rejects.toThrow('无效的示例文件名')
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

describe('FILE_OPENED：窗口标题联动', () => {
  // 用例间登记簿是模块级状态，各用例用独立文件名避免跨用例同名分组干扰
  it('登记路径后窗口标题设为「文件名 — XKnowledge」', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    BrowserWindow.fromId.mockReturnValue(win)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:\\资料\\t1.xk' })
    expect(setWindowTitle).toHaveBeenCalledWith(win, 't1 — XKnowledge', 't1 — XKnowledge')
  })

  it('第二个窗口打开同名文件时，两个窗口都带目录链', async () => {
    const win2 = fakeWindow()
    const win3 = fakeWindow()
    const byId = { 2: win2, 3: win3 }
    BrowserWindow.fromId.mockImplementation((id) => byId[id])
    BrowserWindow.fromWebContents.mockReturnValue(win2)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:\\资料\\t2.xk' })
    BrowserWindow.fromWebContents.mockReturnValue(win3)
    await handlerOf(IPC.FILE_OPENED)(senderOf(3), { path: 'C:\\下载\\t2.xk' })
    // refreshTitles 按登记顺序逐窗口调用，后登记的 win3 是最后一次调用
    expect(setWindowTitle).toHaveBeenCalledWith(
      win2,
      't2 — 资料 — XKnowledge',
      't2 — 资料 — XKnowledge'
    )
    expect(setWindowTitle).toHaveBeenLastCalledWith(
      win3,
      't2 — 下载 — XKnowledge',
      't2 — 下载 — XKnowledge'
    )
  })

  it('空路径上报（关闭文件）触发重算：另一同名窗口恢复短标题，本窗口标题不动', async () => {
    const win2 = fakeWindow()
    const win3 = fakeWindow()
    const byId = { 2: win2, 3: win3 }
    BrowserWindow.fromId.mockImplementation((id) => byId[id])
    BrowserWindow.fromWebContents.mockReturnValue(win2)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:\\资料\\t3.xk' })
    BrowserWindow.fromWebContents.mockReturnValue(win3)
    await handlerOf(IPC.FILE_OPENED)(senderOf(3), { path: 'C:\\下载\\t3.xk' })

    setWindowTitle.mockClear()
    BrowserWindow.fromWebContents.mockReturnValue(win2)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: '' })
    expect(setWindowTitle).toHaveBeenCalledTimes(1)
    expect(setWindowTitle).toHaveBeenCalledWith(win3, 't3 — XKnowledge', 't3 — XKnowledge') // 重名解除恢复短名
    // 空路径不改本窗口标题（win2 不在重算结果中）
  })

  it('窗口 closed 清理登记后，其余同名窗口恢复短标题', async () => {
    const win2 = fakeWindow()
    const win3 = fakeWindow()
    const byId = { 2: win2, 3: win3 }
    BrowserWindow.fromId.mockImplementation((id) => byId[id])
    BrowserWindow.fromWebContents.mockReturnValue(win2)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:\\资料\\t4.xk' })
    BrowserWindow.fromWebContents.mockReturnValue(win3)
    await handlerOf(IPC.FILE_OPENED)(senderOf(3), { path: 'C:\\下载\\t4.xk' })

    const closedCb = win2.once.mock.calls.find(([evt]) => evt === 'closed')?.[1]
    expect(closedCb).toBeTypeOf('function')
    setWindowTitle.mockClear()
    closedCb()
    expect(setWindowTitle).toHaveBeenCalledWith(win3, 't4 — XKnowledge', 't4 — XKnowledge')
  })

  it('fromId 找不到窗口（已销毁）时跳过，不抛异常', async () => {
    BrowserWindow.fromWebContents.mockReturnValue(fakeWindow())
    BrowserWindow.fromId.mockReturnValue(null)
    // handler 为同步函数返回普通对象，不能用 .resolves
    const res = await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:\\t5.xk' })
    expect(res).toEqual({ ok: true })
  })
})

describe('FILE_DIRTY：未保存圆点', () => {
  it('已登记窗口上报 dirty 后标题双位置带圆点', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    BrowserWindow.fromId.mockReturnValue(win)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:\\资料\\d1.xk' })
    setWindowTitle.mockClear()
    await handlerOf(IPC.FILE_DIRTY)(senderOf(2), { dirty: true })
    expect(setWindowTitle).toHaveBeenCalledWith(win, 'd1 ● — XKnowledge', '● d1 — XKnowledge')
  })

  it('未命名窗口（无文件登记）上报 dirty 走未命名分支', async () => {
    // sender id 须未被任何先前用例登记过（openedFiles 是模块级状态，
    // 旧用例给 2/3 留有登记残留，会把上报误导向 refreshTitles 分支）
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    await handlerOf(IPC.FILE_DIRTY)(senderOf(7), { dirty: true })
    expect(setWindowTitle).toHaveBeenCalledWith(
      win,
      '未命名 ● — XKnowledge',
      '● 未命名 — XKnowledge'
    )
  })

  it('上报 dirty: false 恢复干净标题', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    BrowserWindow.fromId.mockReturnValue(win)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:\\资料\\d2.xk' })
    await handlerOf(IPC.FILE_DIRTY)(senderOf(2), { dirty: true })
    setWindowTitle.mockClear()
    await handlerOf(IPC.FILE_DIRTY)(senderOf(2), { dirty: false })
    expect(setWindowTitle).toHaveBeenCalledWith(win, 'd2 — XKnowledge', 'd2 — XKnowledge')
  })

  it('file:opened 上报重置 dirty：登记后立即按干净态计算标题', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    BrowserWindow.fromId.mockReturnValue(win)
    await handlerOf(IPC.FILE_DIRTY)(senderOf(2), { dirty: true }) // 未命名窗口先弄脏
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:\\资料\\d3.xk' })
    expect(setWindowTitle).toHaveBeenLastCalledWith(win, 'd3 — XKnowledge', 'd3 — XKnowledge')
  })

  it('空路径上报（关闭文件）同样重置 dirty', async () => {
    const win = fakeWindow()
    BrowserWindow.fromWebContents.mockReturnValue(win)
    BrowserWindow.fromId.mockReturnValue(win)
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:\\资料\\d4.xk' })
    await handlerOf(IPC.FILE_DIRTY)(senderOf(2), { dirty: true })
    // 关闭文件：空路径上报清登记并重置 dirty；本窗口无登记项不再设标题
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: '' })
    setWindowTitle.mockClear()
    // 同窗口再开新文件：若 dirty 未被重置，此处会带圆点
    await handlerOf(IPC.FILE_OPENED)(senderOf(2), { path: 'C:\\资料\\d5.xk' })
    expect(setWindowTitle).toHaveBeenLastCalledWith(win, 'd5 — XKnowledge', 'd5 — XKnowledge')
  })
})
