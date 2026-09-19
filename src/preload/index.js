import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

/**
 * 渲染进程可用的 IPC 接口。
 * 请求-响应类操作走 invoke（返回 Promise，主进程失败时 reject）；
 * 主进程推送有两个：onRequestClose（用户点击窗口关闭按钮）与
 * onTitleChanged（窗口标题变化，含文件名/未命名/默认）。
 * 两者均返回解绑函数，组件卸载时必须调用，否则监听器会随挂载次数叠加。
 */
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke(IPC.FILE_OPEN),
  fileOpened: (payload) => ipcRenderer.invoke(IPC.FILE_OPENED, payload),
  fileDirty: (payload) => ipcRenderer.invoke(IPC.FILE_DIRTY, payload),
  listExamples: () => ipcRenderer.invoke(IPC.EXAMPLE_LIST),
  openExample: (payload) => ipcRenderer.invoke(IPC.EXAMPLE_OPEN, payload),
  saveFile: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE, payload),
  saveFileAs: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE_AS, payload),
  newChartWindow: (payload) => ipcRenderer.invoke(IPC.APP_NEW_CHART_WINDOW, payload),
  takePendingChart: () => ipcRenderer.invoke(IPC.APP_TAKE_PENDING_CHART),
  enterChartMode: () => ipcRenderer.invoke(IPC.APP_ENTER_CHART_MODE),
  exitChartMode: () => ipcRenderer.invoke(IPC.APP_EXIT_CHART_MODE),
  closeWindow: () => ipcRenderer.invoke(IPC.APP_CLOSE_WINDOW),
  confirmUnsaved: () => ipcRenderer.invoke(IPC.APP_CONFIRM_UNSAVED),
  onRequestClose: (callback) => {
    const listener = () => callback()
    ipcRenderer.on(IPC.APP_REQUEST_CLOSE, listener)
    return () => ipcRenderer.removeListener(IPC.APP_REQUEST_CLOSE, listener)
  },
  onTitleChanged: (callback) => {
    const listener = (_event, title) => callback(title)
    ipcRenderer.on(IPC.APP_TITLE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.APP_TITLE_CHANGED, listener)
  }
})
