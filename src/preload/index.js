import { contextBridge, ipcRenderer, fs } from "electron";
// import { electronAPI } from '@electron-toolkit/preload'

contextBridge.exposeInMainWorld("electronAPI", {
  receiveAct: (callback) => ipcRenderer.on("act", (_event, data) => callback(data)),
  sendAct: (act) => ipcRenderer.send("act", act),
  receiveData: (callback) => ipcRenderer.on("data", (_event, data) => callback(data)),
  sendData: (data) => ipcRenderer.send("data", data)
});

// 在渲染进程中通过preload脚本引入fs模块
contextBridge.exposeInMainWorld("electronFs", fs);
