const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1200,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL('http://localhost:5000');
}

app.on('ready', () => {
  let lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
  } else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

      // 指定虚拟环境的python执行路径
    const py = path.join(__dirname, 'venv\\Scripts\\python.exe');  //在Unix或MacOS上使用venv/bin/python
    // 指定要运行的Flask应用
    const script = path.join(__dirname, 'xk_main.py');
    pythonProcess= spawn(py, [script]);
    pythonProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }

  if (pythonProcess != null) {
    pythonProcess.kill('SIGTERM');
  }
});