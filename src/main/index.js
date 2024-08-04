import { app, shell, BrowserWindow, ipcMain, Menu, MenuItem } from "electron";
import { join } from "path";
import path from "node:path";
import { spawn } from "child_process";

let mainWindow;
let pythonProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    resizable: false, // 不允许用户调整窗口大小
    maximizable: false, // 禁止最大化
    minimizable: false, // 禁止最小化
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      // devTools: false, // 禁用开发者工具快捷键
      webviewTag: false, // 禁用 webview 标签
      sandbox: false,
      accelerator: {
        "Cmd+[": null,
        "Cmd+]": null,
        "Cmd+W": null,
        "Ctrl+R": null
      }
    },
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#ffffff",
      symbolColor: "#74b1be"
    },
    title: "XKnowledge",
    icon: "../../resources/Knowledge.png"
  });

  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        {
          click: () => mainWindow.webContents.send("open-view", "chart"),
          label: "跳转"
        }
      ]
    }

  ]);

  Menu.setApplicationMenu(menu);

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.openDevTools({ mode: "detach" }); // 打开控制台

  // 设置窗口打开行为的处理程序。
  // 当在应用程序中点击某些链接时，会触发打开新窗口的行为。
  // 这里的代码是告诉 Electron 当有新窗口打开请求时，使用默认的浏览器打开这个链接，并返回 { action: 'deny' } 来阻止 Electron 打开新窗口。
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // 在基于 electron-vite CLI 的渲染器热模块替换。
  // 在开发时加载远程 URL，或在生产时加载本地 HTML 文件。
  // if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
  //   mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  // } else {
  //   mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  // }
  mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
}

// 当 Electron 完成初始化并准备创建浏览器窗口时，将调用此方法。
// 一些 API 只能在此事件发生后使用。
app.whenReady().then(() => {
  // 为 Windows 设置应用程序用户模型标识符。
  // electronApp.setAppUserModelId('com.electron')

  // 在开发环境中，默认使用 F12 打开或关闭开发者工具，
  // 并在生产环境中忽略 CommandOrControl + R 的刷新操作。
  // 参考 https://github.com/alex8088/electron-toolkit/tree/master/packages/utils。
  // app.on('browser-window-created', (_, window) => {
  //   optimizer.watchWindowShortcuts(window)
  // })

  let lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
  } else {
    app.on("second-instance", (event, commandLine, workingDirectory) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
      }
    });
    let script;
    if (process.platform === "win32") {
      script = path.join(__dirname, "../../xk_main/xk_main.exe");
    } else if (process.platform === "darwin") {
      script = path.join(__dirname, "../../xk_main/xk_main");
    } else {
      script = path.join(__dirname, "../../xk_main/xk_main");
    }
    pythonProcess = spawn(script);
    pythonProcess.stdout.on("data", (data) => {
      console.log(`stdout: ${data}`);
    });
    Menu.setApplicationMenu(null);
    createWindow();
  }

  app.on("activate", function() {
    // 在 macOS 上，当单击应用程序的 Dock 图标且没有其他窗口打开时，重新创建窗口是常见的操作。
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 当所有窗口关闭时退出，但在 macOS 上除外。
// 在 macOS 上，通常应用程序和它们的菜单栏会保持活动状态，直到用户使用 Cmd + Q 明确退出应用程序。
app.on("window-all-closed", () => {
  if (pythonProcess !== null) pythonProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

// 在这个文件中，你可以包含你的应用程序特定的主进程代码。你也可以将它们放在单独的文件中，然后在这里进行引用。

ipcMain.on("switch_window", (event, arg) => {
  // arg里面存着信息
  if (mainWindow) {
    mainWindow.close();
  }
  // const preloadPath = join(__dirname, '../preload/index.js')
  // if (!fs.existsSync(preloadPath)) {
  //   console.error(`Preload script not found at path: ${preloadPath}`);
  // } else {
  //   console.log(`Preload script found at path: ${preloadPath}`);
  // }
  // console.log(preloadPath)
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js")
      // devTools: false, // 禁用开发者工具快捷键
      // webviewTag: false, // 禁用 webview 标签
      // accelerator: {
      //     'Cmd+[': null,
      //     'Cmd+]': null,
      //     'Cmd+W': null,
      //     'Ctrl+R': null
      // }
    },
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#ffffff",
      symbolColor: "#74b1be"
    },
    trafficLightPosition: { x: 20, y: 18 },
    backgroundColor: "#fff",
    minHeight: 600,
    minWidth: 600,
    title: "XKnowledge",
    icon: "static/icon.ico"
  });
  mainWindow.webContents.openDevTools({ mode: "detach" });

  // const menu = new Menu()
  // menu.append(
  //   new MenuItem({
  //     label: '菜单',
  //     submenu: [
  //       {
  //         label: '保存',
  //         accelerator: 'Ctrl+S',
  //         click: () => {
  //           mainWindow.webContents.send('act', 'save')
  //         }
  //       },
  //       {
  //         type: 'separator'
  //       },
  //       {
  //         label: '撤销',
  //         accelerator: 'Ctrl+Z',
  //         click: () => {
  //           mainWindow.webContents.send('act', 'undo')
  //         }
  //       },
  //       {
  //         label: '重做',
  //         accelerator: 'Ctrl+Y',
  //         click: () => {
  //           mainWindow.webContents.send('act', 'redo')
  //         }
  //       },
  //       {
  //         type: 'separator'
  //       },
  //       {
  //         label: '导出文件',
  //         click: () => {
  //           mainWindow.webContents.send('act', 'export')
  //         }
  //       },
  //       {
  //         label: '跳转页面',
  //         click: () => {
  //           mainWindow.webContents.send('open-view', 'chart')
  //         }
  //       }]
  //   }))
  // Menu.setApplicationMenu(menu)

  mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  // 监听渲染进程发出的 'did-finish-load' 事件
  mainWindow.webContents.on("did-finish-load", () => {
    // 页面加载完成后，发送消息到渲染进程
    mainWindow.webContents.send("open-view", "chart");
  });

  // mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
});
