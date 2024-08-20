import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  receiveAct: (callback) => ipcRenderer.on("act", (_event, data) => callback(data)),
  sendAct: (act) => ipcRenderer.send("act", act),
  receiveData: (callback) => ipcRenderer.on("data", (_event, data) => callback(data)),
  sendData: (data) => ipcRenderer.send("data", data)
});
