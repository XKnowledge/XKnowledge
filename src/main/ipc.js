import { BrowserWindow, dialog, ipcMain } from 'electron'
import * as fileService from './fileService'
import { createChartWindow, enterChartMode, takePendingChart } from './windowManager'
import { IPC } from '../shared/ipc-channels'

// 每个窗口独立的IPC上下文：记录该窗口最近一次act指令与退出流程状态。
// 不能用全局变量：多窗口并发时act/data的配对会互相干扰，
// 甚至一个窗口的退出流程会把另一个窗口误关。
// 【legacy】Task 8 随 act/data 通道一并删除。
const windowContexts = new Map() // webContents.id -> { act, status }

const getContext = (webContents) => {
  if (!windowContexts.has(webContents.id)) {
    windowContexts.set(webContents.id, { act: null, status: 'open' })
  }
  return windowContexts.get(webContents.id)
}

/**
 * 【legacy】窗口销毁时清理其IPC上下文。Task 8 删除。
 */
export const cleanupWindowContext = (webContentsId) => {
  windowContexts.delete(webContentsId)
}

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

  ipcMain.on('act', (event, act) => {
    // 只有操作需要进行，不需要数据参与
    const ctx = getContext(event.sender)
    ctx.act = act
    const current_window = BrowserWindow.fromWebContents(event.sender)
    const actions = {
      unsaved: async () => {
        const { response } = await dialog.showMessageBox({
          type: 'info',
          title: '确认退出',
          message: '文件未保存，是否退出？',
          buttons: ['保存', '放弃', '取消'],
          cancelId: 2
        })

        if (response === 0) {
          // 保存文件并退出
          current_window.webContents.send('act', 'save_file')
        } else if (response === 1) {
          // 不保存直接退出
          current_window.destroy()
        }
        // 取消退出
      },

      saved: () => current_window.destroy()
    }

    if (actions[act]) {
      actions[act]()
    }
  })
}
