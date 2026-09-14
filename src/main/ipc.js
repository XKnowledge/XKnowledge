import { BrowserWindow, dialog, ipcMain } from 'electron'
import * as fileService from './fileService'
import {
  createChartWindow,
  enterChartMode,
  exitChartMode,
  takePendingChart
} from './windowManager'
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
      BrowserWindow.fromWebContents(event.sender)?.once('closed', () => {
        if (openedFiles.get(path) === id) openedFiles.delete(path)
      })
    }
    return { ok: true }
  })

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
