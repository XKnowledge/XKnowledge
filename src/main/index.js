import { app, BrowserWindow } from 'electron'
import { createWindow } from './windowManager'
import { registerIpc, cleanupWindowContext } from './ipc'

// 当 Electron 完成初始化并准备创建浏览器窗口时，将调用此方法。
// 一些 API 只能在此事件发生后使用。
app.whenReady().then(() => {
  let lock = app.requestSingleInstanceLock()
  if (lock) {
    // 窗口销毁后清理其IPC上下文，避免Map持续增长
    createWindow(cleanupWindowContext)
    registerIpc()
  } else {
    app.quit()
  }

  app.on('activate', () => {
    // 在 macOS 上，当单击应用程序的 Dock 图标且没有其他窗口打开时，重新创建窗口是常见的操作。
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(cleanupWindowContext)
    }
  })
})

// 当所有窗口关闭时退出，但在 macOS 上除外。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.exit()
  }
})
