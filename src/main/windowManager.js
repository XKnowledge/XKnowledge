import { BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { IPC } from '../shared/ipc-channels'

/**
 * 创建应用主窗口。onWindowClosed 在窗口销毁时回调（webContents.id 作参数），
 * 供 ipc 层清理按窗口记录的状态。
 */
export const createWindow = (onWindowClosed) => {
  const current_window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    resizable: false, // 不允许用户调整窗口大小
    maximizable: false, // 禁止最大化
    minimizable: false, // 禁止最小化
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // devTools: false, // 禁用开发者工具快捷键
      webviewTag: false, // 禁用 webview 标签
      sandbox: false,
      accelerator: {
        'Cmd+[': null,
        'Cmd+]': null,
        'Cmd+W': null,
        'Ctrl+R': null
      }
    },
    trafficLightPosition: { x: 20, y: 18 },
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#74b1be'
    },
    title: 'XKnowledge'
  })
  Menu.setApplicationMenu(null)

  // 窗口销毁后通知调用方清理其按窗口记录的状态，避免Map持续增长。
  // 注意：closed 事件触发时 webContents 已销毁，届时再读 .id 会抛
  // "Object has been destroyed"，因此必须在创建时先捕获 id。
  const webContentsId = current_window.webContents.id
  current_window.on('closed', () => {
    if (onWindowClosed) onWindowClosed(webContentsId)
  })

  current_window.on('ready-to-show', () => {
    current_window.show()
  })

  current_window.webContents.openDevTools({ mode: 'detach' }) // 打开控制台

  /*
  设置窗口打开行为的处理程序。
  当在应用程序中点击某些链接时，会触发打开新窗口的行为。
  这里的代码是告诉 Electron 当有新窗口打开请求时，使用默认的浏览器打开这个链接，并返回 { action: 'deny' } 来阻止 Electron 打开新窗口。
  */
  current_window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).then()
    return { action: 'deny' }
  })

  /*
  在基于 electron-vite CLI 的渲染器热模块替换。
  在开发时加载远程 URL，或在生产时加载本地 HTML 文件。
  */
  if (process.env['ELECTRON_RENDERER_URL']) {
    current_window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    current_window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return current_window
}

// 已进入图表模式的窗口集合：保证解锁与close拦截只注册一次
const chartModeWindows = new Set()

/**
 * 进入图表模式：解锁窗口尺寸限制，并注册"关闭前确认"拦截。
 * 由图表页挂载时 invoke app:enter-chart-mode 触发；幂等。
 */
export const enterChartMode = (current_window) => {
  const { id } = current_window
  if (chartModeWindows.has(id)) return
  chartModeWindows.add(id)

  current_window.setMaximizable(true)
  current_window.setMinimizable(true)
  current_window.setResizable(true)
  current_window.setMinimumSize(900, 670)

  current_window.on('close', e => {
    e.preventDefault() //先阻止一下默认行为，不然直接关了，提示框只会闪一下
    current_window.webContents.send('act', 'quit') // 【legacy】Task 7 改为 APP_REQUEST_CLOSE
  })

  current_window.on('closed', () => chartModeWindows.delete(id))
}
