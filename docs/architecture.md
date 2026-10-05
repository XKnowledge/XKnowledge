# XKnowledge 软件结构文档

本文面向开发者，描述 XKnowledge 的总体架构、模块职责、进程间通信与核心数据流。面向最终用户的功能说明见 [用户手册](./user-guide.md)，参与开发见 [开发指南](./development.md)。

## 1. 项目概览

XKnowledge 是一款基于 Electron 的桌面知识图谱软件：以 3D 力导向图展示和编辑知识图谱，支持节点/连接的增删改、类目管理、撤销重做、自动保存与 PNG 导出，图谱以自有的 `.xk` 格式（JSON）落盘。

### 技术栈

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 应用框架 | Electron 44 | 主进程 + 预加载 + 渲染进程 |
| 构建链 | electron-vite 5 / Vite 7 | 三段式构建（main / preload / renderer） |
| 前端框架 | Vue 3.5（`<script setup>`） | 渲染层 UI |
| 路由 | vue-router 5（hash 模式） | `loadFile` 场景下无需服务端路由 |
| UI 组件库 | Ant Design Vue 4 | 布局、表单、菜单、提示 |
| 国际化 | vue-i18n 11（渲染层）+ 主进程查表 `t()` | 双端共用一份字典（`src/shared/locales/`） |
| 图可视化 | 3d-force-graph（Three.js）+ three-spritetext | 3D 力导向图与节点文字标签 |
| 测试 | Vitest 5 | 513 个单元测试（`yarn test`） |
| 质量 | ESLint 10（flat config）、Prettier 3、TypeScript 5.9 + vue-tsc | `yarn typecheck` |

代码语言为 JS 为主、TS 为辅：主进程与 preload 全部为 JS，渲染层入口与工具函数为 TS。

## 2. 总体架构

```
┌─────────────────────────────── Electron 主进程 (src/main) ───────────────────────────────┐
│  index.js          应用入口：单实例锁、创建窗口、注册 IPC                                  │
│  windowManager.js  窗口工厂、图表模式（解锁尺寸 + 关闭确认）、pendingCharts 暂存             │
│  ipc.js            IPC 注册中心、openedFiles（文件-窗口登记簿，同文件去重聚焦）              │
│  titleService.js   窗口标题计算（basename 分组 + 同名最短可区分目录链，纯函数）             │
│  fileService.js    .xk 读写、结构校验、对话框、原子写入                                     │
│  fileGuard.js      路径授权 + mtime 冲突检测（防任意路径写盘 / 丢失更新）                    │
└──────────────┬───────────────────────────────────────────────────┬───────────────────────┘
               │ ipcMain.handle / webContents.send                │
┌──────────────▼───────────── src/preload (contextBridge) ────────▼───────────────────────┐
│  window.electronAPI：openFile / saveFile / saveFileAs / newChartWindow / ... 共 15 个方法 │
└──────────────┬───────────────────────────────────────────────────┬───────────────────────┘
               │ invoke（请求-响应） / onRequestClose、onTitleChanged（推送）│
┌──────────────▼──────────────── 渲染进程 (src/renderer) ──────────▼───────────────────────┐
│  vue-router:  / → AddView（首页示例图库）           /chart → ChartView（图表编辑页）        │
│  ChartView ── XkMenu（下拉菜单）/ 工具栏按钮 / 全局快捷键                                   │
│      ├── XkGraph3D        3D 力导向图（渲染、图例、高亮、导出、双击建点/拖拽连边/框选批量删） │
│      └── 侧边栏表单        XkCurrentNode / XkCurrentEdge                                    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
        src/shared/ipc-channels.js：IPC 通道名单，主进程与 preload 共同引用
```

三条设计主线贯穿全码：

1. **主进程是唯一的文件系统入口**——渲染进程永远拿不到 Node API，读写、对话框、校验全部在主进程完成，preload 只暴露白名单方法（`sandbox: true`）。
2. **图表页即窗口**——每个图谱独占一个窗口（新建/在图表页打开文件都开新窗口），窗口生命周期与文件的未保存状态强绑定（关闭前确认）。
3. **纯数据格式**——`.xk` v2 只存图数据（nodes/links），不存渲染配置；类目颜色由稳定哈希派生，视图设置（排斥力、标签开关等）为会话级，重开即恢复默认。

## 3. 目录结构

```
XKnowledge/
├─ src/
│  ├─ main/                     # Electron 主进程（JS）
│  │  ├─ index.js               # 入口：单实例锁、whenReady 建窗、注册 IPC
│  │  ├─ windowManager.js       # createWindow / createChartWindow / enter|exitChartMode
│  │  ├─ ipc.js                 # registerIpc：全部 ipcMain.handle 与 openedFiles 登记
│  │  ├─ fileService.js         # .xk 读 / 写 / 校验 / 对话框 / 原子写入
│  │  ├─ exampleService.js      # 示例图库对外门面：定位 examples/ 目录并转发
│  │  ├─ exampleManifest.mjs    # 示例元数据清单：快慢两层（§5.6），零 electron 依赖
│  │  ├─ exportHtml.js          # 交互式 HTML 导出：读 viewer 模板拼装 + 保存框落盘（§6.10）
│  │  └─ fileGuard.js           # createPathGuard：路径授权与 mtime 冲突检测
│  ├─ preload/
│  │  └─ index.js               # contextBridge 暴露 window.electronAPI
│  ├─ shared/
│  │  ├─ ipc-channels.js        # IPC 通道名单（唯一出处，禁止裸字符串）
│  │  ├─ chartValidation.mjs    # validateChartStructure：.xk 结构校验唯一出处（主进程读盘/渲染端装载/示例清单三方共用）
│  │  └─ graphViewerData.js     # 导出 HTML 的数据白名单序列化（纯函数，§6.10）
│  ├─ viewer/                   # 交互式 HTML 导出的查看器源码（§6.10，纯 JS 无框架，
│  │                            #   构建为单 IIFE 内嵌进 resources/viewer/index.html）
│  └─ renderer/
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.ts             # Vue 应用入口（注册 Antd、router）
│        ├─ App.vue             # chart 路由独立渲染，其余套 BasicLayout
│        ├─ router.ts           # 2 条路由（hash 模式）
│        ├─ layouts/BasicLayout.vue   # 首页框架：侧边栏 +「打开本地文件」
│        ├─ page/
│        │  ├─ AddView.vue      # 首页：示例图库 + 新建空白文件
│        │  └─ ChartView.vue    # 图表编辑页（核心编排层；文档域/选中/聚焦/文件生命周期等状态机在 composables/）
│        ├─ components/
│        │  ├─ XkGraph3D.vue        # 3D 力导向图封装（详见 §8）
│        │  ├─ XkMenu.vue           # 图表页左上角下拉菜单
│        │  ├─ XkCurrentNode.vue    # 侧边栏：修改节点表单
│        │  └─ XkCurrentEdge.vue    # 侧边栏：修改连接表单
│        ├─ store/chartStore.js     # 同窗口「首页 → 图表页」的一次性数据传递
│        ├─ composables/            # ChartView 各角色状态机（useDocument 为文档域唯一持有者）
│        ├─ utils/
│        │  ├─ historyOps.ts        # 历史操作对象工厂（undo/redo 正反变换同厂成对）
│        │  └─ categoryColor.js     # 类目彩虹 20 色调色板，集合顺延分配
├─ tests/
│  ├─ main/                     # fileGuard / fileService / ipc 单元测试
│  └─ renderer/categoryColor.test.js
├─ examples/金融.xk              # 金融学习示例图谱
├─ data/                        # 早期 v1 格式测试数据（应用不使用）
├─ resources/                   # 应用图标；viewer/ 为导出 HTML 的单文件模板（构建产物入库，§6.10）
├─ release/                     # electron-builder 打包输出
├─ out/                         # electron-vite 构建产物
├─ plan.txt                     # 2026-09 依赖升级评估报告（历史文档）
├─ electron.vite.config.mjs     # 三段式构建配置
└─ package.json                 # 脚本与依赖；build 段为 electron-builder 配置
```

## 4. 进程模型与 IPC

### 4.1 窗口模型

- 主窗口 `900×670`，默认**锁定尺寸**（不可缩放/最大化/最小化），隐藏标题栏 +`titleBarOverlay`，`autoHideMenuBar` 且应用菜单置空。
- 窗口进入图表页时调用 `app:enter-chart-mode`：解锁尺寸限制（最小 900×670）并注册「关闭前确认」拦截；离开图表页对称调用 `app:exit-chart-mode` 恢复锁定。
- 窗口标题由主进程统一管理：默认「XKnowledge」；进图表页设「未命名 — XKnowledge」；装载/保存上报路径后按 `titleService` 计算「文件名[ — 目录链] — XKnowledge」（同名自动补目录消歧）；图表页卸载恢复默认。`titleBarOverlay` 只画控制按钮不画标题文字，故标题经 `setWindowTitle` 同时 `setTitle`（任务栏/Alt-Tab）并推送 `app:title-changed`，由 BasicLayout 的 30px 自绘标题条纯展示（渲染端不自算）。未保存修改时标题带圆点且两处位置不同：标题条在文件名后（`金融 • — XKnowledge`）、任务栏在标题前（`• 金融 — XKnowledge`），由渲染端 `file:dirty` 上报驱动。
- **单实例锁**：`requestSingleInstanceLock` 失败即退出。
- **禁止刷新**（F5 / Ctrl+R / Ctrl+F5 / ⌘+R）：pending 图表数据取后即清，刷新会直接丢失图表内容，因此经 `before-input-event` 统一拦截。
- DevTools 仅开发模式自动打开；生产环境不暴露。
- `setWindowOpenHandler`：拒绝所有新窗口请求，http/https 链接转交系统默认浏览器，其余协议（file: 等）一律不放行。

### 4.2 IPC 通道契约

通道名单集中在 `src/shared/ipc-channels.js`，命名约定 `<域>:<动作>`。preload 将其包装为 `window.electronAPI` 上的方法；除 `onRequestClose`（主进程推送，返回解绑函数）外均为 `invoke` 请求-响应，主进程 throw 时渲染端收到 reject。

| 通道 | 方向 | 参数 | 返回 / 失败 |
| --- | --- | --- | --- |
| `file:open` | 渲染 → 主 | — | `{ canceled }` \| `{ alreadyOpen }` \| `{ content, path }`；读取/校验失败 reject（中文 message） |
| `file:opened` | 渲染 → 主 | `{ path }` | `{ ok }`；登记「本窗口正在编辑该文件」 |
| `file:save` | 渲染 → 主 | `{ path, content }` | path 为空时弹另存为；成功 `{ path }`，失败 reject（`WRITE_FAILED` / `PATH_NOT_AUTHORIZED` / `FILE_CONFLICT`） |
| `file:save-as` | 渲染 → 主 | `{ content }` | `{ canceled }` \| `{ path }` |
| `file:dirty` | 渲染 → 主 | `{ dirty: boolean }` | `{ ok }`；登记/清除窗口未保存态并重算标题（未命名窗口直接设未命名标题） |
| `app:new-chart-window` | 渲染 → 主 | `{ content, path }` | `{ ok }`；新窗口加载 `#/chart` 并暂存数据 |
| `app:take-pending-chart` | 渲染 → 主 | — | `{ content, path }` \| `null`；**取后即清** |
| `app:enter-chart-mode` | 渲染 → 主 | — | `{ ok }`；幂等 |
| `app:exit-chart-mode` | 渲染 → 主 | — | `{ ok }`；未在图表模式时为空操作 |
| `app:close-window` | 渲染 → 主 | — | `{ ok }`；`destroy()` 直接关窗（绕过 close 拦截） |
| `app:confirm-unsaved` | 渲染 → 主 | — | `'save'` \| `'discard'` \| `'cancel'`（模态于触发窗口） |
| `app:request-close` | 主 → 渲染 | — | 用户点击窗口关闭按钮时推送，由图表页决定后续 |
| `app:title-changed` | 主 → 渲染 | `title: string`（display 变体） | 窗口标题变化时推送（未命名/文件名/默认），BasicLayout 标题条纯展示；任务栏 `setTitle` 用 taskbar 变体（未保存圆点两处位置不同） |
| `app:theme-applied` | 渲染 → 主 | `{ mode, effective }` | `{ ok }`；渲染层主题变化时上报，主进程统一联动（见 §5.2 `applyTheme`） |

### 4.3 错误跨 IPC 的约定

`invoke` 的错误边界只保留 `Error.message`（自定义属性会丢失），因此：

- 主进程所有失败都 throw **Error 实例**（不是普通对象），message 为可直接示人的中文文案；
- 需要渲染端分支处理的场景，在 message 里放**稳定 token**：文件冲突为 `[FILE_CONFLICT]`，渲染端按 `String(err.message).includes('[FILE_CONFLICT]')` 分支；
- 渲染端多数 catch 不解析 message，直接用固定中文提示，避免边界文案不可靠。

## 5. 主进程模块

### 5.1 index.js

应用入口：`whenReady` 后抢单实例锁 → `createWindow()` + `registerIpc()`；失败即退出。`window-all-closed` 非 macOS 直接 `app.exit()`。

### 5.2 windowManager.js

| 导出 | 职责 |
| --- | --- |
| `createWindow(onWindowClosed, route)` | 窗口工厂。route 支持直达路由（dev 模式手动拼 hash）；安全配置（sandbox、webviewTag: false、打开行为、刷新拦截、DevTools 策略）都集中在这里 |
| `createChartWindow({ content, path })` | 创建 `#/chart` 窗口并 `stashPendingChart`；path 使新窗口保存直接写回原文件 |
| `takePendingChart(webContentsId)` | 渲染端取走暂存数据（取后即清） |
| `setWindowTitle(win, display, taskbar = display)` | `setTitle(taskbar)`（任务栏/Alt-Tab）+ 推送 `app:title-changed(display)`（自绘标题栏），判销毁；enter/exit 图表模式与登记簿重算统一走它。双参拆分仅服务未保存圆点的两处位置差异，单参调用两值一致 |
| `applyTheme({ mode, effective })` | 渲染层经 `app:theme-applied` 上报后的统一联动：设 `nativeTheme.themeSource`（auto→system、强制模式直译，使渲染层 `prefers-color-scheme` 与原生部件一致）、遍历全部窗口 `setTitleBarOverlay` 换原生标题栏配色（Linux 无此 API 静默跳过）、缓存生效主题供新窗口 `backgroundColor` 预铺深底防闪白（重启后主进程未知偏好，首窗口白底一帧为已接受取舍） |
| `enterChartMode(window)` / `exitChartMode(window)` | 图表模式的进入/退出，见 §4.1 与 §7.4 |

模块内两个按 `webContents.id` 键控的 Map：`pendingCharts`（待装载图表，取后即清）与 `chartModeWindows`（图表模式事件处理器引用，保证解绑幂等）。

`exitChartMode` 含窗口对称恢复：取消最大化、回退图表页设置的最小尺寸并恢复 900×670 默认尺寸——图表页卸载不再等同于关窗（「关闭文件」会经路由同窗口跳回首页）。`enterChartMode`/`exitChartMode` 同时设置/恢复窗口标题（未命名/默认），与尺寸恢复同属对称状态管理。

关闭确认的健壮性设计：拦截 `close` 后若渲染进程崩溃（`render-process-gone`）或假死（`unresponsive`），自动解除拦截，保证用户点 X 永远能关掉窗口；恢复响应（`responsive`）后重新启用确认。

### 5.3 ipc.js

`registerIpc()` 注册 §4.2 的全部 handle。额外维护 `openedFiles`（文件路径 → 窗口 webContents.id 登记簿）：

- `file:open` 时若目标文件已被某窗口装载：还原（如最小化）+ 置前 + 聚焦该窗口，返回 `{ alreadyOpen }`，不重复开窗；登记指向已销毁窗口时清掉陈旧记录。
- `file:opened` 上报时，同一窗口只保留最新一条记录（另存为换路径后，旧文件不再聚焦到本窗口）；窗口 `closed` 时自动清理。
- `file:opened` 上报**空路径**时只清除该窗口的记录、不登记新文件（「关闭文件」返回首页时用它清登记，避免该文件继续被聚焦到已回首页的窗口）。
- 登记变化（`file:opened` 上报、空路径清除、窗口 `closed` 清理）后调用 `refreshTitles()`：按 `titleService.computeTitles` 重算并经 `setWindowTitle` 应用（任务栏 + 自绘标题栏），同名窗口的开/关/换名联动（重名解除即恢复短标题）；窗口为空或已销毁时 setWindowTitle 自行跳过。
- `dirtyWindows`（有未保存修改的窗口集合）：`file:dirty` 上报维护并重算标题——有登记的窗口走 `refreshTitles()`，未命名窗口直接设「未命名[ •] — XKnowledge」双标题；`file:opened` 上报（含空路径）重置（装载即干净）；窗口 `closed` 清理时一并删除。

### 5.4 fileService.js

`.xk` 文件的全部 I/O：

- `showOpenDialog(window)`：文件选择框，过滤器只认 `.xk`。
- `readChartFile(path)`：读取 → `JSON.parse` → `validateChartStructure`（version===2、nodes/links 为数组、节点项为对象、无悬空边），失败分别 throw `READ_FAILED` /`INVALID_JSON` / `INVALID_STRUCTURE`（损坏文件不发渲染进程）；成功授权路径并返回 `{ content, path }`（content 为原始文本）。
- `saveChartFileAs(window, content, title)`：另存对话框 + 原子写入；对话框选中视为用户显式授权。
- `writeChartFile(path, content)`：保存/自动保存路径。写前经 guard 校验（§5.5）。
- `writeFileAtomic`：先写 `${path}.tmp-${pid}-${Date.now()}` 再 `rename` 覆盖，崩溃/断电/盘满时目标文件要么旧要么新、不会截断；Windows 上 rename 遇 `EPERM/EBUSY/EACCES`（同步盘/杀软占用）回退 `copyFile` 覆盖写。写入成功后回写 guard 的 mtime 记录。

### 5.5 fileGuard.js

`createPathGuard()` 返回 `{ authorize, assertWritable }`，单实例覆盖全部窗口：

- **路径授权**：只允许写「本会话经 readChartFile 或另存对话框授权过的路径」，`PATH_NOT_AUTHORIZED` 防止被攻破的渲染进程伪造任意路径写盘。
- **冲突检测**：授权时记录磁盘 mtime，写入前 stat 对比；不一致（其他窗口/外部程序改过）throw `FILE_CONFLICT`（message 含 `[FILE_CONFLICT]` token），不做静默覆盖，由上层提示用户改用另存为。

### 5.6 exampleService.js + exampleManifest.mjs（示例图库清单）

首页卡片所需元数据（fileName/title/description/nodeCount/linkCount/categories）预收集进 `examples/examples.manifest.json`（随仓库提交、随打包进 asar），`listExamples` 快慢两层：

- **快路径**：目录 `.xk` 文件名集合与清单一致 → 直接信任清单（~1ms），不再逐文件读取（207 个串行约 85ms——首页「新建空白卡先出、停顿、卡片齐现」两段式的根源，实测停顿 103ms → 21ms）。「图库看得见的打得开」在清单**生成时**成立；此后文件被换坏的极端情形由 `openExample` 复用的 `readChartFile` 损坏拦截兜底（点击时提示打开失败而非白屏）。
- **慢路径**：清单缺失/损坏/不一致（开发态增删示例）→ 退回逐文件读取并重写清单，下次回到快路径；打包态 asar 只读、重写静默失败（包内清单构建时已保证一致，快路径恒命中）。

配套机制：`scripts/generate-example-manifest.mjs`（`yarn generate:examples`，prebuild 自动跑，内容相同不重写）；同步守护测试对清单与目录现扫结果逐字节对比，改示例忘重新生成时测试红。清单按 fileName 码点序存储（与 readdir 序无关，跨平台字节稳定）；categories 的 `undefined` 归一为空串保证序列化往返等值（渲染端 filterExamples /catColor 均已 `?? ''` 防御，展示零影响）。

清单消除了数据等待（~85ms → ~15ms），剩余可感停顿来自渲染侧：207 张卡片一次性挂载的 paint 是 200~350ms 的主线程长帧（掉帧、页面无响应，dev 模式更甚）。渲染端两层配合消除：AddView 分帧挂载（数据到手首批 40 张与虚线框同帧可见——40 覆盖任意首屏视口，剩余 requestAnimationFrame 每帧 +40 铺完；搜索结果即时全量、不受分帧延迟）；卡片固定 200×150，配 `content-visibility: auto` + `contain-intrinsic-size` 让浏览器跳过视口外整卡渲染。冒烟 `scripts/smoke-gallery-frame.mjs` 守护三项：首批可见 ≤150ms、装载期无 >120ms 长帧、搜索即时全量（注意：content-visibility 下测试读卡片文本须用 textContent——视口外卡片的 innerText 为空串）。

两个 `.mjs` 模块（`shared/chartValidation` / `exampleManifest`）保持零 electron 依赖，主进程、vitest、生成脚本三方直接 import 同一份逻辑（chartValidation 另有渲染端装载兜底这第四方，见 §7.1）；`exampleService.js` 只负责经 `examplesDir()` 定位目录并转发（文件名防穿越校验仍在 `openExample`）。

## 6. 渲染层

### 6.1 路由与布局

`App.vue` 按路由二分：`#/chart` 独占整窗（无侧边布局），其余路由套 `BasicLayout`（左侧「打开本地文件」按钮 + 顶部拖拽区）。

| 路由 | 页面 | 状态 |
| --- | --- | --- |
| `/` | AddView：示例图库 + 新建空白文件卡片 | 可用 |
| `/chart` | ChartView：图表编辑页 | 可用（核心） |

### 6.2 ChartView 状态模型

图谱文档（`chartData` + 历史栈）由 `composables/useDocument` **唯一持有**：所有结构变更经意图方法进入（`createNode` / `changeNode` / `deleteNodeAt` / `deleteSelection` / `paste` / `importOutline` / `undo` / `redo`……），校验、数据变换、历史记录与变更通知在同一处完成。意图返回统一的 `{ ok, error }`，错误呈现由编排层按来源分流——侧栏表单走红条（`errorMessage` ref）、画布直操走全局 toast。

结构性变更的唯一出口是 `onChange({ dirty })` 回调（编辑 `dirty: true`；装载换图 `dirty: false`），ChartView 在此收口三个派生副作用：类目列表重算、未保存标记置位、节点高亮校准。`XkGraph3D` 的增量刷新不依赖该通知——它对 `props.nodes/links` 自带 deep watch。

侧边栏以 `xxxVisible` 布尔族互斥切换显示：属性面板 / 修改节点 / 修改连接三选一；图表点击节点/边时自动切换到对应表单（点击边同时记录高亮索引）。创建节点不进侧栏：就地编辑器（`XkCanvasEditor`）是唯一建点机制——画布双击与工具栏「创建节点」按钮（expose 的 `openNodeEditorAtCenter`，视图中心落点）两扇门走同一条 `canvas-create-node` 管道；空图时画布中央显示建图引导（`data-empty-hint`，编辑器开着让位、建成首节点即退场）。

### 6.3 操作触发的统一分发

工具栏按钮、`XkMenu` 菜单项、全局快捷键、60 秒自动保存定时器**四种来源**统一走同一条分发链：来源方设置 `shortcutActive`（动作名）并翻转 `shortcutWatch` → ChartView 的 `watch(shortcutWatch)` 按 `actionMap` 分发到 `saveFile / deleteNode / undo / ...`。导出子菜单四项（图片/HTML/环绕/录屏）同走此通道（`export_png` 等，无键盘键位、不进 keybindingStore，仅菜单入口）；菜单项的禁用/文案/danger 态由 ChartView 的录制状态经 props 单向下发（XkMenu 只读展示）。

快捷键（`window.keydown`）：Ctrl+S 保存、Ctrl+Z 撤销、Ctrl+Y 重做、Delete **框选集优先**——有框选（Shift+拖，见 §8 手势层）时批量删（`delete_selection`，一条 `deleteSelection` 历史承载被选节点 + 直选边 + 删点连带边），否则删**最后点击**的对象（点击节点/边时对称清对方的选中 index，据此分发 `delete_node`/`delete_edge`，无选中时 `<0` 守卫兜底无动作）、Ctrl+R 阻止刷新。修饰键判定在 `utils/platformModifier.js`：键盘快捷键全平台 Ctrl/⌘ 双收（`shortcutModifierActive`），建边拖拽手势按平台分流（`linkDragModifierActive`，macOS ⌘/其余 Ctrl——macOS 的 Ctrl+点按是系统右键语义，不承担建边），框选拖拽全平台统一 Shift（`marqueeModifierActive`，Shift 拖拽无平台保留语义）；提示条与 XkMenu 快捷键文案经 `modifierKeyLabel` 按平台显示 ⌘/Ctrl；Delete/Ctrl+Z/Ctrl+Y 在焦点位于 INPUT/TEXTAREA/可编辑元素时屏蔽，避免打字时误触。组件卸载时移除监听，防止同窗口反复挂载导致快捷键跑两遍。

### 6.4 侧边栏表单组件

两个表单（XkCurrentNode / XkCurrentEdge）通过 `defineModel` 双向绑定表单状态 ref，提交时 **emit 意图**（`change-node` / `change-edge`），由编排层经 `useDocument` 意图方法执行——表单组件不触碰文档数据：

- 节点表单支持在类目下拉中**即时新增类目**（`dropdownRender` 自定义下拉脚）；
- 创建节点（画布双击直操，见 §8）校验：必须有类目、不允许与现有节点同名（节点 name 即主键）；
- 创建连接（画布拖拽直操，见 §8）校验：两点间不允许重复连接（无向判定）；
- 修改节点改名时，同步改写所有引用旧名的边的 source/target（`useDocument.changeNode` 内）；
- 提交失败回显侧栏红条（编排层 `errorMessage`），成功清红条。

### 6.5 主题（深色模式）

状态集中在 `store/themeStore.js`（模块级单例，对齐 chartStore 模式）：

- **三态** `mode`：`auto`（跟随系统）/ `light` / `dark`，持久化 localStorage（`xk-theme-mode`，默认 `auto`）；`effective` 由 `resolveEffective(mode, systemDark)` 纯函数派生。
- **三条触发链**汇到同一个 `apply()`：本窗口 `setMode`（写 localStorage + 应用 +上报主进程）；`storage` 事件（其他窗口改偏好，同 session 跨窗口实时同步）；`matchMedia('prefers-color-scheme')` change（系统切换，仅 auto 模式）。`initTheme()` 在 `main.ts` mount 前调用（幂等），首帧即正确。
- **`apply()` 双动作**：设 `html[data-theme]`（`assets/theme.css` 的 CSS 变量钩子，自定义布局/浮层配色全部变量化）+ 经 `app:theme-applied` 上报主进程（联动见§5.2 `applyTheme`）。
- **antd 接入**：`App.vue` 包 `<a-config-provider>`，深色切 `theme.darkAlgorithm`（基准底 `#141414`，与 CSS 变量/3D 场景同值）；组件色随算法自动切换。
- **3D 场景**：`utils/graphData.js` 的场景色组织为 `SCENE_COLORS` 双色套（浅=白底熄灯黑、深=antd 底点灯白，语义对称），`XkGraph3D` 按 `effective` 取套；切主题时重设 accessor 后强制一次全量 `refresh()`（增量管道按语义 diff，主题切换语义未变不会产生重着色计划）。类目 20 色调色板不动——同一文件在任何主题下类目同色。
- 切换入口统一为设置弹窗 `XkSettings.vue`（主题三选一 radio，即时生效）：首页侧栏「设置」按钮与图表页菜单「设置」项（经 shortcut 管道 `open_settings` 动作）两个入口各挂一份。

### 6.6 快捷键自定义

5 个键盘键位（save/undo/redo/delete/search）可用户自定义，判定纯函数在 `utils/keybindings.js`、状态在 `store/keybindingStore.js`（themeStore 同构：localStorage `xk-keybindings` 只存改过键位、生效视图 = 默认 ⊕ 覆盖、`storage` 事件跨窗口同步，`initKeybindingSync()` 由 `main.ts` mount 前调用）。要点：

- 绑定模型 `{ modifiers: ['primary'|'shift'|'alt'], key }`：`primary` 为 Ctrl/⌘ 归一抽象（保持键盘快捷键双收惯例），判定 `matchEvent` 精确匹配（未列修饰键按下不触发）。
- ChartView shortcutMap / XkSettings 录制（window keydown capture 独占，Esc 只取消录制不关弹窗）/ XkMenu 菜单标注三方共用同一生效视图；录制经 `validateRecording` 拒绝黑名单（Esc/Tab/F5/Ctrl(⌘)+R）与冲突（`findConflict`），search 必须带修饰键（无输入框守卫，裸键会打断打字）。
- `isTypingContext` 守卫跟动作走、不跟键走——改键不改变守卫行为；鼠标手势（双击建点/Shift+拖框选/Ctrl(⌘)+拖连线）固定不可改，设置中只读展示。

### 6.7 国际化（中英双语）

字典单源双端：`src/shared/locales/zh-CN.js` / `en-US.js`（纯数据模块，禁止 import vue/electron），渲染层经 `src/renderer/src/i18n.js` 注册进 vue-i18n 11（legacy: false、`fallbackLocale: 'zh-CN'`、`$t` 全局注入），主进程 `src/main/i18nMain.js` 用约 15 行查表 `t()`（嵌套 key + `{name}` 插值 + 缺 key 回落 zh）读同一份字典——翻译只做一次，双端永远一致。语言偏好纯函数在 `src/shared/localeUtil.js`（三态归一/系统语言映射/生效推导，双端共用）。

- **localeStore**（`store/localeStore.js`，themeStore 同构）：三态 `auto`/`zh-CN`/`en-US`，localStorage `xk-locale`、`storage` 事件跨窗口同步、`initLocaleSync()` mount 前上报主进程；切换时同步 `i18n.global.locale`。跟随系统映射：`zh*` 前缀 → zh-CN，否则 en-US（渲染层 `navigator.language`、主进程 `app.getLocale()`）。
- **主进程上报链**（`app:locale-applied`，`app:theme-applied` 同模式）：主进程 `setCurrentLocale` 后 `refreshTitles()` 重算已登记窗口标题；未命名窗口不在登记簿，由 ChartView `watch(locale)` 重报当前 dirty 走 `file:dirty` 的未命名标题分支刷新。
- **错误 token 契约不动**：`[FILE_CONFLICT]` 等英文字面前缀保留在消息头，翻译只作用于消息体；`shared/chartValidation.mjs` 保持无 electron 依赖的纯模块（示例清单生成脚本直接 import），返回稳定错误码（即字典 `error.validation.<code>` 键），翻译集中在 fileService。
- **antd locale**：`App.vue` 的 `a-config-provider` 补 `:locale`，随语言切 `zhCN`/`enUS`。
- **语言相关文案的动态点**：`ACTION_NAMES` 常量改 `actionName(id)` 函数（设置行名/冲突提示）、ChartView `buttonList` 与 XkSettings `keybindingRows`/`gestureRows` 均 computed 化；3D 底部导航条（navInfo，querySelector 覆盖 three-render-objects 内置英文）在 XkGraph3D/XkWorldGraph `watch(locale)` 重设；nodeLabel 冒号分隔符走字典（accessor 每次悬停执行，天然跟随）。
- **不随语言变化的**：大纲导入默认类目「未分类」与示例内容属数据层；示例排序保持 `localeCompare('zh-CN')`（示例标题为中文）。
- **加语言步骤**：`shared/locales/` 加一份字典 + `localeUtil.js` 的 `LOCALE_MODES` 与 i18nMain 的 `DICTS` 各加一行 + 设置语言行加一个 radio——渲染层复数/插值由 vue-i18n 消息格式（`{n, plural, ...}`）内建，主进程 `t()` 引擎不用动。

### 6.8 视频导出（环绕动画 / 实时录屏）

两种模式共用一条录制管线（`src/renderer/src/utils/videoExport.js`）：

```
three 画布 --每帧 rAF--> 离屏合成 canvas（画布帧 + 水印）
  --captureStream(30)--> MediaRecorder --Blob--> video:save IPC --> 主进程保存框落盘
```

- **水印单源**：合成 canvas 的水印样式出自 `computeWatermarkStyle` 纯函数，`exportPng` 也走同一 `createRecordingCanvas`——PNG 与视频水印同源，画布上不显示、只进导出产物。
- **1080p 录制**：`applyRecordingScale` 录制期间把渲染缓冲按目标高度 1080 放大（`setPixelRatio` 后 WebGL 按新缓冲真实重渲染，原生细节而非事后上采样；CSS 尺寸不动屏幕显示无感），录完恢复——否则画布缓冲跟随窗口×DPR（小窗只有 ~1100×770），视频帧上限被窗口大小绑架。
- **格式探测**：`pickMimeType` 依次探测 `video/mp4;codecs=avc1` → mp4 → webm(vp9/vp8/裸)，全不支持时 toast 降级；返回 `[mime, ext]` 元组。
- **环绕动画**（`exportVideo`）：rAF 循环手动绕当前 lookAt 焦点旋转相机一圈（角度按时间进度插值、帧率无关）。不能用 `controls.autoRotate`——three-render-objects 默认 controlType 是 **trackball**（TrackballControls 无该属性），也不能临时换 controls（交互手感会变）。录制期间 capture 截断画布 pointerdown/move/wheel（库层监听均为 bubble），`Esc` 中途取消丢弃产物。
- **实时录屏**（`startScreenRecording`/`stopScreenRecording`）：同管线但不锁交互不转相机；`Esc` 不参与停止（避免与画布编辑器等既有 Esc 语义冲突）。录屏中画布上悬浮**控制卡片**（`XkRecordingCard.vue`，DOM 覆盖层不在录制画面内）：暂停/继续（`MediaRecorder.pause/resume`，state 守卫幂等；暂停段不产生帧、恢复后时间轴跳过）与结束（红色，走 `stopScreenRecording` 同路），仅右侧 ⠿ 拖动手柄（HolderOutlined，`data-record-drag` 锚点）pointer 拖动，卡片本体不触发（pointerdown 只绑在手柄上）；首次拖动把右下角初始定位换算为 left/top 时须同清 right/bottom（左右/上下约束并存会把 auto 宽高的卡片拉伸变宽），并 clamp 在画布区内。暂停态由 ChartView 持有（`screenPaused`，与录制状态同源），卡片经 props 只读 + emit 上抛，菜单「停止录屏」仍保留为第二停止入口。
- **落盘走主进程**：渲染层 `a.download` 对 MB 级视频不可用（dataURL 有 ~2MB 上限——PNG 182KB 可过、视频不行；`blob:` URL 在 Electron 下不触发下载），故 blob → ArrayBuffer 经 `video:save` IPC 传主进程，`fileService.saveVideoFile` 弹保存框写二进制（一次性导出产物，不进 chart 的 guard/mtime 体系；用户取消静默返回）。`XK_SMOKE_VIDEO_DIR` 环境变量注入时跳过模态保存框直写指定目录——冒烟专用后门（无人值守环境系统保存框会挂死）。
- **互斥**：两种录制状态由 ChartView 持有（`exportingVideo`/`screenRecording` 单一来源），导出子菜单项（`XkMenu`「导出」）disabled 双向互斥、录屏项 danger+「停止录屏」文案切换；XkGraph3D 根节点 `data-video-recording` 锚点（''/orbit/screen）供冒烟断言。
- **测试**：纯函数（探测/命名/水印样式）单测 + `fileService.saveVideoFile` 3 用例（取消/写入/冒烟后门）+ `scripts/smoke-video-export.mjs` 冒烟（状态机
  + Esc 取消 + 互斥 + toast + 经冒烟后门硬断言两个非空视频文件落盘）。

### 6.9 跨文件复制/粘贴（系统剪贴板）

**选型**：走系统剪贴板（主进程 `electron.clipboard`，两通道 IPC 只透传文本）。多窗口 = 多个独立 renderer 进程，窗口间不共享内存；系统剪贴板让选区内容跨窗口/跨文件可用、窗口关闭与应用重启后仍在、用户还能在外部编辑器看到带标记的 JSON。

- **格式层**（`src/shared/graphClipboard.js`，纯模块双端可用）：带 `app: 'xknowledge'` + `type: 'graph-selection'` 标记的 JSON。**字段白名单**——节点只留 `name/des/symbolSize/category`、边只留 `source/target/name/des`，**刻意剥离 x/y/z 与 d3 内部速度字段**：力布局坐标属源图坐标系，跨文件粘贴无意义，新节点不带坐标由 d3 重新摆放（与大纲导入的节点形态一致）。`parseGraphSelection` 严格校验（坏 JSON/无标记/数组缺失/骨架键空串 → null），用户剪贴板通常是任意文本，非本格式提示后中止。
- **收集层**（`src/renderer/src/utils/graphMerge.js`）：`collectCopySelection` 与 Delete 同款三路分发（框选集优先→直选边→最后点击节点），收集**自洽子图**——边端点节点必在集内（框住两个球没框住中间连线时互连边仍在子图里，与删除的「删节点连带删邻边」对称）。`mergeGraphBatch` 是**大纲导入与粘贴共用**的合并语义：同名节点跳过并合并（其边仍接上）、边端点须在「现有 ∪ 新增」并集、无向端点对不与现有重复——两入口一份代码，修一处两处受益。
- **Electron 44 陷阱**：clipboard API 是**异步的**（`readText` 返回 Promise）。主进程 handler 必须 await 后返回纯值——同步返回 `{ text: Promise }` 会在结构化克隆时失败，渲染端 invoke **永久挂起而非 reject**（本节落地时实测踩坑：write 通路 fire-and-forget 恰好无害、read 通路挂死，排查良久）。
- **历史**：新 act `pasteGraph`，undo/redo 与 `importOutline` 同构（节点按名、边按对象引用——`data` 持有 push 进 chartData 的同一批 jsonReactive 产物，同键手建边不误伤，多重边安全），一条历史一步撤销整批。
- **快捷键**：`copy`/`paste` 进 `DEFAULT_BINDINGS`（7 键位，默认 primary+C/V），设置页遍历 `KEYBINDING_IDS` 自动出现；isTypingContext 守卫放行输入框内的原生文本复制/粘贴。
- **同文件推论**（设计使然）：合并语义下同图粘贴全同名、全端点对重复，必为「没有可粘贴的新内容」；要副本先改名。
- **测试**：`graphClipboard`（序列化白名单/坐标剥离/坏数据拒绝）、`graphMerge`（三路分发/合并语义/多重边）、`historyActions` 补 `pasteGraph`、ipc/preload 桥接面各补用例；`scripts/smoke-copy-paste.mjs` 冒烟——真实路径（框选 → Ctrl+C → 剪贴板内容 Node 侧校验）+ 注入路径（evaluate 经 preload 写入「来自另一文件」的选区再 Ctrl+V），剪贴板是 OS 级全局，注入后的读取/解析/合并与真实跨窗口复制完全同代码路径。

### 6.10 交互式 HTML 导出（viewer 单文件）

把当前图谱导出为**双击即可在浏览器打开的单文件 HTML**：数据与 3D 渲染器全部内嵌，接收方零安装漫游（C 档全功能只读：搜索/图例显隐/聚焦三态/边悬停/深浅色/水印）。IPC 走 `export:html-save`（载荷 `{ data, defaultName }`，返回 `{ path }` \|`{ canceled }`；一次性导出产物，同 `video:save` 不进 guard/mtime 体系）。

**选型——为什么是独立 IIFE 构建而非其他**：打包后 `node_modules` 不进 app（build.files 显式排除）、产品要求纯离线，CDN 与运行时读依赖都不可行；renderer 多入口（viewer.html 页面）的产物是 ES module 多 chunk 且 dev（dev-server）与 build（out 路径）两套读取路径，不可控。最终路线：`src/viewer/` 独立源码（纯 JS 无框架，UI 全 DOM API 创建、文案一律 `textContent`——图谱名/描述是用户数据，无 innerHTML 拼接天然防 XSS），`scripts/build-viewer.mjs` 用 vite JS API 打成单 IIFE（minify、`write: false` 内存产物），内联进 `src/viewer/template.html` 的 bundle 占位注释后落 `resources/viewer/index.html`——**模板与 bundle 构建期绑定成单文件**，主进程运行时只做数据替换，杜绝版本错配。产物入库 + prebuild 重生成（examples.manifest 同模式），`resources/**/*` 已在 files 清单自动进包，主进程按 `getAppPath()/resources/viewer/index.html` 读取（asar 内可读，dev 与打包态同一路径）。注意两个 replace 陷阱：bundle 内联用**函数形式** replace（`$&`/`$1` 是 replacement 特殊序列）；模板内不得在占位注释之外重复该字符串（replace 命中第一处）。

**数据注入与转义**（`src/shared/graphViewerData.js` 序列化 + `src/main/exportHtml.js` 拼装，均纯函数有单测）：字段白名单与 graphClipboard 同哲学（节点 `name/des/symbolSize/category`、边 `source/target/name/des`，**刻意剥坐标**——viewer 是动态成形，打开时力导向重新聚合，源图坐标跨文件无意义；0 节点返回 null 由入口拒绝）。注入 `<script type="application/json" id="xk-data">`，JSON 序列化后 `<` 全部转义为 `\\u003c`（合法 JSON 转义、解析还原，比只替换 `</script>` 更彻底——连 `<!--` 解析歧义一并消除）；title 经 HTML 实体转义进 `<title>`。默认文件名 = 图谱名（发送场景文件名应有意义；图库打开的示例无 path，装载链路带 `name` 字段传图库名），空名回退 `composeFileName` 单源。

**渲染语义与编辑器单源**：viewer 直接 import renderer 纯函数——`assignCategoryColors`（类目 20 色）、`SCENE_COLORS`、`labelThreshold`（小节点标签/大图预算封顶）、`focusNeighborhood`/`defaultFocusNode`（聚焦）、`searchGraphNodes`（搜索）、`planHighlightRepaint`（增量重着色 diff），构图参数（`nodeVal = symbolSize³/2500`、SpriteText 标签、>2000 节点模拟加速）对齐 XkGraph3D——导出物与编辑器一份语义，修一处两处受益。水印为 DOM/CSS 叠加（`By XKnowledge`、底部 5%、粗体、字号 `max(18px, 2.2vh)`），视觉参数对齐 PNG 导出的 `computeWatermarkStyle`（语义对齐非代码共享——一个是 canvas 绘制一个是 CSS）。viewer 文案内嵌 zh/en 双语，**跟随导出时应用语言**（`pickViewerLang` 里 data.lang 优先——导出者所见即接收方所得），data.lang 缺失/被改坏时才按接收方 `navigator.language` 自适应。

**测试**：`graphViewerData`（白名单剥离/端点归一/空图 null）、`exportHtml`（占位符全替换/`<` 转义后 JSON 仍可解析/title XSS 实体转义/坏数据拒绝/`XK_SMOKE_HTML_DIR` 冒烟后门）、ipc/preload 桥接面用例；`scripts/smoke-export-html.mjs` 冒烟——真实路径导出落盘后经主进程开新 BrowserWindow 以 `file://` 加载产物，在真实浏览器环境断言 canvas 渲染/搜索步进/点击详情/聚焦灰化（邻域外材质色计数）与隐藏/图例显隐/主题切换/水印，双窗口零渲染错误。

## 7. 核心数据流

### 7.1 图表数据的两条装载路径

```
路径 A（同窗口，首页发起）：
  AddView/BasicLayout 打开文件、双击示例或单击新建空白卡
    → 主进程 readChartFile 校验
    → setPendingChart({ value, path })   # 渲染层 store/chartStore.js
    → router.push('chart')
    → ChartView.onMounted → takePendingChart() 装载

路径 B（跨窗口，图表页发起）：
  ChartView 新建文件 / 打开文件
    → invoke app:new-chart-window({ content, path })
    → 主进程 createChartWindow：新窗口加载 #/chart，pendingCharts 暂存
    → 新窗口 ChartView.onMounted → invoke app:take-pending-chart 取走（取后即清）
```

两条路径都做防御：渲染端装载时再校验一次 v2 结构与悬空边——直接 import 主进程读盘用的同一份 `shared/chartValidation.mjs`（校验单源，格式演进只改一处），损坏内容在主进程已被拦截，这里是兜底。

### 7.2 未保存标记

`saveNodeVisible` 在**任何**修改后置 true：编辑操作、属性开关、排斥力调节等；`saveFile / saveAs` 成功后置 false，并经 `file:opened` 更新主进程登记。它不再驱动顶栏红条（已删除），而是由 `watch` 经 `file:dirty` 上报主进程，窗口标题加圆点提示未保存：应用内标题条圆点在文件名后（`金融 • — XKnowledge`）、任务栏/Alt-Tab 圆点在标题前（`• 金融 — XKnowledge`）；保存成功后圆点随干净态消失。60 秒自动保存与关闭确认继续读 `saveNodeVisible`。

### 7.3 保存 / 自动保存 / 冲突

- 保存分两层：`persistFile` 是核心层（写盘 + 路径/登记/脏标记维护 + 错误处理，无 UI 副作用）；手动保存 `saveFile`（Ctrl/⌘+S/菜单/关闭前保存）在其上叠加「成功后重置侧边栏」（回属性面板、清表单高亮）。有路径直接 `file:save` 写回；无路径（新建空白/示例副本）由主进程弹另存为。
- 自动保存：每 60 秒，若有未保存修改且有文件路径，直接调 `persistFile` 纯保存——后台保存必须隐形，不得清正在填写的表单或切走面板。
- 冲突：`persistFile` 捕获含 `[FILE_CONFLICT]` 的错误后 `autoSaveSuspended = true` 暂停自动保存（避免每分钟重复报错），提示用户「另存为」；另存成功后恢复。

### 7.4 关闭确认流程

```
用户点窗口 X（图表模式已拦截 close）
  → 主进程推送 app:request-close
  → ChartView：无未保存修改 → invoke app:close-window（destroy，绕过拦截）
  │  有未保存修改 → invoke app:confirm-unsaved（模态三按钮：保存/放弃/取消）
  │      cancel  → 什么都不做
  │      discard → app:close-window
  │      save    → saveFile() 成功才 close-window，失败留在当前页
```

### 7.5 撤销 / 重做

历史栈（`useDocument` 持有）存**操作对象**（`utils/historyOps.ts` 的工厂产物）：每个操作自带 `undo(chart)` / `redo(chart)` 把 chartData 变换到相邻历史状态——同一操作的正反两份知识在同一个工厂里相邻成对，不再有 act 字符串分发与两侧 switch 的人肉对称。入栈前先**截断当前位置之后的废弃 redo 分支**，否则 undo 后做新操作会残留过期记录，再次 undo/redo 时会重放与当前状态不符的操作。

多重边安全是补偿语义的硬约束（`examples/中医基础理论.xk`、`地理.xk` 自带同端点多边）：边的定位用「端点对 + 边名」三元组；整批操作（粘贴/大纲导入/框选删除）节点按名、边按对象引用（`toRaw` 归一后比对，防响应式代理身份失配），引用比对天然只命中本批、不误删同端点的手建边。历史为内存态，不落盘。

## 8. 3D 渲染层（XkGraph3D.vue）

对 `3d-force-graph` 的完整封装，props 进 / events 出，不回写父组件数据：

- **数据拷贝**：图实例吃的是 `chartData` 的拷贝（附加内部 `__idx` 与 d3 坐标字段），增量刷新时按 name 匹配旧节点**保留坐标与拖拽锚点**，编辑后已布局的图不跳；发给父组件的点击数据经 `pureNode/pureLink` 剥离内部字段。
- **画布手势层**：dblclick/pointer 事件直接挂 canvas DOM。双击空白建点、⌘/Ctrl+拖连线之外，**Shift+拖为框选**（`marquee`）：矩形以 SVG 覆盖层随拖拽绘制，松手按屏幕投影拾取——框内节点 + 投影线段与框相交的边（隐形/无坐标对象不参与），emit `marquee-select` 给 ChartView 落选中集（`selectionNodes/selectionLinks` props 回流高亮，Delete 批量删）。框选与连线共用 capture 阶段 pointerdown 截断传播独占手势（DragControls/OrbitControls 收不到 pointerdown 不抢拖）；矩形归一/点入框/线段相交的纯几何在 `utils/canvasEdit.js` 可单测。底部导航条（`.scene-nav-info`，querySelector 覆盖库内硬编码英文）在装载/语言切换/选中变更时经 `utils/navInfo.js` 的 `navInfoKey` 重设——无选中＝默认导航文案，点选/框选了节点＝连线手势触点提示（`{modifier}` 随平台渲染），切语言不清掉触点提示（单测锁 key 选择语义）。
- **节点大小语义**：three-forcegraph 半径 = ∛val × nodeRelSize，直接传 symbolSize 时 40/50/70 几乎不可辨；`nodeVal = symbolSize³ / 2500` 让半径与 symbolSize 线性成正比，对齐旧 2D 图语义。
- **标签**：大节点（symbolSize 前 30 名）常显名称（three-spritetext），小节点由「显示小节点名称」开关决定；悬浮提示为 `名称：描述`，边悬浮名由开关控制。
- **类目图例**：覆盖层（DOM，位于库挂载点之外——库初始化会清空挂载容器）点击切换类目显隐，边随两端节点显隐；配色来自 `categoryColor`。
- **配色**：`categoryColor.js` 彩虹 20 色调色板，按类型集合分配——类目名 31 进制多项式哈希取位、被占顺延，类型数 ≤ 20 时零撞色；同一集合结果确定，保存重开/多窗口一致，不依赖插入顺序；颜色不落盘 .xk。高亮色 `#1f1f1f`（黑，与 20 色全区分）。
- **排斥力**：`setRepulsion(v)` 映射 d3 charge 强度 `-v/10`（滑杆 1~500），`d3ReheatSimulation` 重热。
- **导出 PNG**：renderer 开 `preserveDrawingBuffer`（否则 toDataURL 黑屏），离屏 canvas 合成水印「By XKnowledge」（底部居中，仅出现在导出图，画布上不显示），触发下载，文件名含时间戳。
- **自适应**：ResizeObserver 跟随容器（侧边栏显隐、窗口缩放）；首次布局稳定（`onEngineStop`）自动 `zoomToFit` 一次，之后不打扰视角；`resetView` 复位相机+取景。
- **降级**：WebGL 初始化失败时显示提示条、emit `init-failed`，侧边栏编辑与保存仍可用。

## 9. `.xk` 文件格式（v2）

纯 JSON，UTF-8，扩展名 `.xk`：

```json
{
  "version": 2,
  "nodes": [
    { "name": "GDP", "des": "描述", "symbolSize": 50, "category": "宏观经济" }
  ],
  "links": [
    { "source": "GDP", "target": "CPI", "name": "关系名", "des": "关系描述" }
  ]
}
```

约束（主进程 `validateChartStructure` 强制）：

- 顶层必须是对象且 `version === 2`；
- `nodes` / `links` 必须是数组，节点必须是非空对象；
- **节点 `name` 是主键**（全图唯一，3D 图 `nodeId('name')`），边的 `source/target` 按 name 引用，悬空引用视为文件损坏；
- `symbolSize` 建议 1~100（表单输入框限制），实际按球体体积参与渲染。

`data/` 目录下的 `test.json` / `test.xk` 是早期 v1 格式（`{ data: [...] }`）的测试数据，当前应用不读取。示例图谱见 `examples/金融.xk`。

## 10. 安全与健壮性设计一览

| 措施 | 位置 | 目的 |
| --- | --- | --- |
| `sandbox: true` + contextBridge 白名单 | windowManager / preload | 渲染层无 Node API，IPC 面最小 |
| 主进程结构校验拦截损坏文件 | fileService | 坏文件不发渲染进程，避免白屏 |
| 路径授权（PATH_NOT_AUTHORIZED） | fileGuard | 防伪造任意路径写盘 |
| mtime 冲突检测（FILE_CONFLICT） | fileGuard | 多窗口/外部程序编辑不静默互相覆盖 |
| 原子写入 + Windows 占用回退 | fileService.writeFileAtomic | 崩溃/断电不留半个 JSON；同步盘/杀软场景仍可写 |
| 关闭确认 + 崩溃/假死自动解除拦截 | windowManager / ChartView | 防误关丢数据；进程异常时窗口永远关得掉 |
| 禁止刷新 | windowManager | pending 数据取后即清，刷新即丢失 |
| 单实例锁 | index.js | 避免多实例状态分裂 |
| 新窗口只放行 http/https 转系统浏览器 | windowManager | 堵 file: 等协议攻击面 |
| 生产环境不弹 DevTools | windowManager | 不暴露 IPC 桥接 |

已知接受的残留问题：崩溃时机不巧可能在同目录留下 `.tmp-*` 文件（原子写的固有代价）。

## 11. 测试

`yarn test`（vitest run）共 **513 个用例、36 个文件**，全部不依赖真实 Electron 窗口（mock `electron` 模块）：

| 文件 | 覆盖 |
| --- | --- |
| `tests/main/fileGuard.test.js` | 授权/未授权路径、mtime 冲突、错误对象形状 |
| `tests/main/fileService.test.js` | v2 结构校验矩阵、读取错误码、原子写入、EPERM 回退、冲突 token |
| `tests/main/ipc.test.js` | 同文件聚焦、文件-窗口登记与清理、新窗口 pending 透传、窗口标题联动、file:dirty 上报与重置 |
| `tests/main/titleService.test.js` | 标题计算：唯一名、同名补 1/2 级目录链、混合深度互不相同、未保存圆点双位置 |
| `tests/main/windowManager.test.js` | exitChartMode 对称恢复、图表模式进入/退出设置窗口标题、setWindowTitle 双位置标题 |
| `tests/main/exampleService.test.js` | 示例列表元数据提取与缺省回退（走清单层慢路径） |
| `tests/main/exampleManifest.test.js` | 清单序列化/解析/匹配、快路径信任清单、慢路径重建、只读目录静默 |
| `tests/main/example-manifest-sync.test.js` | 同步守护：仓库清单与 examples/ 现扫结果逐字节一致 |
| `tests/main/examplePaths.test.js` | `isExamplePath` 示例目录判定 |
| `tests/main/exportHtml.test.js` / `worldIndex.test.js` / `i18nMain.test.js` | HTML 导出拼装与转义、世界树索引、主进程 i18n 查表 |
| `tests/preload/index.test.js` | contextBridge 桥接面（通道名单 ↔ electronAPI 方法） |
| `tests/shared/*` | locales 字典 key 树与占位符一致性、graphClipboard 序列化白名单、graphViewerData 白名单 |
| `tests/viewer/i18n.test.js` | viewer 内嵌双语 |
| `tests/renderer/useDocument.test.js` | 文档域特征测试：建点建边校验、表单提交（改名同步邻边/撞名拒绝）、删除三路、合并批次、撤销栈不变量（截断 redo 分支）、onChange dirty 语义 |
| `tests/renderer/historyOps.test.js` | 操作对象补偿语义：多重边安全（三元组定位、整批按名/按引用）、常规序列回归 |
| `tests/renderer/useChartFile.test.js` | persistFile/saveAs 全分支（取消/冲突/示例保护/兜底）、保存触发面板重置、自动保存门控（fake timers）、关闭确认 |
| `tests/renderer/useChartAttrs.test.js` | 属性面板：initAttr 默认值、开关联动置脏、简介双向绑定（null 兜底） |
| `tests/renderer/graphData.test.js` | 节点合并、连接归一化、标签阈值、增量重着色计划、deepClone 脱钩、表单空模板 |
| `tests/renderer/graphMerge.test.js` / `canvasEdit.test.js` / `outlineParser.test.js` | 复制三路分发与合并语义、框选几何、大纲解析 |
| `tests/renderer/*Store.test.js` / `keybindings.test.js` / `platformModifier.test.js` | 各 store 状态机（chart/locale/theme/keybinding）、键位判定、平台修饰键 |
| `tests/renderer/categoryColor.test.js` | 调色板稳定性（同名同色、循环取模） |
| `tests/renderer/filterExamples.test.js` / `sortExamples.test.js` / `worldGraph.test.js` / `videoExport.test.js` | 图库过滤/排序、世界树聚合、录制管线纯函数 |

主进程的文件与 IPC 层是回归重点；渲染层 UI 依赖人工冒烟（`scripts/smoke-*.mjs`，见 §4.2 开发指南）。

## 12. 构建与工程

- **开发**：`yarn dev`（electron-vite dev --watch，DevTools 自动分离打开）。
- **类型检查**：`yarn typecheck`（vue-tsc --noEmit）。
- **打包**：`yarn build`（electron-vite build → `out/`）后 `electron-builder` 出包到 `release/`；分平台脚本 `yarn build:win / build:mac / build:linux`，`yarn build:unpack` 只出目录不出安装包。asar 开启，`files` 只带 `out/`、`resources/` 与 `examples/`（含示例清单，§5.6）。Windows 出 NSIS 向导式安装器（`build.nsis`：oneClick 关闭、许可协议页取根目录 `LICENSE`、可选安装目录与安装范围；`build/installer.nsh` 提供协议「勾选接受」形态与快捷方式勾选页，静默 `/S` 安装默认全建快捷方式；向导按钮「翻页式」布局——GUIINIT 时机（`MUI_CUSTOMFUNCTION_GUIINIT`）一次定位：「上一步」独居左下角（左缘与「取消」的右边距对称），「下一步」「取消」保持右下角，「下一步」按 DPI 加宽容纳 UAC 盾牌图标 + 中文文字）。prebuild 自动重新生成示例清单与 viewer 单文件模板（§6.10）；改/增/删 `examples/` 内 `.xk` 后也可手动 `yarn generate:examples`，改 viewer 源码后手动 `yarn build:viewer`。
- **包管理器用 yarn**：请勿混用 npm（会静默丢依赖）；国内网络下 Electron 二进制下载失败时，手动执行 install.js 需显式携带 `ELECTRON_MIRROR` 环境变量（`.npmrc` 对该路径不生效）。
- Lint：ESLint 10 flat config（`eslint.config.mjs`），格式化交给 Prettier。
