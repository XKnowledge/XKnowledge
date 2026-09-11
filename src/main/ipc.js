import { BrowserWindow, dialog, ipcMain } from 'electron'
import * as fileService from './fileService'
import { createChartWindow, enterChartMode, takePendingChart } from './windowManager'
import { IPC } from '../shared/ipc-channels'

export const registerIpc = () => {
  ipcMain.handle(IPC.FILE_SAVE, async (event, { path, content }) => {
    const current_window = BrowserWindow.fromWebContents(event.sender)
    if (!path) {
      return fileService.saveChartFileAs(current_window, content, '将文件保存到...')
    }
    return fileService.writeChartFile(path, content)
  })

  ipcMain.handle(IPC.FILE_SAVE_AS, async (event, { content }) => {
    const current_window = BrowserWindow.fromWebContents(event.sender)
    return fileService.saveChartFileAs(current_window, content, '将文件另存为...')
  })

  ipcMain.handle(IPC.FILE_OPEN, async (event) => {
    const current_window = BrowserWindow.fromWebContents(event.sender)
    const res = await fileService.showOpenDialog(current_window)
    if (res.canceled) return { canceled: true }
    // readChartFile 失败时 throw，经 invoke 自动变为渲染端 reject
    return fileService.readChartFile(res.filePaths[0])
  })

  ipcMain.handle(IPC.APP_CLOSE_WINDOW, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.destroy()
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_ENTER_CHART_MODE, (event) => {
    enterChartMode(BrowserWindow.fromWebContents(event.sender))
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_NEW_CHART_WINDOW, (event, { content }) => {
    createChartWindow(content)
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_TAKE_PENDING_CHART, (event) => {
    return { content: takePendingChart(event.sender.id) }
  })

  ipcMain.handle(IPC.APP_CONFIRM_UNSAVED, async () => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: '确认退出',
      message: '文件未保存，是否退出？',
      buttons: ['保存', '放弃', '取消'],
      cancelId: 2 // 直接关闭提示框视为"取消"
    })
    return ['save', 'discard', 'cancel'][response]
  })
}
