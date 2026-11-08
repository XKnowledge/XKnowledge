import { app, BrowserWindow } from 'electron'
import { createWindow } from './windowManager'
import { registerIpc } from './ipc'
import { drainPendingOpens, findXkPath, requestOpen } from './fileOpen'

/**
 * 把已有窗口提到前台（无文件参数时收到第二次启动，例如用户又点了一次
 * 快捷方式）。没有窗口（macOS 关掉窗口但进程仍在）则补一个首页。
 */
const focusPrimaryWindow = () => {
  const [win] = BrowserWindow.getAllWindows()
  if (!win) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

// 单实例锁必须在 ready 之前申请：双击 .xk 时系统拉起的是第二个进程，
// 文件路径要经主实例的 second-instance 事件转交（此前该调用写在
// whenReady 内部，第二个进程已走完 ready，事件窗口期会被错过）
const primaryInstance = app.requestSingleInstanceLock()

if (!primaryInstance) {
  // 非主实例：参数已由系统转交主实例，本进程无事可做
  app.quit()
} else {
  // 已运行状态下双击 .xk：路径在第二实例的 argv 里
  app.on('second-instance', (_event, argv) => {
    const target = findXkPath(argv)
    if (target) {
      requestOpen(target)
      return
    }
    focusPrimaryWindow()
  })

  // macOS：Finder 双击经 open-file 送达，可能早于 ready（requestOpen 负责入队）
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    requestOpen(filePath)
  })

  app.whenReady().then(async () => {
    registerIpc()

    // 冷启动带文件：直接开图表窗口，不先闪一下首页。
    // 打开失败（文件损坏/已被删除）时兜底补开首页——否则用户只看到一个
    // 错误框、应用没有任何窗口，会被当成启动失败
    const launchFile = findXkPath(process.argv)
    if (!launchFile || !(await requestOpen(launchFile))) {
      createWindow()
    }
    // ready 前积压的打开请求（macOS open-file 早于 ready）
    await drainPendingOpens()

    app.on('activate', () => {
      // 在 macOS 上，当单击应用程序的 Dock 图标且没有其他窗口打开时，重新创建窗口是常见的操作。
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

// 当所有窗口关闭时退出，但在 macOS 上除外。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.exit()
  }
})
