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
  saveFileAs: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE_AS, payload)
})
