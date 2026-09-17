import { BrowserWindow, dialog, ipcMain } from 'electron'
import * as fileService from './fileService'
import { listExamples, openExample } from './exampleService'
import { createChartWindow, enterChartMode, exitChartMode, takePendingChart } from './windowManager'
import { IPC } from '../shared/ipc-channels'

/**
 * sender 对应窗口可能已销毁（invoke 执行瞬间用户恰好关窗），
 * fromWebContents 返回 null。dialog 的 parent 参数接受 undefined
 * （表示不绑定父窗口），enterChartMode/exitChartMode 内部自行判空。
 */
const senderWindow = (event) => BrowserWindow.fromWebContents(event.sender) ?? undefined

/**
 * 已装载文件的登记簿：文件路径 -> 装载它的窗口 webContents.id。
 * 用于"打开同一文件时聚焦已有窗口，不再重复开窗"。渲染端在装载文件
 * 与保存/另存换路径后经 file:opened 上报，窗口 closed 时自动清理。
 */
const openedFiles = new Map()

// 已挂 closed 清理监听器的窗口。渲染端在装载文件与每次保存/另存成功后都会
// 上报 file:opened，若每次都新注册 once('closed') 会在长会话下无上限累积
// （MaxListenersExceededWarning），故每个窗口只挂一个，关闭时清其全部记录。
const cleanupAttached = new WeakSet()

export const registerIpc = () => {
  ipcMain.handle(IPC.FILE_SAVE, async (event, { path, content }) => {
    if (!path) {
      return fileService.saveChartFileAs(senderWindow(event), content, '将文件保存到...')
    }
    return fileService.writeChartFile(path, content)
  })

  ipcMain.handle(IPC.FILE_SAVE_AS, async (event, { content }) => {
    return fileService.saveChartFileAs(senderWindow(event), content, '将文件另存为...')
  })

  ipcMain.handle(IPC.FILE_OPEN, async (event) => {
    const res = await fileService.showOpenDialog(senderWindow(event))
    if (res.canceled) return { canceled: true }
    const path = res.filePaths[0]

    // 同一文件已在某窗口打开：把该窗口提到最上层，不再重复装载。
    // show + focus 组合对付 Windows 前台锁定（单独 focus 可能只闪任务栏）
    const holderId = openedFiles.get(path)
    if (holderId !== undefined) {
      const holder = BrowserWindow.fromId(holderId)
      if (holder && !holder.isDestroyed()) {
        if (holder.isMinimized()) holder.restore()
        holder.show()
        holder.focus()
        return { alreadyOpen: true }
      }
      openedFiles.delete(path) // 记录指向已销毁窗口，清掉
    }

    // readChartFile 失败时 throw，经 invoke 自动变为渲染端 reject
    return fileService.readChartFile(path)
  })

  ipcMain.handle(IPC.FILE_OPENED, (event, { path }) => {
    const id = event.sender.id
    // 一个窗口同时只编辑一个文件：清掉本窗口的其他文件记录
    // （另存为换路径后旧文件不应再聚焦到本窗口）
    for (const [recorded, holderId] of openedFiles) {
      if (holderId === id && recorded !== path) openedFiles.delete(recorded)
    }
    if (path) {
      openedFiles.set(path, id)
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !cleanupAttached.has(win)) {
        cleanupAttached.add(win)
        win.once('closed', () => {
          // 清掉本窗口登记的全部记录（换文件后旧记录已即时清过，正常只有一条；
          // 按窗口 id 而非按 path 判断，别的窗口覆盖登记的文件不受影响）
          for (const [recorded, holderId] of openedFiles) {
            if (holderId === id) openedFiles.delete(recorded)
          }
        })
      }
    }
    return { ok: true }
  })

  ipcMain.handle(IPC.EXAMPLE_LIST, async () => ({ examples: await listExamples() }))

  // openExample 失败时 throw（非法文件名/读取损坏），经 invoke 变为渲染端
  // reject，由渲染端按固定文案提示
  ipcMain.handle(IPC.EXAMPLE_OPEN, (event, { fileName }) => openExample(fileName))

  ipcMain.handle(IPC.APP_CLOSE_WINDOW, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.destroy()
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_ENTER_CHART_MODE, (event) => {
    enterChartMode(BrowserWindow.fromWebContents(event.sender))
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_EXIT_CHART_MODE, (event) => {
    exitChartMode(BrowserWindow.fromWebContents(event.sender))
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_NEW_CHART_WINDOW, (event, { content, path }) => {
    createChartWindow({ content, path })
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_TAKE_PENDING_CHART, (event) => {
    // takePendingChart 返回 { content, path } 或 null，原样透传
    // （不得再包一层，否则渲染端拿到的 content 是对象而非 JSON 文本）
    return takePendingChart(event.sender.id)
  })

  ipcMain.handle(IPC.APP_CONFIRM_UNSAVED, async (event) => {
    // 绑定父窗口使确认框模态于触发窗口：多窗口并排时避免用户在
    // A 窗口的确认框上误关掉 B 窗口的修改
    const { response } = await dialog.showMessageBox(senderWindow(event), {
      type: 'info',
      title: '确认退出',
      message: '文件未保存，是否退出？',
      buttons: ['保存', '放弃', '取消'],
      cancelId: 2 // 直接关闭提示框视为"取消"
    })
    return ['save', 'discard', 'cancel'][response]
  })
}
