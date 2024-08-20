import { app, shell, BrowserWindow, ipcMain, Menu, MenuItem, dialog } from "electron";
import { join } from "path";
import path from "node:path";
import { spawn } from "child_process";

const fs = require("fs");

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
    // let script;
    // if (process.platform === "win32") {
    //   script = path.join(__dirname, "../../xk_main/xk_main.exe");
    // } else if (process.platform === "darwin") {
    //   script = path.join(__dirname, "../../xk_main/xk_main");
    // } else {
    //   script = path.join(__dirname, "../../xk_main/xk_main");
    // }
    // pythonProcess = spawn(script);
    // pythonProcess.stdout.on("data", (data) => {
    //   console.log(`stdout: ${data}`);
    // });
    Menu.setApplicationMenu(null);
    createWindow();
  }

  app.on("activate", () => {
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

ipcMain.on("act", (event, act) => {
  console.log(act);
  if (act === "open_file") {
    dialog.showOpenDialog(mainWindow, {
      title: "打开",
      properties: ["openFile"],
      filters: [
        { name: "XKnowledge", extensions: ["xk"] }
      ]
    }).then((res) => {
      if (!res.canceled) {
        fs.readFile(res.filePaths[0], "utf-8", (err, data) => {
          mainWindow.webContents.send("act", "chart");
          mainWindow.setMaximizable(true);
          mainWindow.setMinimizable(true);
          mainWindow.setResizable(true);
          mainWindow.setMinimumSize(900, 670);
          mainWindow.webContents.send("data", {
            value: data,
            path: res.filePaths[0]
          });
        });
      }
    }).catch((err) => {
      console.log(err);
    });
  } else if (act === "save_file") {
    ipcMain.on("data", (event, arg) => {
      console.log(arg);
      fs.writeFile(arg.path, JSON.stringify(arg.file), (err) => {
        if (err) {
          console.log(err);
        }
        console.log("data saved");
      });
    });
  } else if (act === "save_as") {
    ipcMain.on("data", (event, data) => {
      const data_json = JSON.stringify(data);
      dialog.showSaveDialog(mainWindow, {
        title: "将文件保存到...",
        properties: ["createDirectory"],
        filters: [
          { name: "XKnowledge", extensions: ["xk"] }
        ]
      }).then((res) => {
        console.log(res);
        if (!res.canceled) {
          fs.writeFile(res.filePath, data_json, (err) => {
            if (err) {
              console.log(err);
            } else {
              mainWindow.webContents.send("act", "chart");
              mainWindow.setMaximizable(true);
              mainWindow.setMinimizable(true);
              mainWindow.setResizable(true);
              mainWindow.setMinimumSize(900, 670);
              mainWindow.webContents.send("data", {
                value: data_json,
                path: res.filePath
              });
            }
            console.log("data saved");
          });
        }
      }).catch((err) => {
        console.log(err);
      });
    });
  }
});
