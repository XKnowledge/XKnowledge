# IPC 通讯重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 act/data 双通道时序配对的 IPC 重构为具名通道 + `invoke/handle` 请求-响应模式，删除 `windowContexts` 状态机，拆分主进程文件。

**Architecture:** 通道常量集中定义于 `src/shared/ipc-channels.js`；主进程拆为 `index.js`（装配）/ `windowManager.js`（窗口）/ `fileService.js`（文件）/ `ipc.js`（通道注册）；渲染端新增 `chartStore.js` 承接同窗口首页→图表页数据传递。迁移按通道渐进进行，任意提交点应用可运行。

**Tech Stack:** Electron 28（`ipcMain.handle` / `ipcRenderer.invoke` / `contextBridge`）、electron-vite 2、Vue 3 + vue-router（hash 路由）、ant-design-vue 4。

**Spec:** `docs/superpowers/specs/2026-09-11-ipc-refactor-design.md`

## Global Constraints

- 项目无测试框架：每个任务的自动化验证 = `npm run build`（electron-vite 三端编译，可捕获语法/导入错误），行为验证 = `npm run dev` 手动走查（各任务列出要点）。
- 纯 JavaScript，不引入 TypeScript；IPC 边界上 `content` 一律为 JSON 字符串（主进程不 parse 业务数据，仅做 `JSON.parse` 合法性校验）。
- 通道名只允许出现在 `src/shared/ipc-channels.js`（定义处）和 `src/preload/index.js`（引用常量），业务代码禁止裸字符串。
- 渐进迁移：`preload` 的旧方法（`sendAct/receiveAct/sendData/receiveData`）保留到 Task 8 才删除；期间新旧并存。
- 用户可见行为保持不变，已批准的四处例外（见 spec 行为对照表）：保存后不再重发 data、打开失败由渲染端提示、取消打开对话框静默（现状是关窗）、未保存退出改为 request-close 线性流程。
- 注释与提交信息使用简体中文，风格与现有代码一致（JSDoc 风格块注释）。
- 提交信息格式：`feat：`/`refactor：`/`fix：` + 中文描述（与仓库历史一致）。

## 现状调用点清单（迁移核对用）

| 调用点 | 现状 | 迁移后 |
|---|---|---|
| `BasicLayout.vue:92` 打开本地文件按钮 | `sendAct('open_file')` | `await openFile()` + `setPendingChart` + `router.push('chart')` |
| `BasicLayout.vue:95-99` receiveAct('chart') 跳路由 | 借道主进程 | 删除，本地跳转 |
| `XkCardList.vue:37-38` 双击模板 | `sendAct('open_template')`+`sendData(...)` | 本地 `setPendingChart` + `router.push`，无 IPC |
| `ChartView.vue:202-237` receiveData 装载 | 主进程发 data | `chartStore`/`take-pending-chart` + `loadChartData()` |
| `ChartView.vue:574-575` 新建文件 | `sendAct`+`sendData` | `newChartWindow({ content })` |
| `ChartView.vue:583` 打开其他文件 | `sendAct('open_other_file')` | `await openFile()` → `newChartWindow` |
| `ChartView.vue:591-592` 保存 | `sendAct`+`sendData` | `await saveFile({ path, content })` |
| `ChartView.vue:602-603` 另存为 | `sendAct`+`sendData` | `await saveFileAs({ content })` |
| `ChartView.vue:608-630` receiveAct(save_success/save_failure/quit/save_file) | 反向通知 | 全部删除，由 invoke 返回值与 `onRequestClose` 取代 |

---

### Task 1: 共享通道常量模块

**Files:**
- Create: `src/shared/ipc-channels.js`

**Interfaces:**
- Consumes: 无
- Produces: `IPC` 对象（命名属性见下方代码），后续所有任务从此处 import。

- [ ] **Step 1: 创建常量模块**

创建 `src/shared/ipc-channels.js`：

```js
/**
 * IPC 通道名单一定义：主进程（src/main）与 preload 共同引用。
 * 业务代码禁止书写裸通道字符串，一律从本模块导入。
 * 命名约定：<域>:<动作>；各通道的参数与返回值约定见
 * docs/superpowers/specs/2026-09-11-ipc-refactor-design.md 的通道契约表。
 */
export const IPC = {
  // 文件域
  FILE_OPEN: 'file:open',
  FILE_SAVE: 'file:save',
  FILE_SAVE_AS: 'file:save-as',

  // 应用/窗口域
  APP_NEW_CHART_WINDOW: 'app:new-chart-window',
  APP_TAKE_PENDING_CHART: 'app:take-pending-chart',
  APP_ENTER_CHART_MODE: 'app:enter-chart-mode',
  APP_CLOSE_WINDOW: 'app:close-window',
  APP_CONFIRM_UNSAVED: 'app:confirm-unsaved',
  APP_REQUEST_CLOSE: 'app:request-close'
}
```

- [ ] **Step 2: 验证构建通过**

Run: `npm run build`
Expected: 三端（main/preload/renderer）构建成功，无报错（新文件尚未被引用，仅验证无语法错误）。

- [ ] **Step 3: 提交**

```bash
git add src/shared/ipc-channels.js
git commit -m "refactor：新增共享 IPC 通道常量模块"
```

---

### Task 2: 拆分主进程文件（纯移动，行为不变）

**Files:**
- Create: `src/main/windowManager.js`
- Create: `src/main/fileService.js`
- Create: `src/main/ipc.js`
- Modify: `src/main/index.js`（瘦身为装配入口）

**Interfaces:**
- Consumes: Task 1 的 `IPC`（本任务暂未用到，Task 3 起使用）。
- Produces:
  - `windowManager.js`: `createWindow()` 返回 `BrowserWindow`；`openChartWindow(window, data, path)`（legacy，Task 5 拆除）。
  - `fileService.js`: `showOpenDialog(window)` → Promise\<OpenDialogReturnValue>；`readChartFile(filePath)` → Promise\<{content, path}>，取消外的失败 throw `{ code, message, detail, path }`；`saveChartFileAs(window, content, title)` → Promise\<{path} | {canceled}>；`writeChartFile(filePath, content)` → Promise\<{path}>。
  - `ipc.js`: `registerIpc()`（内部注册 legacy 的 `ipcMain.on('act')`/`ipcMain.on('data')`，Task 3-7 逐步改造，Task 8 删除 legacy）。
- 本任务后应用行为与重构前完全一致（全量手动回归）。

- [ ] **Step 1: 创建 fileService.js**

创建 `src/main/fileService.js`（把 `src/main/index.js` 中 `openFile`/`saveFile` 的文件逻辑抽出，对话框与读写改为 Promise 风格；错误弹窗与销毁窗口留在 ipc 层）：

```js
import fs from 'fs'
import { dialog } from 'electron'

const FILE_FILTERS = [{ name: 'XKnowledge', extensions: ['xk'] }]

/**
 * 弹出"打开"对话框。返回 electron 原生的 ShowOpenDialogReturnValue
 * （canceled / filePaths），不负责后续读取。
 */
export const showOpenDialog = (window) =>
  dialog.showOpenDialog(window, {
    title: '打开',
    properties: ['openFile'],
    filters: FILE_FILTERS
  })

/**
 * 读取并校验 .xk 文件内容。
 * 成功返回 { content, path }（content 为文件原始文本）。
 * 读取失败或 JSON 非法时 throw { code, message, detail, path }，
 * 由调用方决定如何提示用户。
 */
export const readChartFile = async (filePath) => {
  let data
  try {
    data = await fs.promises.readFile(filePath, 'utf-8')
  } catch (err) {
    throw {
      code: 'READ_FAILED',
      message: '文件读取失败',
      detail: String(err),
      path: filePath
    }
  }

  // 在主进程先校验文件内容，损坏的文件不发给渲染进程，避免渲染端崩溃
  try {
    JSON.parse(data)
  } catch (err) {
    throw {
      code: 'INVALID_JSON',
      message: '文件已损坏或不是有效的 XKnowledge 文件',
      detail: filePath,
      path: filePath
    }
  }

  return { content: data, path: filePath }
}

/**
 * 弹出另存对话框并写入文件。
 * 用户取消返回 { canceled: true }；成功返回 { path }。
 */
export const saveChartFileAs = async (window, content, title) => {
  const { filePath } = await dialog.showSaveDialog(window, {
    title,
    properties: ['createDirectory'],
    filters: FILE_FILTERS
  })

  if (!filePath) return { canceled: true }
  await fs.promises.writeFile(filePath, content, 'utf-8')
  return { path: filePath }
}

/**
 * 按给定路径写入文件（保存场景，不弹对话框）。
 */
export const writeChartFile = async (filePath, content) => {
  await fs.promises.writeFile(filePath, content, 'utf-8')
  return { path: filePath }
}
```

- [ ] **Step 2: 创建 windowManager.js**

创建 `src/main/windowManager.js`（把 `createWindow` 与 `openChartWindow` 原样搬入；`windowContexts` 的清理钩子留在 ipc.js，windowManager 通过 `onWindowClosed` 回调解耦）：

```js
import { BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'

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

  // 窗口销毁后通知调用方清理其按窗口记录的状态，避免Map持续增长
  current_window.on('closed', () => {
    if (onWindowClosed) onWindowClosed(current_window.webContents.id)
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
```

`openChartWindow`（legacy，Task 5 拆除）也搬入本文件，内容与现状 `src/main/index.js:138-150` 完全一致：

```js
/**
 * 【legacy】装载图表：解锁窗口尺寸、下发图表数据、注册关闭前确认。
 * Task 5 起由渲染端 invoke app:enter-chart-mode 取代。
 */
export const openChartWindow = (current_window, data, path) => {
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
```

- [ ] **Step 3: 创建 ipc.js（legacy 逻辑原样搬入）**

创建 `src/main/ipc.js`（`windowContexts`/`getContext`/两个 `ipcMain.on` 原样搬入；`openFile`/`saveFile` 内部改用 fileService 的 Promise 函数，弹窗与销毁行为不变）：

```js
import { BrowserWindow, dialog, ipcMain } from 'electron'
import * as fileService from './fileService'
import { createWindow, openChartWindow } from './windowManager'

// 每个窗口独立的IPC上下文：记录该窗口最近一次act指令与退出流程状态。
// 不能用全局变量：多窗口并发时act/data的配对会互相干扰，
// 甚至一个窗口的退出流程会把另一个窗口误关。
// 【legacy】Task 8 随 act/data 通道一并删除。
const windowContexts = new Map() // webContents.id -> { act, status }

const getContext = (webContents) => {
  if (!windowContexts.has(webContents.id)) {
    windowContexts.set(webContents.id, { act: null, status: 'open' })
  }
  return windowContexts.get(webContents.id)
}

/**
 * 【legacy】打开文件对话框 + 读取校验 + 装载图表。
 * 失败与取消时的弹窗/销毁行为与重构前一致。
 */
const legacyOpenFile = (current_window) => {
  fileService.showOpenDialog(current_window).then((res) => {
    if (!res.canceled) {
      fileService.readChartFile(res.filePaths[0])
        .then(({ content, path }) => {
          openChartWindow(current_window, content, path)
        })
        .catch((err) => {
          dialog.showMessageBoxSync(current_window, {
            type: 'error',
            title: '打开失败',
            message: err.message,
            detail: err.detail
          })
          current_window.destroy()
        })
    } else {
      current_window.destroy()
    }
  }).catch((err) => {
    console.log(err)
    current_window.destroy()
  })
}

/**
 * 【legacy】保存（可能弹另存对话框）并回发 save_success 与文件数据。
 */
const legacySaveFile = async (data, dialogTitle, current_window, ctx) => {
  const res = await fileService.saveChartFileAs(
    current_window, JSON.stringify(data.file), dialogTitle
  )
  if (res.canceled) {
    current_window.webContents.send('act', 'save_failure')
    ctx.status = 'open'
    return
  }
  current_window.webContents.send('act', 'save_success')
  current_window.webContents.send('data', { value: JSON.stringify(data.file), path: res.path })
}

export const registerIpc = () => {
  ipcMain.on('act', (event, act) => {
    // 只有操作需要进行，不需要数据参与
    const ctx = getContext(event.sender)
    ctx.act = act
    const current_window = BrowserWindow.fromWebContents(event.sender)
    const actions = {
      open_file: () => legacyOpenFile(current_window),

      unsaved: async () => {
        const { response } = await dialog.showMessageBox({
          type: 'info',
          title: '确认退出',
          message: '文件未保存，是否退出？',
          buttons: ['保存', '放弃', '取消'],
          cancelId: 2
        })

        if (response === 0) {
          // 保存文件并退出
          ctx.status = 'exit'
          current_window.webContents.send('act', 'save_file')
        } else if (response === 1) {
          // 不保存直接退出
          current_window.destroy()
        }
        // 取消退出
      },

      saved: () => current_window.destroy(),

      open_other_file: () => legacyOpenFile(createWindow())
    }

    if (actions[act]) {
      actions[act]()
    }
  })

  ipcMain.on('data', (event, arg) => {
    // 当接到操作指令，需要对数据进行操作时
    console.log(arg)
    const current_window = BrowserWindow.fromWebContents(event.sender)
    const ctx = getContext(event.sender)
    const handles = {
      save_file: async () => {
        if (!arg.path) {
          await legacySaveFile(arg, '将文件保存到...', current_window, ctx)
        } else {
          await fileService.writeChartFile(arg.path, JSON.stringify(arg.file))
          current_window.webContents.send('act', 'save_success')
        }
        if (ctx.status === 'exit') {
          current_window.destroy()
          ctx.status = 'open'
        }
      },

      open_template: () => openChartWindow(current_window, JSON.stringify(arg), ''),

      save_as: () => legacySaveFile(arg, '将文件另存为...', current_window, ctx),

      create_new_file: () => {
        console.log('create new file')
        const new_window = createWindow()
        new_window.webContents.on('did-finish-load',
          () => openChartWindow(new_window, JSON.stringify(arg), ''))
      }
    }

    if (handles[ctx.act]) {
      handles[ctx.act]()
    }
  })
}
```

注意与原代码的差异（行为等价）：原来 `saveFile` 内的同步 `showSaveDialogSync`/`writeFileSync` 改为 fileService 的异步版本，`save_failure`/`save_success` 通知时机不变。

- [ ] **Step 4: 瘦身 index.js**

`src/main/index.js` 全量替换为（`windowContexts` 归 ipc.js 私有，index.js 只通过 `cleanupWindowContext` 解耦清理）：

```js
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
```

对应 ipc.js 需导出（放在 `windowContexts` 定义之后）：

```js
/**
 * 【legacy】窗口销毁时清理其IPC上下文。Task 8 删除。
 */
export const cleanupWindowContext = (webContentsId) => {
  windowContexts.delete(webContentsId)
}
```

ipc.js 内部所有创建窗口的调用统一走包装（保证清理钩子不遗漏）：

```js
const openNewWindow = () => createWindow(cleanupWindowContext)
```

即 ipc.js 中两处创建窗口（`open_other_file` 分支、`create_new_file` 分支）都调用 `openNewWindow()`。

同时删除原 index.js 中被搬走的全部代码（`fs` require、`createWindow` 旧体、`windowContexts`、`openChartWindow`、`openFile`、`saveFile`、两个 `ipcMain.on`）。

- [ ] **Step 5: 验证构建通过**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 6: 手动回归（本任务要求全量，因为是纯移动的基线）**

Run: `npm run dev`，逐项验证与重构前一致：
1. 首页"打开本地文件"：正常文件进入图表、损坏文件弹错误框后关窗、取消对话框关窗；
2. 首页双击模板进入图表；
3. 图表页保存（有路径/无路径）、另存为；
4. 图表页新建文件（新窗口）、打开其他文件（新窗口）;
5. 未保存退出三按钮；多开两个窗口分别操作互不干扰。

- [ ] **Step 7: 提交**

```bash
git add src/main/
git commit -m "refactor：拆分主进程为 windowManager/fileService/ipc 三个模块（行为不变）"
```

---

### Task 3: 保存通道（file:save / file:save-as）

**Files:**
- Modify: `src/main/ipc.js`（新增两个 handle；legacy 保存分支同步收敛）
- Modify: `src/preload/index.js`（追加 `saveFile`/`saveFileAs`，旧方法保留）

**Interfaces:**
- Consumes: Task 1 `IPC`；Task 2 `fileService.saveChartFileAs/writeChartFile`。
- Produces:
  - 主进程：`ipcMain.handle(IPC.FILE_SAVE, (e, { path, content }) => Promise<{path} | {canceled}>)`；`ipcMain.handle(IPC.FILE_SAVE_AS, (e, { content }) => 同上)`。
  - preload：`saveFile({ path, content })` / `saveFileAs({ content })`，均返回 Promise，主进程写失败时 reject（`ipcMain.handle` 内 throw 的对象会传到渲染端）。

- [ ] **Step 1: ipc.js 注册两个 handle**

在 `registerIpc()` 开头（legacy 注册之前）加入：

```js
  ipcMain.handle(IPC.FILE_SAVE, async (event, { path, content }) => {
    const current_window = BrowserWindow.fromWebContents(event.sender)
    if (!path) {
      return fileService.saveChartFileAs(current_window, content, '将文件保存到...')
    }
    return fileService.writeChartFile(path, content)
  })

  ipcMain.handle(IPC.FILE_SAVE_AS, async (event, { content }) => {
    const current_window = BrowserWindow.fromWebContents(event.sender)
    return fileService.saveChartFileAs(current_window, content, '将文件另存为...')
  })
```

并在 ipc.js 顶部加 `import { IPC } from '../shared/ipc-channels'`。

- [ ] **Step 2: preload 追加两个方法**

`src/preload/index.js` 改为（旧四方法保留）：

```js
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

contextBridge.exposeInMainWorld('electronAPI', {
  /* 【legacy】Task 8 删除 */
  receiveAct: (callback) => ipcRenderer.on('act', (_event, data) => callback(data)),
  sendAct: (act) => ipcRenderer.send('act', act),
  receiveData: (callback) => ipcRenderer.on('data', (_event, data) => callback(data)),
  sendData: (data) => ipcRenderer.send('data', data),

  /* 新通道 */
  saveFile: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE, payload),
  saveFileAs: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE_AS, payload)
})
```

- [ ] **Step 3: ChartView 的 saveFile/saveAs 改 invoke**

`src/renderer/src/page/ChartView.vue` 中原 `saveFile`/`saveAs`（586-606 行）替换为：

```js
const saveFile = async () => {
  /**
   * 实现文件保存：有路径直接写，无路径由主进程弹另存对话框。
   * 返回是否保存成功（供退出流程使用）。
   */
  try {
    const res = await window.electronAPI.saveFile({
      path: filePath,
      content: JSON.stringify(jsonReactive(xkContext.value.chartData))
    })
    if (res.canceled) return false
    filePath = res.path
    saveNodeVisible.value = false
    resetSider()
    resetRefData()
    return true
  } catch (err) {
    console.error('保存失败', err)
    message.error('保存失败')
    saveNodeVisible.value = true
    return false
  }
}

const saveAs = async () => {
  /**
   * 实现文件另存为。
   */
  try {
    const res = await window.electronAPI.saveFileAs({
      content: JSON.stringify(jsonReactive(xkContext.value.chartData))
    })
    if (res.canceled) return
    filePath = res.path
    saveNodeVisible.value = false
    resetSider()
    resetRefData()
  } catch (err) {
    console.error('另存为失败', err)
    message.error('另存为失败')
  }
}
```

- [ ] **Step 4: 拆除旧保存的反向通知链**

同文件 `receiveAct` 回调（608-630 行）改为（删 `save_success`/`save_failure` 分支；`save_file` 分支改为保存成功后发 `saved` 关窗；`quit` 保留至 Task 7）：

```js
window.electronAPI.receiveAct((act) => {
  console.log(act)
  const actionHandlers = {
    quit: () => {
      const hasUnsavedChanges = saveNodeVisible.value
      window.electronAPI.sendAct(hasUnsavedChanges ? 'unsaved' : 'saved')
    },

    save_file: async () => {
      // 【legacy】退出前保存：保存成功后通知主进程销毁窗口。
      // Task 7 由 onRequestClose 线性流程取代。
      const ok = await saveFile()
      if (ok) window.electronAPI.sendAct('saved')
    }
  }

  if (actionHandlers[act]) actionHandlers[act]()
})
```

主进程 `src/main/ipc.js` 对应收敛：
- `unsaved` 分支删除 `ctx.status = 'exit'`（保存后退出改由渲染端发 `saved`），其余不动；
- `data` 处理器删除 `save_file` 与 `save_as` 两个分支（渲染端不再经 data 通道保存）；
- `legacySaveFile` 函数整个删除；
- `ctx.status` 已无写入方，`getContext` 里 `status: 'open'` 保留（Task 8 一并删）。

- [ ] **Step 5: 验证构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 6: 手动验证**

`npm run dev`：
1. 图表页 Ctrl+S（有 filePath）：写入成功、未保存提示消失、**图表不重绘**（对照：旧版会闪一下）；
2. 新建模板后直接 Ctrl+S：弹另存对话框，保存后标题路径生效；取消对话框：无变化、未保存提示保留；
3. 另存为：新路径保存成功；
4. 自动保存：修改后等 1 分钟（或临时把 interval 改 5s 验证后改回）触发保存；
5. 未保存退出：点关闭 → 选"保存" → 另存对话框 → 保存后窗口关闭（走新的 save_file→saved 链）；
6. 打开文件、双击模板、新建窗口等 legacy 流程不受影响。

- [ ] **Step 7: 提交**

```bash
git add src/main/ipc.js src/preload/index.js src/renderer/src/page/ChartView.vue
git commit -m "refactor：保存/另存为迁移到 file:save 与 file:save-as invoke 通道"
```

---

### Task 4: 打开文件通道 + 首页本地跳转 + chartStore + enter-chart-mode + close-window

**Files:**
- Create: `src/renderer/src/store/chartStore.js`
- Modify: `src/main/ipc.js`（`FILE_OPEN`/`APP_CLOSE_WINDOW`/`APP_ENTER_CHART_MODE` handle；删 legacy `open_file` act 分支）
- Modify: `src/main/windowManager.js`（新增 `enterChartMode`，`openChartWindow` 复用它）
- Modify: `src/preload/index.js`（追加 `openFile`/`closeWindow`/`enterChartMode`）
- Modify: `src/renderer/src/layouts/BasicLayout.vue`（打开按钮改 invoke + 本地跳转；`receiveAct('chart')` 保留至 Task 5）
- Modify: `src/renderer/src/page/ChartView.vue`（装载逻辑函数化 + 挂载时装载 + enterChartMode）

**Interfaces:**
- Consumes: Task 2 `fileService.showOpenDialog/readChartFile`。
- Produces:
  - `chartStore.js`: `setPendingChart({ content, path })` / `takePendingChart()`（返回并清空）。
  - windowManager: `enterChartMode(window)`（幂等：解锁窗口尺寸 + 注册 close 拦截）。
  - 主进程 handle：`FILE_OPEN` → `{ content, path } | { canceled: true }`，失败 reject（错误对象含 `message`）；`APP_CLOSE_WINDOW` → 销毁调用方窗口；`APP_ENTER_CHART_MODE` → 无返回值要求。
  - preload: `openFile()` / `closeWindow()` / `enterChartMode()`。
  - ChartView: `loadChartData(content, path)`（原 receiveData 回调体）。

- [ ] **Step 1: 创建 chartStore.js**

创建 `src/renderer/src/store/chartStore.js`：

```js
/**
 * 同一窗口内 首页 → 图表页 的图表数据传递。
 * 首页（打开文件/双击模板）set，ChartView 挂载时 take（取后即清）。
 * 跨窗口传递不经过这里（新窗口走主进程 take-pending-chart 通道）。
 */
let pending = null

export const setPendingChart = (value) => {
  pending = value
}

export const takePendingChart = () => {
  const value = pending
  pending = null
  return value
}
```

- [ ] **Step 2: windowManager 新增 enterChartMode**

`src/main/windowManager.js` 顶部加 `import { IPC } from '../shared/ipc-channels'`，新增：

```js
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
    current_window.webContents.send(IPC.APP_REQUEST_CLOSE)
  })

  current_window.on('closed', () => chartModeWindows.delete(id))
}
```

注意：`APP_REQUEST_CLOSE` 的推送需要 preload 的 `onRequestClose` 监听，但 preload 在 Task 7 才加该方法——期间图表页点关闭会收到一个无人监听的推送（无害，但窗口关不掉）。**因此本任务的过渡写法**：close 拦截仍发 `'quit'`（legacy），Task 7 再切换为 `IPC.APP_REQUEST_CLOSE`。即本任务 `enterChartMode` 里 close 拦截体暂时为：

```js
  current_window.on('close', e => {
    e.preventDefault()
    current_window.webContents.send('act', 'quit') // 【legacy】Task 7 改为 APP_REQUEST_CLOSE
  })
```

`openChartWindow`（legacy，供模板/新建窗口流程继续使用）改为复用 enterChartMode：

```js
export const openChartWindow = (current_window, data, path) => {
  current_window.webContents.send('act', 'chart')
  enterChartMode(current_window)
  current_window.webContents.send('data', { value: data, path: path })
}
```

- [ ] **Step 3: ipc.js 注册三个 handle 并删 legacy open_file 分支**

`registerIpc()` 中新增（放在 Task 3 的 handle 之后）：

```js
  ipcMain.handle(IPC.FILE_OPEN, async (event) => {
    const current_window = BrowserWindow.fromWebContents(event.sender)
    const res = await fileService.showOpenDialog(current_window)
    if (res.canceled) return { canceled: true }
    // readChartFile 失败时 throw，经 invoke 自动变为渲染端 reject
    return fileService.readChartFile(res.filePaths[0])
  })

  ipcMain.handle(IPC.APP_CLOSE_WINDOW, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.destroy()
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_ENTER_CHART_MODE, (event) => {
    enterChartMode(BrowserWindow.fromWebContents(event.sender))
    return { ok: true }
  })
```

ipc.js 的 import 改为 `import { createWindow, openChartWindow, enterChartMode } from './windowManager'`（按实际使用调整）。

同时删除 legacy `act` 处理器中的 `open_file: () => legacyOpenFile(current_window)` 这一行（首页不再发送 `open_file` act）。`legacyOpenFile` 函数本身保留——`open_other_file` 分支仍在使用它，Task 6 一并删除。

- [ ] **Step 4: preload 追加三个方法**

在 `src/preload/index.js` 的 `exposeInMainWorld` 对象中追加：

```js
  openFile: () => ipcRenderer.invoke(IPC.FILE_OPEN),
  closeWindow: () => ipcRenderer.invoke(IPC.APP_CLOSE_WINDOW),
  enterChartMode: () => ipcRenderer.invoke(IPC.APP_ENTER_CHART_MODE),
```

- [ ] **Step 5: BasicLayout 打开按钮改造**

`src/renderer/src/layouts/BasicLayout.vue` 的 `openFile`（91-93 行）替换，并新增 import：

```js
import { message } from 'ant-design-vue'
import { setPendingChart } from '../store/chartStore'
```

```js
const openFile = async () => {
  /**
   * 打开本地文件：读取与校验在主进程完成，成功后本地跳转图表页。
   */
  let res
  try {
    res = await window.electronAPI.openFile()
  } catch (err) {
    console.error('打开失败', err)
    message.error(err.message || '打开失败')
    // 首页窗口没有可展示的内容，提示后关闭（与旧行为的关窗一致）
    window.electronAPI.closeWindow()
    return
  }
  if (res.canceled) return
  setPendingChart({ value: res.content, path: res.path })
  router.push('chart')
}
```

（`chartStore` 存 `{ value, path }` 形状，与 `loadChartData(data)` 的参数 `data.value / data.path` 对齐，装载函数无需适配层。）

- [ ] **Step 6: ChartView 装载函数化 + 挂载装载 + enterChartMode**

`src/renderer/src/page/ChartView.vue`：

a) 原 `window.electronAPI.receiveData((data) => {...})`（202-237 行）整体替换为普通函数（回调体逻辑原样保留，仅参数化）：

```js
const loadChartData = (data) => {
  // 解析失败时提示而不是让整个页面崩溃
  try {
    xkContext.value.chartData = JSON.parse(data.value)
  } catch (e) {
    console.error('文件内容解析失败', e)
    message.error('文件内容已损坏或格式不正确，无法打开')
    return
  }

  if (!xkContext.value.chartData?.series?.[0]) {
    message.error('文件内容已损坏或格式不正确，无法打开')
    return
  }

  filePath = data.path

  if (chartDom.value) {
    // echarts实例和click监听只初始化一次。
    chartInstance = chartInstance || echarts.init(chartDom.value)
    if (!chartInstance.hasClickBound) {
      chartInstance.on('click', clickChart)
      chartInstance.hasClickBound = true
    }

    initChartData()
    initAttr()
    xkContext.value.updateChart = !xkContext.value.updateChart
    nextTick(() => {
      saveNodeVisible.value = false
    })
  }
}

// 【legacy】模板/新建窗口流程仍由主进程推送 data，Task 5/6 移除
window.electronAPI.receiveData(loadChartData)
```

注意：原代码靠"保存后重发 data 但 chartInstance 已存在"避免重复 init；现在直接判断 `chartInstance` 是否已初始化，并增加 `hasClickBound` 标记防重复绑定（挂载装载与 legacy 推送都走此函数）。

b) `onMounted`（184-195 行）追加装载与 enterChartMode：

```js
onMounted(async () => {
  // 调用渲染图表逻辑
  window.addEventListener('resize', resizeChart)
  window.addEventListener('keydown', shortcut)

  // 同窗口跳转（首页打开/模板）：从 chartStore 取数据装载
  const local = takePendingChart()
  if (local) {
    loadChartData(local)
  }
  // 通知主进程解锁窗口并注册关闭确认
  window.electronAPI.enterChartMode()

  setInterval(() => {
    // 1分钟保存一次
    if (saveNodeVisible.value && filePath !== '') {
      shortcutActive.value = 'save_file'
      shortcutWatch.value = !shortcutWatch.value
    }
  }, 60000)
})
```

c) 新增 import：`import { takePendingChart } from '../store/chartStore'`。

- [ ] **Step 7: 验证构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 8: 手动验证**

`npm run dev`：
1. 首页打开正常 .xk 文件：进入图表页、窗口变为可缩放/最大化；
2. 首页打开损坏文件：应用内红色提示后窗口关闭（对照旧行为：系统对话框后关窗——已批准的差异）；
3. 首页打开时取消对话框：**停留在首页**（旧行为是关窗——已批准的差异）；
4. 首页双击模板、图表页新建/打开其他文件：legacy 流程仍正常（仍走 act/data）；
5. 图表页关闭：未保存确认流程仍工作（走 legacy quit）；
6. 首页直接点窗口关闭：直接关闭，无确认弹窗。

- [ ] **Step 9: 提交**

```bash
git add src/shared/ src/main/ src/preload/index.js src/renderer/src/
git commit -m "refactor：首页打开文件迁移到 file:open 通道并本地跳转，新增 enter-chart-mode"
```

---

### Task 5: 模板双击本地化（'chart' act 与 openChartWindow 退役）

**Files:**
- Modify: `src/renderer/src/components/XkCardList.vue`（双击改本地跳转）
- Modify: `src/renderer/src/layouts/BasicLayout.vue`（删 `receiveAct`）
- Modify: `src/renderer/src/page/ChartView.vue`（删 `receiveData` 监听）
- Modify: `src/main/windowManager.js`（删 `openChartWindow`）
- Modify: `src/main/ipc.js`（删 legacy `open_template` 分支）

**Interfaces:**
- Consumes: Task 4 `chartStore.setPendingChart`。
- Produces: 无新接口；`'chart'` act 与 `'data'` 的 open_template 用法消失（`'data'` 通道仍被 create_new_file 用，Task 6 删）。

- [ ] **Step 1: XkCardList 双击改造**

`src/renderer/src/components/XkCardList.vue`：`handleDoubleClick`（35-40 行）替换，并新增 import：

```js
import { useRouter } from 'vue-router'
import { setPendingChart } from '../store/chartStore'

const router = useRouter()
```

```js
/**
 * 双击事件打开这个 文件 or 模板
 */
const handleDoubleClick = async (id, fileName) => {
  if (id === 'template1') {
    setPendingChart({ value: JSON.stringify(createTemplate1()), path: '' })
    router.push('chart')
  }
}
```

- [ ] **Step 2: BasicLayout 删除 receiveAct**

删除 `BasicLayout.vue` 95-99 行的 `window.electronAPI.receiveAct(...)` 整段（`'chart'` act 的唯一消费者）。

- [ ] **Step 3: ChartView 删除 receiveData 监听**

删除 `ChartView.vue` 中的 `window.electronAPI.receiveData(loadChartData)` 行（装载唯一入口变为 onMounted 的 chartStore）。

- [ ] **Step 4: 主进程删除 openChartWindow 与 open_template 分支**

- `windowManager.js`：删除 `openChartWindow` 导出；
- `ipc.js`：删除 `data` 处理器中 `open_template` 分支；import 相应收敛。

- [ ] **Step 5: 验证构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 6: 手动验证**

`npm run dev`：
1. 首页双击模板：进入图表页、图表正常渲染、窗口解锁；
2. 双击进入的模板直接保存：弹另存对话框、保存成功；
3. 图表页"新建文件"（legacy create_new_file）：新窗口流程仍正常（此时仍靠主进程发 data？——**否**：Step 4 已删 openChartWindow，而 create_new_file 依赖它。**因此本任务保留 create_new_file 分支但将其改为**：新窗口创建后由 Task 6 的机制装载。为避免破坏，本任务将 `create_new_file` 分支暂时改为"只创建空窗口"：

```js
      create_new_file: () => {
        console.log('create new file')
        openNewWindow() // 【legacy】Task 6 由 new-chart-window 通道取代
      }
```

（即新建的窗口先停在首页，模板数据下个任务接上——本任务的手动验证中"新建文件"预期为：打开一个停在首页的新窗口，此为已知中间态。）

- [ ] **Step 7: 提交**

```bash
git add src/renderer/src/ src/main/
git commit -m "refactor：首页模板装载本地化，移除 chart act 与 openChartWindow"
```

---

### Task 6: 新窗口通道（new-chart-window + take-pending-chart）

**Files:**
- Modify: `src/main/windowManager.js`（`createWindow` 支持 hash 路由；新增 `pendingCharts`/`createChartWindow`/`takePendingChart`）
- Modify: `src/main/ipc.js`（注册两个 handle；删 legacy `create_new_file`/`open_other_file` 分支及 `'data'` 处理器）
- Modify: `src/preload/index.js`（追加 `newChartWindow`/`takePendingChart`）
- Modify: `src/renderer/src/page/ChartView.vue`（挂载时取 pending；`createNewFile`/`openFile` 改造）

**Interfaces:**
- Consumes: Task 4 `enterChartMode`。
- Produces:
  - windowManager: `createChartWindow(content)`（创建并返回新窗口，新窗口直接加载 `#/chart`）；`takePendingChart(webContentsId)` → `string | null`。
  - 主进程 handle：`APP_NEW_CHART_WINDOW` 收 `{ content }` 返回 `{ ok: true }`；`APP_TAKE_PENDING_CHART` 返回 `{ content }`（可能为 `null`）。
  - preload: `newChartWindow(payload)` / `takePendingChart()`。

- [ ] **Step 1: windowManager 支持路由与 pending 数据**

`createWindow` 签名与加载逻辑改为（其余不变）：

```js
export const createWindow = (onWindowClosed, route = '') => {
  // ... 窗口创建部分不变 ...

  const loadOptions = route ? { hash: route } : undefined
  if (process.env['ELECTRON_RENDERER_URL']) {
    current_window.loadURL(process.env['ELECTRON_RENDERER_URL'], loadOptions)
  } else {
    current_window.loadFile(join(__dirname, '../renderer/index.html'), loadOptions)
  }

  return current_window
}
```

新增（文件级）：

```js
// 新窗口待装载的图表数据：webContents.id -> content（窗口closed时清理）
const pendingCharts = new Map()

/**
 * 为新窗口暂存图表数据，渲染端通过 take-pending-chart 通道取走（取后即清）。
 */
export const stashPendingChart = (webContentsId, content) => {
  pendingCharts.set(webContentsId, content)
}

export const takePendingChart = (webContentsId) => {
  const content = pendingCharts.get(webContentsId) ?? null
  pendingCharts.delete(webContentsId)
  return content
}

/**
 * 创建图表窗口：直接加载 #/chart 路由并暂存待装载数据。
 * chartModeWindows 的清理由 enterChartMode 自行注册的 closed 钩子负责，
 * 这里只清 pendingCharts。
 */
export const createChartWindow = (content) => {
  const new_window = createWindow((webContentsId) => {
    pendingCharts.delete(webContentsId)
  }, 'chart')
  stashPendingChart(new_window.webContents.id, content)
  return new_window
}
```

- [ ] **Step 2: ipc.js 注册 handle 并删除 legacy 新窗口分支**

新增：

```js
  ipcMain.handle(IPC.APP_NEW_CHART_WINDOW, (event, { content }) => {
    createChartWindow(content)
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_TAKE_PENDING_CHART, (event) => {
    return { content: takePendingChart(event.sender.id) }
  })
```

import 更新：`import { createChartWindow, enterChartMode, takePendingChart } from './windowManager'`。

删除：legacy `act` 处理器的 `open_other_file` 分支；legacy `data` 处理器整个（`create_new_file` 是最后一个分支，`ipcMain.on('data', ...)`、`handles`、`console.log(arg)` 一并删除）；`'data'` 通道从此无人监听；`legacyOpenFile` 与 `openNewWindow` 已无使用方，一并删除。

- [ ] **Step 3: preload 追加两个方法**

```js
  newChartWindow: (payload) => ipcRenderer.invoke(IPC.APP_NEW_CHART_WINDOW, payload),
  takePendingChart: () => ipcRenderer.invoke(IPC.APP_TAKE_PENDING_CHART),
```

- [ ] **Step 4: ChartView 挂载装载补全 + 新建/打开改造**

a) `onMounted` 中 chartStore 未命中时走 IPC（替换 Task 4 的版本）：

```js
  // 同窗口跳转（首页打开/模板）：从 chartStore 取数据装载
  const local = takePendingChart()
  if (local) {
    loadChartData(local)
  } else {
    // 新窗口（新建文件/打开其他文件）：取主进程暂存的数据
    const res = await window.electronAPI.takePendingChart()
    if (res?.content) {
      loadChartData({ value: res.content, path: '' })
    }
  }
```

b) `createNewFile` / `openFile`（569-584 行）替换：

```js
const createNewFile = () => {
  /**
   * 实现新建文件：新窗口装载空白模板
   */
  console.log('create new file')
  window.electronAPI.newChartWindow({ content: JSON.stringify(createTemplate1()) })
}

const openFile = async () => {
  /**
   * 实现打开文件：读取成功后在新窗口打开（与旧行为一致）
   */
  console.log('open file')
  try {
    const res = await window.electronAPI.openFile()
    if (res.canceled) return
    window.electronAPI.newChartWindow({ content: res.content })
  } catch (err) {
    console.error('打开失败', err)
    message.error(err.message || '打开失败')
  }
}
```

- [ ] **Step 5: 验证构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 6: 手动验证**

`npm run dev`：
1. 图表页菜单"新建文件"：新窗口打开且**直接进入图表页**、渲染模板、窗口解锁；
2. 图表页菜单"打开文件"：对话框 → 选正常文件 → 新窗口进入图表页并渲染；选损坏文件 → 当前窗口红色提示、不开新窗；取消 → 无变化；
3. 新窗口里再"新建文件"：再开新窗口（递归多窗口）；
4. 多窗口各保存互不干扰；
5. Task 5 遗留的中间态（新建停在首页）已消除。

- [ ] **Step 7: 提交**

```bash
git add src/main/ src/preload/index.js src/renderer/src/page/ChartView.vue
git commit -m "refactor：新建/打开其他文件迁移到 new-chart-window 与 take-pending-chart 通道"
```

---

### Task 7: 退出流程（request-close 线性决策）

**Files:**
- Modify: `src/main/windowManager.js`（close 拦截改发 `IPC.APP_REQUEST_CLOSE`）
- Modify: `src/main/ipc.js`（`APP_CONFIRM_UNSAVED` handle；删 legacy `unsaved`/`saved` 分支与 `'act'` 处理器）
- Modify: `src/preload/index.js`（追加 `onRequestClose`/`confirmUnsaved`）
- Modify: `src/renderer/src/page/ChartView.vue`（`onRequestClose` 决策；删 `receiveAct`）

**Interfaces:**
- Consumes: Task 6 后的主进程结构；Task 3 `saveFile()`（返回 boolean）。
- Produces:
  - 主进程 handle：`APP_CONFIRM_UNSAVED` → `'save' | 'discard' | 'cancel'`。
  - preload: `onRequestClose(callback)`（主进程推送监听）、`confirmUnsaved()`。

- [ ] **Step 1: windowManager 切换推送通道**

`enterChartMode` 中 close 拦截的 legacy 行替换：

```js
  current_window.on('close', e => {
    e.preventDefault() //先阻止一下默认行为，不然直接关了，提示框只会闪一下
    current_window.webContents.send(IPC.APP_REQUEST_CLOSE)
  })
```

- [ ] **Step 2: ipc.js 注册 confirm-unsaved 并删除 legacy act 处理器**

新增：

```js
  ipcMain.handle(IPC.APP_CONFIRM_UNSAVED, async () => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: '确认退出',
      message: '文件未保存，是否退出？',
      buttons: ['保存', '放弃', '取消'],
      cancelId: 2 // 直接关闭提示框视为"取消"
    })
    return ['save', 'discard', 'cancel'][response]
  })
```

删除：`ipcMain.on('act', ...)` 整段（`unsaved`/`saved` 分支随之消失）。此时 `getContext`/`windowContexts`/`cleanupWindowContext` 已无使用方——一并删除，`index.js` 的 `createWindow(cleanupWindowContext)` 调用改为 `createWindow()`（两处）。

- [ ] **Step 3: preload 追加两个方法**

```js
  confirmUnsaved: () => ipcRenderer.invoke(IPC.APP_CONFIRM_UNSAVED),
  onRequestClose: (callback) =>
    ipcRenderer.on(IPC.APP_REQUEST_CLOSE, () => callback()),
```

- [ ] **Step 4: ChartView 退出决策**

原 `window.electronAPI.receiveAct(...)` 整段（Task 3 版本）替换为：

```js
window.electronAPI.onRequestClose(async () => {
  /**
   * 用户点击了窗口关闭按钮：主进程已拦截 close 并推送本事件，
   * 由本页面决定是否可以关闭。
   */
  if (!saveNodeVisible.value) {
    window.electronAPI.closeWindow()
    return
  }

  const choice = await window.electronAPI.confirmUnsaved()
  if (choice === 'cancel') return
  if (choice === 'discard') {
    window.electronAPI.closeWindow()
    return
  }
  // choice === 'save'：保存成功才关闭；失败留在当前页面
  const ok = await saveFile()
  if (ok) window.electronAPI.closeWindow()
})
```

- [ ] **Step 5: 验证构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 6: 手动验证**

`npm run dev`：
1. 无修改时点关闭：窗口直接关；
2. 有修改点关闭 → "保存"（无 filePath）：弹另存框 → 保存 → 窗口关闭；
3. 有修改点关闭 → "保存"：取消另存框 → **窗口留在原页面**、未保存提示仍在；
4. 有修改点关闭 → "放弃"：直接关闭；
5. 有修改点关闭 → "取消"（含直接×掉对话框）：窗口保留；
6. 多窗口：A 未保存 B 已保存，分别关闭各自正确处理；
7. 首页窗口（未进过图表页）点关闭：直接关，无确认。

- [ ] **Step 7: 提交**

```bash
git add src/main/ src/preload/index.js src/renderer/src/page/ChartView.vue
git commit -m "refactor：退出确认改为 request-close 线性流程，删除 act 处理器与 windowContexts"
```

---

### Task 8: 删除 legacy 通道与全量回归

**Files:**
- Modify: `src/preload/index.js`（删四个 legacy 方法）
- Verify: 全部迁移完成，无 `sendAct/receiveAct/sendData/receiveData` 残留

**Interfaces:**
- Consumes: 无
- Produces: 最终 API 面（`openFile/saveFile/saveFileAs/newChartWindow/takePendingChart/enterChartMode/closeWindow/confirmUnsaved/onRequestClose`）。

- [ ] **Step 1: preload 删除 legacy 方法**

`src/preload/index.js` 最终形态：

```js
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

/**
 * 渲染进程可用的 IPC 接口。
 * 请求-响应类操作走 invoke（返回 Promise，主进程失败时 reject）；
 * onRequestClose 是唯一的主进程推送（用户点击窗口关闭按钮）。
 */
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke(IPC.FILE_OPEN),
  saveFile: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE, payload),
  saveFileAs: (payload) => ipcRenderer.invoke(IPC.FILE_SAVE_AS, payload),
  newChartWindow: (payload) => ipcRenderer.invoke(IPC.APP_NEW_CHART_WINDOW, payload),
  takePendingChart: () => ipcRenderer.invoke(IPC.APP_TAKE_PENDING_CHART),
  enterChartMode: () => ipcRenderer.invoke(IPC.APP_ENTER_CHART_MODE),
  closeWindow: () => ipcRenderer.invoke(IPC.APP_CLOSE_WINDOW),
  confirmUnsaved: () => ipcRenderer.invoke(IPC.APP_CONFIRM_UNSAVED),
  onRequestClose: (callback) =>
    ipcRenderer.on(IPC.APP_REQUEST_CLOSE, () => callback())
})
```

- [ ] **Step 2: 全局残留扫描**

Run: `grep -rn "sendAct\|receiveAct\|sendData\|receiveData\|windowContexts\|'act'\|'data'" src/ --include="*.js" --include="*.vue"`
Expected: 仅 `src/main/ipc.js` 的 `ipcMain.handle` 注册与注释中允许出现；不得有任何业务调用残留。若 `ipc.js` 中 legacy 残留（如未删净的 `ipcMain.on`），删除之。

- [ ] **Step 3: 验证构建与 lint**

Run: `npm run build && npx eslint src --ext .js,.vue,.ts`
Expected: 构建成功；eslint 无错误（warning 参照仓库现状酌情处理）。

- [ ] **Step 4: 全量手动回归（spec 验证清单）**

`npm run dev` 逐项验证：
1. 保存：有路径 Ctrl+S / 无路径（弹框）/ 取消另存框；
2. 另存为；
3. 打开：正常文件 / 损坏文件（首页与图表页两个场景）/ 取消对话框（首页停留、图表页无变化）；
4. 首页双击模板进入图表；
5. 新建文件（图表页菜单）新窗口装载模板；
6. 未保存退出三按钮（保存含"取消另存框后留在原页"）；
7. 多窗口并发保存互不干扰；
8. 每项对照 spec 行为对照表（含四处已批准差异）。

- [ ] **Step 5: 提交**

```bash
git add src/preload/index.js src/main/
git commit -m "refactor：删除 legacy act/data 通道，IPC 重构完成"
```

---

## 任务间依赖

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8
```

严格串行：每个任务以前一任务的接口为输入，且每个提交点应用可运行。

## 风险与回退

- 每任务独立提交，出问题 `git revert` 单个提交即可，无需回滚整个重构。
- Task 5 存在已知中间态（"新建文件"暂时只开空白窗口停在首页），Task 6 消除——这两个任务不宜相隔太久提交。
- Windows 平台路径含中文与空格（本项目目录即如此），所有文件操作沿用 Electron/Node API 处理，不手拼 shell 命令。
