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
      devTools: false, // 禁用开发者工具快捷键
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
let status = "open";

function appExit() {
  if (process.platform !== "darwin") {
    app.exit(); // 不能使用app.quit()，否则陷入循环
    // 见https://www.electronjs.org/zh/docs/latest/api/app#appquit
  }
}

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

  mainWindow.on("close", e => {
    e.preventDefault(); //先阻止一下默认行为，不然直接关了，提示框只会闪一下
    mainWindow.webContents.send("act", "quit");
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
  });
}

ipcMain.on("act", (event, act) => {
  // 只有操作需要进行，不需要数据参与
  current_act = act;
  switch (act) {
    case "open_file":
      openFile();
      break;
    case "unsaved":
      dialog.showMessageBox({
        type: "info",
        title: "确认退出",
        message: "文件未保存，是否退出？",
        buttons: ["保存", "放弃", "取消"],   //选择按钮，点击确认则下面的idx为0，取消为1
        cancelId: 2 //这个的值是如果直接把提示框×掉返回的值，这里设置成和“取消”按钮一样的值，下面的idx也会是1
      }).then(idx => {
        //注意上面↑是用的then，网上好多是直接把方法做为showMessageBox的第二个参数，我的测试下不成功
        switch (idx.response) {
          case 0:
            status = "exit";
            mainWindow.webContents.send("act", "save_file");
            break;
          case 1:
            // 不保存直接退出
            appExit();
            break;
          case 2:
            // 取消退出
            break;
        }
      });
      break;
    case "saved":
      appExit();
      break;
  }
});

ipcMain.on("data", (event, arg) => {
  // 当接到操作指令，需要对数据进行操作时
  if (current_act === "save_file") {
    const data = JSON.stringify(arg.file);
    if (arg.path === "") {
      const filePath = dialog.showSaveDialogSync(mainWindow, {
        title: "将文件保存到...",
        properties: ["createDirectory"],
        filters: [
          { name: "XKnowledge", extensions: ["xk"] }
        ]
      });
      if (filePath !== undefined) {
        fs.writeFileSync(filePath, data);
        mainWindow.webContents.send("data", {
          value: data,
          path: filePath
        });
        mainWindow.webContents.send("act", "save_success");
      } else {
        mainWindow.webContents.send("act", "save_failure");
        status = "open";
      }
    } else {
      fs.writeFileSync(arg.path, data);
    }
    if (status === "exit") {
      appExit();
    }
  } else if (current_act === "open_template") {
    openChartWindow(JSON.stringify(arg), "");
  } else if (current_act === "save_as") {
    const data = JSON.stringify(arg.file);
    let filePath = dialog.showSaveDialogSync(mainWindow, {
      title: "将文件另存为...",
      properties: ["createDirectory"],
      filters: [
        { name: "XKnowledge", extensions: ["xk"] }
      ]
    });
    if (filePath !== undefined) {
      fs.writeFileSync(filePath, data);
      mainWindow.webContents.send("act", "save_success");
    } else {
      filePath = arg.path;
      mainWindow.webContents.send("act", "save_failure");
    }
    mainWindow.webContents.send("data", {
      value: data,
      path: filePath
    });
  }
});
