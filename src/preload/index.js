import { contextBridge, ipcRenderer, fs } from 'electron'
// import { electronAPI } from '@electron-toolkit/preload'

contextBridge.exposeInMainWorld('electronAPI', {
  ipcReceive: (callback) => ipcRenderer.on('act', (_event, value) => callback(value)),
  ipcSend: () => ipcRenderer.send('switch_window')
})
// 在渲染进程中通过preload脚本引入fs模块
contextBridge.exposeInMainWorld('electronFs', fs)
