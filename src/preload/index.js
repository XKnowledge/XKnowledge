import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

contextBridge.exposeInMainWorld('electronAPI', {
  /* 【legacy】Task 8 删除 */
  receiveAct: (callback) => ipcRenderer.on('act', (_event, data) => callback(data)),
  sendAct: (act) => ipcRenderer.send('act', act),
  receiveData: (callback) => ipcRenderer.on('data', (_event, data) => callback(data)),
  sendData: (data) => ipcRenderer.send('data', data),

  /* 新通道 */
  saveFile: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE, payload),
  saveFileAs: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE_AS, payload),
  openFile: () => ipcRenderer.invoke(IPC.FILE_OPEN),
  closeWindow: () => ipcRenderer.invoke(IPC.APP_CLOSE_WINDOW),
  enterChartMode: () => ipcRenderer.invoke(IPC.APP_ENTER_CHART_MODE),
  newChartWindow: (payload) => ipcRenderer.invoke(IPC.APP_NEW_CHART_WINDOW, payload),
  takePendingChart: () => ipcRenderer.invoke(IPC.APP_TAKE_PENDING_CHART),
  confirmUnsaved: () => ipcRenderer.invoke(IPC.APP_CONFIRM_UNSAVED),
  onRequestClose: (callback) =>
    ipcRenderer.on(IPC.APP_REQUEST_CLOSE, () => callback())
})
