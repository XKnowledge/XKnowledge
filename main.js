const { app, BrowserWindow, Menu, MenuItem, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess = null;
let url = "http://localhost:5000";

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            devTools: false, // 禁用开发者工具快捷键
            webviewTag: false, // 禁用 webview 标签
            accelerator: {
                'Cmd+[': null,
                'Cmd+]': null,
                'Cmd+W': null,
                'Ctrl+R': null
            }
        },
        backgroundColor: "#fff",
        minHeight: 600,
        minWidth: 600,
        title: "XKnowledge",
        icon: "static/icon.ico"
    });

    mainWindow.loadURL(url);
    mainWindow.on("ready-to-show", () => {
        mainWindow.show();
    });
}

// 不要使用app.on
// on会出现问题，参考https://github.com/electron/electron/pull/21972
// 文档https://www.electronjs.org/zh/docs/latest/tutorial/tutorial-first-app
app.whenReady().then(() => {
    let lock = app.requestSingleInstanceLock();
    if (!lock) {
        app.quit();
    } else {
        app.on('second-instance', (event, commandLine, workingDirectory) => {
            if (mainWindow) {
                if (mainWindow.isMinimized()) {
                    mainWindow.restore();
                }
                mainWindow.focus();
            }
        });

        // 指定虚拟环境的python执行路径
        let py = null;  //在Unix或MacOS上使用xkvenv/bin/python
        if (process.platform !== 'darwin') {
            py = path.join(__dirname, 'xkvenv/Scripts/python.exe');
        } else {
            py = path.join(__dirname, 'xkvenv/bin/python.exe');
        }
        // 指定要运行的Flask应用
        const script = path.join(__dirname, 'xk_main.py');
        pythonProcess = spawn(py, [script]);
        pythonProcess.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        const menu = new Menu();
        menu.append(new MenuItem({
            label: "菜单",
            submenu: [
                {
                    label: "新建文件",
                    // accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Alt+Shift+I',
                    click: () => {
                        mainWindow.webContents.send("act", "new_file");
                    }
                },
                {
                    label: "导入本地文件",
                    // accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Alt+Shift+I',
                    click: () => {
                        mainWindow.webContents.send("act", "export_file");
                    }
                }]
        }));
        Menu.setApplicationMenu(menu);

        createWindow();
    }
});

ipcMain.on('switch_window', (event, arg) => {
    // arg里面存着信息
    if (mainWindow) {
        mainWindow.close();
    }
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            devTools: false, // 禁用开发者工具快捷键
            webviewTag: false, // 禁用 webview 标签
            accelerator: {
                'Cmd+[': null,
                'Cmd+]': null,
                'Cmd+W': null,
                'Ctrl+R': null
            }
        },
        backgroundColor: "#fff",
        minHeight: 600,
        minWidth: 600,
        title: "XKnowledge",
        icon: "static/icon.ico"
    });

    const menu = new Menu()
    menu.append(new MenuItem({
        label: "菜单",
        submenu: [
            {
                label: "保存",
                accelerator: 'Ctrl+S',
                click: () => {
                    mainWindow.webContents.send("act", "save");
                }
            },
            {
                type: "separator"
            },
            {
                label: "撤销",
                accelerator: 'Ctrl+Z',
                click: () => {
                    mainWindow.webContents.send("act", "undo");
                }
            },
            {
                label: "重做",
                accelerator: 'Ctrl+Y',
                click: () => {
                    mainWindow.webContents.send("act", "redo");
                }
            }]
    }));
    Menu.setApplicationMenu(menu);

    mainWindow.loadURL(url + "/XKMainView");
    mainWindow.on("ready-to-show", () => {
        mainWindow.show();
    });
});

app.on('window-all-closed', () => {
    if (pythonProcess != null) {
        pythonProcess.kill();
    }

    if (process.platform !== 'darwin') {
        app.quit();
    }
});
