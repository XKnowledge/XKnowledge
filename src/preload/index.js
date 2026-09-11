import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

/**
 * 渲染进程可用的 IPC 接口。
 * 请求-响应类操作走 invoke（返回 Promise，主进程失败时 reject）；
 * onRequestClose 是唯一的主进程推送（用户点击窗口关闭按钮）。
 */
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke(IPC.FILE_OPEN),
  saveFile: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE, payload),
  saveFileAs: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE_AS, payload),
  newChartWindow: (payload) => ipcRenderer.invoke(IPC.APP_NEW_CHART_WINDOW, payload),
  takePendingChart: () => ipcRenderer.invoke(IPC.APP_TAKE_PENDING_CHART),
  enterChartMode: () => ipcRenderer.invoke(IPC.APP_ENTER_CHART_MODE),
  closeWindow: () => ipcRenderer.invoke(IPC.APP_CLOSE_WINDOW),
  confirmUnsaved: () => ipcRenderer.invoke(IPC.APP_CONFIRM_UNSAVED),
  onRequestClose: (callback) => ipcRenderer.on(IPC.APP_REQUEST_CLOSE, () => callback())
})
