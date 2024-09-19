import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { join } from "path";

const fs = require("fs");

let mainWindow;

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
    trafficLightPosition: { x: 20, y: 18 },
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#ffffff",
      symbolColor: "#74b1be"
    },
    title: "XKnowledge"
  });

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
    Menu.setApplicationMenu(null);
    createWindow();
  }

  app.on("activate", () => {
    // 在 macOS 上，当单击应用程序的 Dock 图标且没有其他窗口打开时，重新创建窗口是常见的操作。
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 当所有窗口关闭时退出，但在 macOS 上除外。
// 在 macOS 上，通常应用程序和它们的菜单栏会保持活动状态，直到用户使用 Cmd + Q 明确退出应用程序。
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

let current_act;

function openChartWindow(data, path) {
  mainWindow.webContents.send("act", "chart");
  mainWindow.setMaximizable(true);
  mainWindow.setMinimizable(true);
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(900, 670);
  mainWindow.webContents.send("data", {
    value: data,
    path: path
  });
}

function openFile() {
  dialog.showOpenDialog(mainWindow, {
    title: "打开",
    properties: ["openFile"],
    filters: [
      { name: "XKnowledge", extensions: ["xk"] }
    ]
  }).then((res) => {
    if (!res.canceled) {
      fs.readFile(res.filePaths[0], "utf-8", (err, data) => {
        openChartWindow(data, res.filePaths[0]);
      });
    }
  }).catch((err) => {
    console.log(err);
  });
}

ipcMain.on("act", (event, act) => {
  // 只有操作需要进行，不需要数据参与
  current_act = act;
  if (act === "open_file") {
    openFile();
  }
});

function saveFile(file_path, data) {
  fs.writeFile(file_path, data, (err) => {
    return !err;
  });
  return true;
}

ipcMain.on("data", (event, arg) => {
  // 当接到操作指令，需要对数据进行操作时
  // console.log(arg);
  if (current_act === "save_file") {
    let saveSuccess = false;
    const data = JSON.stringify(arg.file);
    if (arg.path === "") {
      dialog.showSaveDialog(mainWindow, {
        title: "将文件保存到...",
        properties: ["createDirectory"],
        filters: [
          { name: "XKnowledge", extensions: ["xk"] }
        ]
      }).then((res) => {
        console.log(res);
        if (!res.canceled) {
          saveSuccess = saveFile(res.filePath, data);
          mainWindow.webContents.send("data", {
            value: data,
            path: res.filePath
          });
        }
      }).catch((err) => {
        console.log(err);
      });
    } else {
      console.log("save_file");
      saveSuccess = saveFile(arg.path, data);
    }
    if (saveSuccess) {
      mainWindow.webContents.send("act", "save_success");
    } else {
      mainWindow.webContents.send("act", "save_failure");
    }
  } else if (current_act === "open_template") {
    openChartWindow(JSON.stringify(arg), "");
  } else if (current_act === "save_as") {
    let saveSuccess = false;
    let filePath = arg.path;
    const data = JSON.stringify(arg.file);
    dialog.showSaveDialog(mainWindow, {
      title: "将文件另存为...",
      properties: ["createDirectory"],
      filters: [
        { name: "XKnowledge", extensions: ["xk"] }
      ]
    }).then((res) => {
      console.log(res);
      if (!res.canceled) {
        saveSuccess = saveFile(res.filePath, data);
        filePath = res.filePath;
      }
    }).catch((err) => {
      console.log(err);
    });
    mainWindow.webContents.send("data", {
      value: data,
      path: filePath
    });
    if (saveSuccess) {
      mainWindow.webContents.send("act", "save_success");
    } else {
      mainWindow.webContents.send("act", "save_failure");
    }
  }
});
