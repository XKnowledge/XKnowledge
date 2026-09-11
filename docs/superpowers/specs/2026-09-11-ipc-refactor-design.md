# IPC 通讯重构设计

日期：2026-09-11
状态：已与用户确认设计，待实施

## 背景与动机

当前 IPC 架构只有两个泛化通道 `act`（指令）与 `data`（数据）：

- 渲染端用 `sendAct('save_file')` + `sendData({...})` 两条消息组合表达一次操作；
- 主进程靠 `windowContexts` Map 记住"该窗口最近一次 act"来解释 `data` 的含义；
- 全部为 fire-and-forget 的 `send`，操作结果靠主进程反向发送 `save_success` / `save_failure` 通知；
- 一次保存需要 4 条 IPC 消息（save_file act + data → 存盘 → save_success act + data）；
- 退出流程是三段式状态机（quit → unsaved/saved → 可能再走一遍保存）；
- 通道名与指令名为魔法字符串，散落在 `src/main/index.js`、`src/preload/index.js`、
  `ChartView.vue`、`BasicLayout.vue`、`XkCardList.vue` 五处。

重构动机（用户确认）：

1. 时序配对的隐式状态在多窗口下脆弱，彻底消除隐患；
2. 为后续新增主进程功能（自动保存、导出、最近文件等）铺路；
3. 提高可维护性。

## 目标与非目标

**目标**

- 每个操作一个语义化具名通道，请求-响应操作全部改用 `ipcMain.handle` + `ipcRenderer.invoke`；
- 删除 `windowContexts` 状态机、`save_success/save_failure` 反向通知、保存后重发 `data`、
  `quit/unsaved/saved` 三段式退出流程；
- 通道名集中定义于 `src/shared/ipc-channels.js`，主进程与 preload 引用同一份常量；
- 拆分主进程：`index.js`（装配）、`windowManager.js`（窗口）、`fileService.js`（文件）、
  `ipc.js`（通道注册）。

**非目标**

- 不引入 TypeScript（纯 JS + JSDoc 注释约定消息结构）；
- 不改变用户可见行为（保存/打开/新建/退出流程的外部表现不变）。

## 文件结构

```
src/
├── shared/
│   └── ipc-channels.js        # 新增：通道名常量 + 各通道参数/返回值约定（JSDoc）
├── main/
│   ├── index.js               # 瘦身：app 生命周期 + 装配
│   ├── windowManager.js       # 新增：窗口创建、窗口选项、close 拦截
│   ├── fileService.js         # 新增：对话框 + 文件读写 + JSON 校验（不碰 IPC）
│   └── ipc.js                 # 新增：通道 → 处理器注册
└── preload/
    └── index.js               # 重写：语义化 API，内部走 invoke/send
```

渲染端 `ChartView.vue`、`BasicLayout.vue`、`XkCardList.vue` 的调用点同步替换为新 API。

## 通道契约

所有通道名从 `shared/ipc-channels.js` 导出常量（如 `IPC.FILE_OPEN`）。

| 常量 | 通道名 | 方向 | 参数 | 返回 / 行为 |
|---|---|---|---|---|
| `FILE_OPEN` | `file:open` | invoke | 无 | `{ content, path }`；取消 → `{ canceled: true }`；失败 → reject `{ code, message, path }` |
| `FILE_SAVE` | `file:save` | invoke | `{ path, content }` | path 为空弹另存对话框；成功 → `{ path }`；取消 → `{ canceled: true }`；写失败 → reject |
| `FILE_SAVE_AS` | `file:save-as` | invoke | `{ content }` | 总是弹对话框，其余同 `file:save` |
| `APP_NEW_CHART_WINDOW` | `app:new-chart-window` | invoke | `{ content }` | 新建窗口并装载图表，返回 `{ ok: true }` |
| `APP_TAKE_PENDING_CHART` | `app:take-pending-chart` | invoke | 无 | 新窗口图表页挂载时取走暂存数据，返回 `{ content }`（无数据时 `content` 为 `null`） |
| `APP_ENTER_CHART_MODE` | `app:enter-chart-mode` | invoke | 无 | 图表页挂载时调用：解锁窗口尺寸限制 + 注册 close 拦截（幂等） |
| `APP_CLOSE_WINDOW` | `app:close-window` | invoke | 无 | 销毁发起 invoke 的窗口 |
| `APP_CONFIRM_UNSAVED` | `app:confirm-unsaved` | invoke | 无 | 主进程弹三按钮框（保存/放弃/取消），返回 `'save' \| 'discard' \| 'cancel'` |
| `APP_REQUEST_CLOSE` | `app:request-close` | 主进程 → 渲染端推送 | 无 | 用户点了窗口关闭按钮，请渲染端决策 |

要点：

- 唯一保留的反向推送是 `app:request-close`（关闭按钮事件只能从主进程发起）；
- `file:open` 的对话框校验逻辑保留：损坏/非法 JSON 文件在主进程即被拒绝，
  不发往渲染进程。

## preload API

```js
contextBridge.exposeInMainWorld('electronAPI', {
  openFile:       () => ipcRenderer.invoke(IPC.FILE_OPEN),
  saveFile:      (payload) => ipcRenderer.invoke(IPC.FILE_SAVE, payload),
  saveFileAs:    (payload) => ipcRenderer.invoke(IPC.FILE_SAVE_AS, payload),
  newChartWindow: (payload) => ipcRenderer.invoke(IPC.APP_NEW_CHART_WINDOW, payload),
  takePendingChart: () => ipcRenderer.invoke(IPC.APP_TAKE_PENDING_CHART),
  enterChartMode: () => ipcRenderer.invoke(IPC.APP_ENTER_CHART_MODE),
  closeWindow:   () => ipcRenderer.invoke(IPC.APP_CLOSE_WINDOW),
  confirmUnsaved: () => ipcRenderer.invoke(IPC.APP_CONFIRM_UNSAVED),
  onRequestClose: (callback) => ipcRenderer.on(IPC.APP_REQUEST_CLOSE, (_e) => callback())
})
```

## 关键流程

### 保存（4 条消息 → 1 次往返）

```
渲染端: const res = await electronAPI.saveFile({ path: filePath, content })
         ├─ res.canceled → 用户取消了另存对话框，什么都不做
         ├─ res.path     → 更新本地 filePath、清除未保存标记
         └─ reject        → message.error(...)，保留未保存标记
```

主进程不再反向推送任何消息，不再重发 `data`（消除图表重绘与 click 监听叠加隐患）。

### 打开文件（`file:open` 的结果由调用方按场景组合）

```
渲染端: const res = await electronAPI.openFile()
         ├─ res.canceled → 静默
         ├─ 成功          → 按调用场景组合后续动作（见下）
         └─ reject        → message.error；首页场景（窗口内无内容）再调 closeWindow()，
                            图表页继续使用原文件
```

两个调用场景：

- **首页（BasicLayout）**：成功后本地 `router.push('chart')` 并把 `res.content / res.path`
  交给图表页装载（原 `receiveData` 回调体改为本地函数调用）；
- **图表页"打开其他文件"（ChartView）**：成功后调 `electronAPI.newChartWindow({ content })`，
  在**新窗口**打开（与现状 `open_other_file: () => openFile(createWindow())` 一致）。

与现状的行为差异：原来打开失败由主进程直接 `destroy()` 窗口；重构后失败信息返回
渲染端，由渲染端按场景决策。

### 首页进入图表页（路由跳转回归渲染端）

现状：首页打开文件或双击模板后，靠主进程回发 `'chart'` act 触发
`BasicLayout` 的 `router.push('chart')`（`BasicLayout.vue:95-99`）——页面跳转借道了
主进程 IPC。

重构后：

- 新增渲染端共享状态 `src/renderer/src/store/chartStore.js`（模块级变量，
  `setPendingChart({ content, path })` / `takePendingChart()`，取后即清），
  承接同窗口内首页 → 图表页的数据传递；
- 首页打开文件成功 → `setPendingChart` + 渲染端本地 `router.push('chart')`；
- 双击模板（`XkCardList` 的 `open_template`）→ **完全不再走 IPC**：本地构造模板
  内容、`setPendingChart`、本地跳转；
- `'chart'` act 通道删除。

### 进入图表模式（窗口解锁与关闭确认注册）

现状：主进程 `openChartWindow` 在装载图表的同时解锁窗口
（`setMaximizable/setMinimizable/setResizable/setMinimumSize`）并注册 close 拦截。
重构后同窗口跳转不经过主进程，改由图表页挂载时 invoke `app:enter-chart-mode`，
主进程 `windowManager` 幂等地完成解锁 + close 拦截注册（`chartModeWindows` 集合
防重复）。首页窗口不调用即不拦截，直接关闭——与现状一致。

### 新窗口的数据传递

`app:new-chart-window` 处理器：创建窗口时直接加载 `#/chart` 路由
（`loadURL(url, { hash: 'chart' })` / `loadFile(file, { hash: 'chart' })`），
并按 `webContents.id` 把 `content` 暂存于 `pendingCharts` Map（窗口 closed 时
清理）。新窗口的 `ChartView` 挂载时：先查本地 `chartStore`（同窗口跳转场景），
为空则 invoke `app:take-pending-chart`（新窗口场景）取走数据。数据在窗口创建
时已放入 Map，渲染端任意时刻 invoke 均可取到，无竞态。

### 退出（三段式状态机 → 一次线性决策）

```
用户点窗口关闭钮 → windowManager 拦截 close → 推送 app:request-close →
渲染端: 无未保存 → electronAPI.closeWindow()
        有未保存 → const choice = await electronAPI.confirmUnsaved()
                   ├─ 'save'    → await saveFile(...) 成功后 closeWindow()；失败留在原页
                   ├─ 'discard' → closeWindow()
                   └─ 'cancel'  → 什么都不做
```

`app:close-window` 内部用 `window.destroy()`，不触发 close 拦截，因此无需 closing 标志，
`windowContexts` 整体删除。

## 行为对照（重构前 → 重构后）

| 场景 | 重构前 | 重构后 |
|---|---|---|
| 保存成功 | 主进程重发 data，图表整体重载 | 不重发，仅更新 filePath 与未保存标记 |
| 保存失败/取消 | `save_failure` act 通知 | invoke reject / `{ canceled }` 返回值 |
| 打开失败 | 主进程 `destroy()` 窗口 | 渲染端按场景提示；首页场景才关窗；首页场景的 message.error 提示会随窗口关闭即时消失（不阻塞） |
| 未保存退出 | quit → unsaved → 主进程弹框 → 可能再触发保存 | request-close 推送 → 渲染端 invoke confirm-unsaved → 自行决策 |
| 首页打开/双击模板进入图表页 | 主进程回发 `'chart'` act 触发 `router.push` | 渲染端本地 `router.push`，双击模板不再走 IPC |
| 多窗口 | `windowContexts` 按窗口记忆 act | 通道自带语义，无共享状态 |

## 错误处理约定

- 主进程处理器内 `try/catch`，失败时 `throw { code, message, path? }`，
  `invoke` 的 Promise 在渲染端自动 reject；
- 文件损坏校验（`JSON.parse`）保留在主进程；
- 渲染端所有 `await` 均带 `try/catch`，IPC 失败不导致白屏。

## 验证策略

项目无测试框架，采用手动走查（`npm run dev`）：

1. 保存（有路径 / 无路径弹框 / 取消另存框）；
2. 另存为；
3. 打开（正常文件 / 损坏文件 / 取消对话框）；
4. 首页打开、图表页打开其他文件；
5. 新建文件（首页模板、图表页新建）；
6. 未保存退出的三个按钮各一次；
7. 多窗口并发保存互不干扰；
8. 每项对照重构前行为。
