import { BrowserWindow, dialog, ipcMain } from 'electron'
import * as fileService from './fileService'
import { createWindow, openChartWindow, enterChartMode } from './windowManager'
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
 * 【legacy】打开文件对话框 + 读取校验 + 装载图表。
 * 失败与取消时的弹窗/销毁行为与重构前一致。
 */
const legacyOpenFile = (current_window) => {
  fileService.showOpenDialog(current_window).then((res) => {
    if (!res.canceled) {
      fileService.readChartFile(res.filePaths[0])
        .then(({ content, path }) => {
          openChartWindow(current_window, content, path)
        })
        .catch((err) => {
          dialog.showMessageBoxSync(current_window, {
            type: 'error',
            title: '打开失败',
            message: err.message,
            detail: err.detail
          })
          current_window.destroy()
        })
    } else {
      current_window.destroy()
    }
  }).catch((err) => {
    console.log(err)
    current_window.destroy()
  })
}

/**
 * 【legacy】窗口销毁时清理其IPC上下文。Task 8 删除。
 */
export const cleanupWindowContext = (webContentsId) => {
  windowContexts.delete(webContentsId)
}

// ipc.js 内部所有创建窗口的调用统一走包装（保证清理钩子不遗漏）
const openNewWindow = () => createWindow(cleanupWindowContext)

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

      saved: () => current_window.destroy(),

      open_other_file: () => legacyOpenFile(openNewWindow())
    }

    if (actions[act]) {
      actions[act]()
    }
  })

  ipcMain.on('data', (event, arg) => {
    // 当接到操作指令，需要对数据进行操作时
    console.log(arg)
    const current_window = BrowserWindow.fromWebContents(event.sender)
    const ctx = getContext(event.sender)
    const handles = {
      open_template: () => openChartWindow(current_window, JSON.stringify(arg), ''),

      create_new_file: () => {
        console.log('create new file')
        const new_window = openNewWindow()
        new_window.webContents.on('did-finish-load',
          () => openChartWindow(new_window, JSON.stringify(arg), ''))
      }
    }

    if (handles[ctx.act]) {
      handles[ctx.act]()
    }
  })
}
