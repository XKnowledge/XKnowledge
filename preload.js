// preload.js

// window.addEventListener('DOMContentLoaded', () => {

//   // 预加载的脚本或初始化代码
// });

const { contextBridge, ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('electronAPI', {
  ipcRecive: (callback) => ipcRenderer.on('act', (_event, value) => callback(value)),
  ipcsend: () => ipcRenderer.send('switch_window')
});
