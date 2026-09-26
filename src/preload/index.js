import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

/**
 * 渲染进程可用的 IPC 接口。
 * 请求-响应类操作走 invoke（返回 Promise，主进程失败时 reject）；
 * 主进程推送有三个：onRequestClose（用户点击窗口关闭按钮）、
 * onTitleChanged（窗口标题变化，含文件名/未命名/默认）与
 * onMaximizeChanged（最大化状态变化，自绘窗口控制按钮的图标切换）。
 * 三者均返回解绑函数，组件卸载时必须调用，否则监听器会随挂载次数叠加。
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
  enterWorldMode: () => ipcRenderer.invoke(IPC.APP_ENTER_WORLD_MODE),
  exitWorldMode: () => ipcRenderer.invoke(IPC.APP_EXIT_WORLD_MODE),
  closeWindow: () => ipcRenderer.invoke(IPC.APP_CLOSE_WINDOW),
  confirmUnsaved: () => ipcRenderer.invoke(IPC.APP_CONFIRM_UNSAVED),
  themeApplied: (payload) => ipcRenderer.invoke(IPC.APP_THEME_APPLIED, payload),
  worldLoadIndex: () => ipcRenderer.invoke(IPC.WORLD_LOAD_INDEX),
  worldReadGraph: (id) => ipcRenderer.invoke(IPC.WORLD_READ_GRAPH, { id }),
  worldSetUserDir: (dir) => ipcRenderer.invoke(IPC.WORLD_SET_USER_DIR, { dir }),
  // 自绘窗口控制按钮（XkWindowControls）用：platform 供 macOS 隐藏
  // （那里保留原生红绿灯按钮，自绘关闭钮会重复）
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.invoke(IPC.APP_WINDOW_MINIMIZE),
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC.APP_WINDOW_MAXIMIZE_TOGGLE),
  closeWindowRequest: () => ipcRenderer.invoke(IPC.APP_CLOSE_WINDOW_REQUEST),
  onRequestClose: (callback) => {
    const listener = () => callback()
    ipcRenderer.on(IPC.APP_REQUEST_CLOSE, listener)
    return () => ipcRenderer.removeListener(IPC.APP_REQUEST_CLOSE, listener)
  },
  onTitleChanged: (callback) => {
    const listener = (_event, title) => callback(title)
    ipcRenderer.on(IPC.APP_TITLE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.APP_TITLE_CHANGED, listener)
  },
  onMaximizeChanged: (callback) => {
    const listener = (_event, maximized) => callback(maximized)
    ipcRenderer.on(IPC.APP_MAXIMIZE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.APP_MAXIMIZE_CHANGED, listener)
  }
})
