import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { join } from 'path'

const fs = require('fs')

const createWindow = () => {
  let current_window = new BrowserWindow({
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
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    current_window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    current_window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  */
  current_window.loadFile(join(__dirname, '../renderer/index.html')).then()

  return current_window
}

// 当 Electron 完成初始化并准备创建浏览器窗口时，将调用此方法。
// 一些 API 只能在此事件发生后使用。
app.whenReady().then(() => {
  /*
  为 Windows 设置应用程序用户模型标识符。
  electronApp.setAppUserModelId('com.electron')

  在开发环境中，默认使用 F12 打开或关闭开发者工具，
  并在生产环境中忽略 CommandOrControl + R 的刷新操作。
  参考 https://github.com/alex8088/electron-toolkit/tree/master/packages/utils。
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
   */
  let lock = app.requestSingleInstanceLock()
  if (lock) {
    /*
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      if (current_window) {
        if (current_window.isMinimized()) {
          current_window.restore()
        }
        current_window.focus()
      }
    })
     */
    createWindow()
  } else {
    app.quit()
  }

  app.on('activate', () => {
    // 在 macOS 上，当单击应用程序的 Dock 图标且没有其他窗口打开时，重新创建窗口是常见的操作。
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 当所有窗口关闭时退出，但在 macOS 上除外。
// 在 macOS 上，通常应用程序和它们的菜单栏会保持活动状态，直到用户使用 Cmd + Q 明确退出应用程序。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.exit()
  }
  /*
  app.exit()
  if (process.platform !== 'darwin') {
    app.exit() // 不能使用app.quit()，否则陷入循环
    // 见https://www.electronjs.org/zh/docs/latest/api/app#appquit
  }
  */
})

let current_act
let status = 'open'

const openChartWindow = (current_window, data, path) => {
  current_window.webContents.send('act', 'chart')
  current_window.setMaximizable(true)
  current_window.setMinimizable(true)
  current_window.setResizable(true)
  current_window.setMinimumSize(900, 670)
  current_window.webContents.send('data', { value: data, path: path })

  current_window.on('close', e => {
    e.preventDefault() //先阻止一下默认行为，不然直接关了，提示框只会闪一下
    current_window.webContents.send('act', 'quit')
  })
}

const openFile = (current_window) => {
  dialog.showOpenDialog(current_window, {
    title: '打开',
    properties: ['openFile'],
    filters: [
      { name: 'XKnowledge', extensions: ['xk'] }
    ]
  }).then((res) => {
    if (!res.canceled) {
      fs.readFile(res.filePaths[0], 'utf-8', (err, data) => {
        openChartWindow(current_window, data, res.filePaths[0])
      })
    } else {
      current_window.destroy()
    }
  }).catch((err) => {
    console.log(err)
    current_window.destroy()
  })
}

const saveFile = (data, dialogTitle, current_window) => {
  const filePath = dialog.showSaveDialogSync(current_window, {
    title: dialogTitle,
    properties: ['createDirectory'],
    filters: [{ name: 'XKnowledge', extensions: ['xk'] }]
  })

  if (filePath) {
    fs.writeFileSync(filePath, data)
    current_window.webContents.send('act', 'save_success')
    current_window.webContents.send('data', { value: data, path: filePath })
  }
  return filePath
}

ipcMain.on('act', (event, act) => {
  // 只有操作需要进行，不需要数据参与
  current_act = act
  const current_window = BrowserWindow.fromWebContents(event.sender)
  const actions = {
    open_file: () => openFile(current_window),

    unsaved: async () => {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: '确认退出',
        message: '文件未保存，是否退出？',
        buttons: ['保存', '放弃', '取消'], //选择按钮，点击确认则下面的idx为0，取消为1
        cancelId: 2 //这个的值是如果直接把提示框×掉返回的值，这里设置成和“取消”按钮一样的值，下面的idx也会是1
      })

      if (response === 0) {
        // 保存文件并退出
        status = 'exit'
        current_window.webContents.send('act', 'save_file')
      } else if (response === 1) {
        // 不保存直接退出
        current_window.destroy()
      }
      // 取消退出
    },

    saved: () => current_window.destroy(),

    open_other_file: () => openFile(createWindow())
  }

  if (actions[act]) {
    actions[act]()
  }
})

ipcMain.on('data', (event, arg) => {
  // 当接到操作指令，需要对数据进行操作时
  console.log(arg)
  const current_window = BrowserWindow.fromWebContents(event.sender)
  const handles = {
    save_file: () => {
      if (!arg.path) {
        if (!saveFile(JSON.stringify(arg.file), '将文件保存到...', current_window)) {
          current_window.webContents.send('act', 'save_failure')
          status = 'open'
        }
      } else {
        fs.writeFileSync(arg.path, JSON.stringify(arg.file))
        current_window.webContents.send('act', 'save_success')
      }
      if (status === 'exit') {
        current_window.destroy()
        status = 'open'
      }
    },

    open_template: () => openChartWindow(current_window, JSON.stringify(arg), ''),

    save_as: () => saveFile(JSON.stringify(arg.file), '将文件另存为...', current_window),

    create_new_file: () => {
      console.log('create new file')
      const new_window = createWindow()
      new_window.webContents.on('did-finish-load',
        () => openChartWindow(new_window, JSON.stringify(arg), ''))
    }
  }

  if (handles[current_act]) {
    handles[current_act]()
  }
})

// ipcMain.handle('get-window-id', (event) => {
//   return BrowserWindow.fromWebContents(event.sender).id
// })
