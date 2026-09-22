# XKnowledge 软件结构文档

本文面向开发者，描述 XKnowledge 的总体架构、模块职责、进程间通信与核心数据流。
面向最终用户的功能说明见 [使用说明](./user-guide.md)。

## 1. 项目概览

XKnowledge 是一款基于 Electron 的桌面知识图谱软件：以 3D 力导向图展示和编辑知识图谱，
支持节点/连接的增删改、类目管理、撤销重做、自动保存与 PNG 导出，图谱以自有的 `.xk`
格式（JSON）落盘。

### 技术栈

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 应用框架 | Electron 44 | 主进程 + 预加载 + 渲染进程 |
| 构建链 | electron-vite 5 / Vite 7 | 三段式构建（main / preload / renderer） |
| 前端框架 | Vue 3.5（`<script setup>`） | 渲染层 UI |
| 路由 | vue-router 5（hash 模式） | `loadFile` 场景下无需服务端路由 |
| UI 组件库 | Ant Design Vue 4 | 布局、表单、菜单、提示 |
| 图可视化 | 3d-force-graph（Three.js）+ three-spritetext | 3D 力导向图与节点文字标签 |
| 测试 | Vitest 5 | 135 个单元测试（`yarn test`） |
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
│      ├── XkGraph3D        3D 力导向图（渲染、图例、高亮、导出）                              │
│      └── 侧边栏四表单      XkCreateNode / XkCurrentNode / XkCreateEdge / XkCurrentEdge     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
        src/shared/ipc-channels.js：IPC 通道名单，主进程与 preload 共同引用
```

三条设计主线贯穿全码：

1. **主进程是唯一的文件系统入口**——渲染进程永远拿不到 Node API，读写、对话框、校验
   全部在主进程完成，preload 只暴露白名单方法（`sandbox: true`）。
2. **图表页即窗口**——每个图谱独占一个窗口（新建/在图表页打开文件都开新窗口），窗口
   生命周期与文件的未保存状态强绑定（关闭前确认）。
3. **纯数据格式**——`.xk` v2 只存图数据（nodes/links），不存渲染配置；类目颜色由
   稳定哈希派生，视图设置（排斥力、标签开关等）为会话级，重开即恢复默认。

## 3. 目录结构

```
XKnowledge/
├─ src/
│  ├─ main/                     # Electron 主进程（JS）
│  │  ├─ index.js               # 入口：单实例锁、whenReady 建窗、注册 IPC
│  │  ├─ windowManager.js       # createWindow / createChartWindow / enter|exitChartMode
│  │  ├─ ipc.js                 # registerIpc：全部 ipcMain.handle 与 openedFiles 登记
│  │  ├─ fileService.js         # .xk 读 / 写 / 校验 / 对话框 / 原子写入
│  │  ├─ chartValidation.mjs    # validateChartStructure 纯函数（无 electron 依赖，.mjs 供纯 node 脚本直 import）
│  │  ├─ exampleService.js      # 示例图库对外门面：定位 examples/ 目录并转发
│  │  ├─ exampleManifest.mjs    # 示例元数据清单：快慢两层（§5.6），零 electron 依赖
│  │  └─ fileGuard.js           # createPathGuard：路径授权与 mtime 冲突检测
│  ├─ preload/
│  │  └─ index.js               # contextBridge 暴露 window.electronAPI
│  ├─ shared/
│  │  └─ ipc-channels.js        # IPC 通道名单（唯一出处，禁止裸字符串）
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.ts             # Vue 应用入口（注册 Antd、router）
│        ├─ App.vue             # chart 路由独立渲染，其余套 BasicLayout
│        ├─ router.ts           # 2 条路由（hash 模式）
│        ├─ layouts/BasicLayout.vue   # 首页框架：侧边栏 +「打开本地文件」
│        ├─ page/
│        │  ├─ AddView.vue      # 首页：示例图库 + 新建空白文件
│        │  └─ ChartView.vue    # 图表编辑页（核心，~1000 行）
│        ├─ components/
│        │  ├─ XkGraph3D.vue        # 3D 力导向图封装（详见 §8）
│        │  ├─ XkMenu.vue           # 图表页左上角下拉菜单
│        │  ├─ XkCreateNode.vue     # 侧边栏：创建节点表单
│        │  ├─ XkCurrentNode.vue    # 侧边栏：修改节点表单
│        │  ├─ XkCreateEdge.vue     # 侧边栏：创建连接表单
│        │  └─ XkCurrentEdge.vue    # 侧边栏：修改连接表单
│        ├─ store/chartStore.js     # 同窗口「首页 → 图表页」的一次性数据传递
│        ├─ utils/
│        │  ├─ XkUtils.ts          # jsonReactive / addHistory / resetNodeRef / resetEdgeRef
│        │  └─ categoryColor.js    # 类目彩虹 20 色调色板，集合顺延分配
├─ tests/
│  ├─ main/                     # fileGuard / fileService / ipc 单元测试
│  └─ renderer/categoryColor.test.js
├─ examples/金融.xk              # 金融学习示例图谱
├─ data/                        # 早期 v1 格式测试数据（应用不使用）
├─ resources/                   # 应用图标
├─ release/                     # electron-builder 打包输出
├─ out/                         # electron-vite 构建产物
├─ plan.txt                     # 2026-09 依赖升级评估报告（历史文档）
├─ electron.vite.config.mjs     # 三段式构建配置
└─ package.json                 # 脚本与依赖；build 段为 electron-builder 配置
```

## 4. 进程模型与 IPC

### 4.1 窗口模型

- 主窗口 `900×670`，默认**锁定尺寸**（不可缩放/最大化/最小化），隐藏标题栏 +
  `titleBarOverlay`，`autoHideMenuBar` 且应用菜单置空。
- 窗口进入图表页时调用 `app:enter-chart-mode`：解锁尺寸限制（最小 900×670）并注册
  「关闭前确认」拦截；离开图表页对称调用 `app:exit-chart-mode` 恢复锁定。
- 窗口标题由主进程统一管理：默认「XKnowledge」；进图表页设「未命名 — XKnowledge」；
  装载/保存上报路径后按 `titleService` 计算「文件名[ — 目录链] — XKnowledge」（同名
  自动补目录消歧）；图表页卸载恢复默认。`titleBarOverlay` 只画控制按钮不画标题文字，
  故标题经 `setWindowTitle` 同时 `setTitle`（任务栏/Alt-Tab）并推送 `app:title-changed`，
  由 BasicLayout 的 30px 自绘标题条纯展示（渲染端不自算）。未保存修改时标题带
  圆点且两处位置不同：标题条在文件名后（`金融 ● — XKnowledge`）、任务栏在标题前
  （`● 金融 — XKnowledge`），由渲染端 `file:dirty` 上报驱动。
- **单实例锁**：`requestSingleInstanceLock` 失败即退出。
- **禁止刷新**（F5 / Ctrl+R / Ctrl+F5）：pending 图表数据取后即清，刷新会直接丢失
  图表内容，因此经 `before-input-event` 统一拦截。
- DevTools 仅开发模式自动打开；生产环境不暴露。
- `setWindowOpenHandler`：拒绝所有新窗口请求，http/https 链接转交系统默认浏览器，
  其余协议（file: 等）一律不放行。

### 4.2 IPC 通道契约

通道名单集中在 `src/shared/ipc-channels.js`，命名约定 `<域>:<动作>`。preload 将其包装为
`window.electronAPI` 上的方法；除 `onRequestClose`（主进程推送，返回解绑函数）外均为
`invoke` 请求-响应，主进程 throw 时渲染端收到 reject。

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

### 4.3 错误跨 IPC 的约定

`invoke` 的错误边界只保留 `Error.message`（自定义属性会丢失），因此：

- 主进程所有失败都 throw **Error 实例**（不是普通对象），message 为可直接示人的中文文案；
- 需要渲染端分支处理的场景，在 message 里放**稳定 token**：文件冲突为
  `[FILE_CONFLICT]`，渲染端按 `String(err.message).includes('[FILE_CONFLICT]')` 分支；
- 渲染端多数 catch 不解析 message，直接用固定中文提示，避免边界文案不可靠。

## 5. 主进程模块

### 5.1 index.js

应用入口：`whenReady` 后抢单实例锁 → `createWindow()` + `registerIpc()`；失败即退出。
`window-all-closed` 非 macOS 直接 `app.exit()`。

### 5.2 windowManager.js

| 导出 | 职责 |
| --- | --- |
| `createWindow(onWindowClosed, route)` | 窗口工厂。route 支持直达路由（dev 模式手动拼 hash）；安全配置（sandbox、webviewTag: false、打开行为、刷新拦截、DevTools 策略）都集中在这里 |
| `createChartWindow({ content, path })` | 创建 `#/chart` 窗口并 `stashPendingChart`；path 使新窗口保存直接写回原文件 |
| `takePendingChart(webContentsId)` | 渲染端取走暂存数据（取后即清） |
| `setWindowTitle(win, display, taskbar = display)` | `setTitle(taskbar)`（任务栏/Alt-Tab）+ 推送 `app:title-changed(display)`（自绘标题栏），判销毁；enter/exit 图表模式与登记簿重算统一走它。双参拆分仅服务未保存圆点的两处位置差异，单参调用两值一致 |
| `enterChartMode(window)` / `exitChartMode(window)` | 图表模式的进入/退出，见 §4.1 与 §7.4 |

模块内两个按 `webContents.id` 键控的 Map：`pendingCharts`（待装载图表，取后即清）与
`chartModeWindows`（图表模式事件处理器引用，保证解绑幂等）。

`exitChartMode` 含窗口对称恢复：取消最大化、回退图表页设置的最小尺寸并恢复
900×670 默认尺寸——图表页卸载不再等同于关窗（「关闭文件」会经路由同窗口跳回首页）。
`enterChartMode`/`exitChartMode` 同时设置/恢复窗口标题（未命名/默认），与尺寸恢复
同属对称状态管理。

关闭确认的健壮性设计：拦截 `close` 后若渲染进程崩溃（`render-process-gone`）或假死
（`unresponsive`），自动解除拦截，保证用户点 X 永远能关掉窗口；恢复响应
（`responsive`）后重新启用确认。

### 5.3 ipc.js

`registerIpc()` 注册 §4.2 的全部 handle。额外维护 `openedFiles`（文件路径 → 窗口
webContents.id 登记簿）：

- `file:open` 时若目标文件已被某窗口装载：还原（如最小化）+ 置前 + 聚焦该窗口，返回
  `{ alreadyOpen }`，不重复开窗；登记指向已销毁窗口时清掉陈旧记录。
- `file:opened` 上报时，同一窗口只保留最新一条记录（另存为换路径后，旧文件不再聚焦
  到本窗口）；窗口 `closed` 时自动清理。
- `file:opened` 上报**空路径**时只清除该窗口的记录、不登记新文件（「关闭文件」
  返回首页时用它清登记，避免该文件继续被聚焦到已回首页的窗口）。
- 登记变化（`file:opened` 上报、空路径清除、窗口 `closed` 清理）后调用 `refreshTitles()`：
  按 `titleService.computeTitles` 重算并经 `setWindowTitle` 应用（任务栏 + 自绘标题栏），
  同名窗口的开/关/换名联动（重名解除即恢复短标题）；窗口为空或已销毁时 setWindowTitle
  自行跳过。
- `dirtyWindows`（有未保存修改的窗口集合）：`file:dirty` 上报维护并重算标题——有
  登记的窗口走 `refreshTitles()`，未命名窗口直接设「未命名[ ●] — XKnowledge」双标题；
  `file:opened` 上报（含空路径）重置（装载即干净）；窗口 `closed` 清理时一并删除。

### 5.4 fileService.js

`.xk` 文件的全部 I/O：

- `showOpenDialog(window)`：文件选择框，过滤器只认 `.xk`。
- `readChartFile(path)`：读取 → `JSON.parse` → `validateChartStructure`（version===2、
  nodes/links 为数组、节点项为对象、无悬空边），失败分别 throw `READ_FAILED` /
  `INVALID_JSON` / `INVALID_STRUCTURE`（损坏文件不发渲染进程）；成功授权路径并返回
  `{ content, path }`（content 为原始文本）。
- `saveChartFileAs(window, content, title)`：另存对话框 + 原子写入；对话框选中视为用户
  显式授权。
- `writeChartFile(path, content)`：保存/自动保存路径。写前经 guard 校验（§5.5）。
- `writeFileAtomic`：先写 `${path}.tmp-${pid}-${Date.now()}` 再 `rename` 覆盖，崩溃/
  断电/盘满时目标文件要么旧要么新、不会截断；Windows 上 rename 遇 `EPERM/EBUSY/EACCES`
  （同步盘/杀软占用）回退 `copyFile` 覆盖写。写入成功后回写 guard 的 mtime 记录。

### 5.5 fileGuard.js

`createPathGuard()` 返回 `{ authorize, assertWritable }`，单实例覆盖全部窗口：

- **路径授权**：只允许写「本会话经 readChartFile 或另存对话框授权过的路径」，
  `PATH_NOT_AUTHORIZED` 防止被攻破的渲染进程伪造任意路径写盘。
- **冲突检测**：授权时记录磁盘 mtime，写入前 stat 对比；不一致（其他窗口/外部程序
  改过）throw `FILE_CONFLICT`（message 含 `[FILE_CONFLICT]` token），不做静默覆盖，
  由上层提示用户改用另存为。

### 5.6 exampleService.js + exampleManifest.mjs（示例图库清单）

首页卡片所需元数据（fileName/title/description/nodeCount/linkCount/categories）
预收集进 `examples/examples.manifest.json`（随仓库提交、随打包进 asar），`listExamples`
快慢两层：

- **快路径**：目录 `.xk` 文件名集合与清单一致 → 直接信任清单（~1ms），不再逐文件
  读取（207 个串行约 85ms——首页「新建空白卡先出、停顿、卡片齐现」两段式的根源，
  实测停顿 103ms → 21ms）。「图库看得见的打得开」在清单**生成时**成立；此后文件被
  换坏的极端情形由 `openExample` 复用的 `readChartFile` 损坏拦截兜底（点击时提示
  打开失败而非白屏）。
- **慢路径**：清单缺失/损坏/不一致（开发态增删示例）→ 退回逐文件读取并重写清单，
  下次回到快路径；打包态 asar 只读、重写静默失败（包内清单构建时已保证一致，快路径
  恒命中）。

配套机制：`scripts/generate-example-manifest.mjs`（`yarn generate:examples`，prebuild
自动跑，内容相同不重写）；同步守护测试对清单与目录现扫结果逐字节对比，改示例忘重新
生成时测试红。清单按 fileName 码点序存储（与 readdir 序无关，跨平台字节稳定）；
categories 的 `undefined` 归一为空串保证序列化往返等值（渲染端 filterExamples /
catColor 均已 `?? ''` 防御，展示零影响）。

清单消除了数据等待（~85ms → ~15ms），剩余可感停顿来自渲染侧：207 张卡片一次性
挂载的 paint 是 200~350ms 的主线程长帧（掉帧、页面无响应，dev 模式更甚）。渲染端
两层配合消除：AddView 分帧挂载（数据到手首批 40 张与虚线框同帧可见——40 覆盖任意
首屏视口，剩余 requestAnimationFrame 每帧 +40 铺完；搜索结果即时全量、不受分帧
延迟）；卡片固定
200×150，配 `content-visibility: auto` + `contain-intrinsic-size` 让浏览器跳过
视口外整卡渲染。冒烟 `scripts/smoke-gallery-frame.mjs` 守护三项：首批可见 ≤150ms、
装载期无 >120ms 长帧、搜索即时全量（注意：content-visibility 下测试读卡片文本须
用 textContent——视口外卡片的 innerText 为空串）。

两个 `.mjs` 模块（chartValidation / exampleManifest）保持零 electron 依赖，主进程、
vitest、生成脚本三方直接 import 同一份逻辑；`exampleService.js` 只负责经
`examplesDir()` 定位目录并转发（文件名防穿越校验仍在 `openExample`）。

## 6. 渲染层

### 6.1 路由与布局

`App.vue` 按路由二分：`#/chart` 独占整窗（无侧边布局），其余路由套 `BasicLayout`
（左侧「打开本地文件」按钮 + 顶部拖拽区）。

| 路由 | 页面 | 状态 |
| --- | --- | --- |
| `/` | AddView：示例图库 + 新建空白文件卡片 | 可用 |
| `/chart` | ChartView：图表编辑页 | 可用（核心） |

### 6.2 ChartView 状态模型

图表页状态集中在单个 `xkContext` ref：

```js
{
  errorMessage: '',        // 侧边栏顶部错误提示
  chartData: null,         // 图谱数据（.xk v2 反序列化结果，直接可变）
  updateChart: false,      // 翻转触发 watch 重算类目、标记未保存
  historyList: [],         // 操作历史栈（撤销/重做的数据源）
  historySequenceNumber: -1 // 当前位置（-1 表示栈底之前）
}
```

节点/边的增删改**直接修改 `chartData`**（数组 splice/push/整项替换），随后翻转
`updateChart` 触发派生计算（类目列表、未保存标记）与 `XkGraph3D` 的增量刷新
（`watch [props.nodes, props.links]`，deep）。

侧边栏以 `xxxVisible` 布尔族互斥切换显示：属性面板 / 创建节点 / 修改节点 / 创建连接 /
修改连接五选一；图表点击节点/边时自动切换到对应表单并记录高亮。

### 6.3 操作触发的统一分发

工具栏按钮、`XkMenu` 菜单项、全局快捷键、60 秒自动保存定时器**四种来源**统一走同一条
分发链：来源方设置 `shortcutActive`（动作名）并翻转 `shortcutWatch` → ChartView 的
`watch(shortcutWatch)` 按 `actionMap` 分发到 `saveFile / createNode / undo / ...`。

快捷键（`window.keydown`）：Ctrl+S 保存、Ctrl+Z 撤销、Ctrl+Y 重做、Insert 创建节点、
Delete 删除**最后点击**的对象（点击节点/边时对称清对方的选中 index，据此分发
`delete_node`/`delete_edge`，无选中时 `<0` 守卫兜底无动作）、Ctrl+R 阻止刷新；
Insert/Delete/Ctrl+Z/Ctrl+Y 在焦点位于
INPUT/TEXTAREA/可编辑元素时屏蔽，避免打字时误触。组件卸载时移除监听，防止同窗口反复
挂载导致快捷键跑两遍。

### 6.4 侧边栏表单组件

四个表单（XkCreateNode / XkCurrentNode / XkCreateEdge / XkCurrentEdge）均通过
`defineModel` 双向绑定 ChartView 的 ref，只负责校验与提交，不做 I/O：

- 节点表单支持在类目下拉中**即时新增类目**（`dropdownRender` 自定义下拉脚）；
- 创建节点校验：必须有类目、不允许与现有节点同名（节点 name 即主键）；
- 创建连接校验：必须恰好选中 2 个高亮节点、两点间不允许重复连接（无向判定）；
- 修改节点改名时，同步改写所有引用旧名的边的 source/target；
- 提交成功统一走 `addHistory` 记录历史。

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

两条路径都做防御：渲染端装载时再校验一次 v2 结构与悬空边（与主进程
`validateChartStructure` 对齐），损坏内容在主进程已被拦截，这里是兜底。

### 7.2 未保存标记

`saveNodeVisible` 在**任何**修改后置 true：编辑操作、属性开关、排斥力调节等；
`saveFile / saveAs` 成功后置 false，并经 `file:opened` 更新主进程登记。它不再驱动
顶栏红条（已删除），而是由 `watch` 经 `file:dirty` 上报主进程，窗口标题加圆点提示
未保存：应用内标题条圆点在文件名后（`金融 ● — XKnowledge`）、任务栏/Alt-Tab 圆点
在标题前（`● 金融 — XKnowledge`）；保存成功后圆点随干净态消失。60 秒自动保存与
关闭确认继续读 `saveNodeVisible`。

### 7.3 保存 / 自动保存 / 冲突

- 保存分两层：`persistFile` 是核心层（写盘 + 路径/登记/脏标记维护 + 错误处理，
  无 UI 副作用）；手动保存 `saveFile`（Ctrl+S/菜单/关闭前保存）在其上叠加
  「成功后重置侧边栏」（回属性面板、清表单高亮）。有路径直接 `file:save` 写回；
  无路径（新建空白/示例副本）由主进程弹另存为。
- 自动保存：每 60 秒，若有未保存修改且有文件路径，直接调 `persistFile` 纯保存——
  后台保存必须隐形，不得清正在填写的表单或切走面板。
- 冲突：`persistFile` 捕获含 `[FILE_CONFLICT]` 的错误后 `autoSaveSuspended = true`
  暂停自动保存（避免每分钟重复报错），提示用户「另存为」；另存成功后恢复。

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

历史栈元素为 `{ act, ... }`，`act ∈ { createNode, deleteNode, changeNode, createEdge,
deleteEdge, changeEdge }`；创建/删除携带 `data`（删除节点额外携带被连带删除的
`links`），修改携带 `old/new`。`addHistory`（XkUtils）追加前先**截断当前位置之后的
废弃 redo 分支**，否则 undo 后做新操作会残留过期记录，再次 undo/redo 会重放与当前
状态不符的操作。撤销/重做的逆操作以策略对象（`actionHandlers` 映射）实现，按节点
name 定位目标。历史为内存态，不落盘。

## 8. 3D 渲染层（XkGraph3D.vue）

对 `3d-force-graph` 的完整封装，props 进 / events 出，不回写父组件数据：

- **数据拷贝**：图实例吃的是 `chartData` 的拷贝（附加内部 `__idx` 与 d3 坐标字段），
  增量刷新时按 name 匹配旧节点**保留坐标与拖拽锚点**，编辑后已布局的图不跳；发给父
  组件的点击数据经 `pureNode/pureLink` 剥离内部字段。
- **节点大小语义**：three-forcegraph 半径 = ∛val × nodeRelSize，直接传 symbolSize 时
  40/50/70 几乎不可辨；`nodeVal = symbolSize³ / 2500` 让半径与 symbolSize 线性成正比，
  对齐旧 2D 图语义。
- **标签**：大节点（symbolSize 前 30 名）常显名称（three-spritetext），小节点由
  「显示小节点名称」开关决定；悬浮提示为 `名称：描述`，边悬浮名由开关控制。
- **类目图例**：覆盖层（DOM，位于库挂载点之外——库初始化会清空挂载容器）点击切换
  类目显隐，边随两端节点显隐；配色来自 `categoryColor`。
- **配色**：`categoryColor.js` 彩虹 20 色调色板，按类型集合分配——类目名 31 进制
  多项式哈希取位、被占顺延，类型数 ≤ 20 时零撞色；同一集合结果确定，保存重开/
  多窗口一致，不依赖插入顺序；颜色不落盘 .xk。高亮色 `#1f1f1f`（黑，与 20 色全区分）。
- **排斥力**：`setRepulsion(v)` 映射 d3 charge 强度 `-v/10`（滑杆 1~500），
  `d3ReheatSimulation` 重热。
- **导出 PNG**：renderer 开 `preserveDrawingBuffer`（否则 toDataURL 黑屏），离屏
  canvas 合成水印「By XKnowledge」（底部居中，仅出现在导出图，画布上不显示），触发
  下载，文件名含时间戳。
- **自适应**：ResizeObserver 跟随容器（侧边栏显隐、窗口缩放）；首次布局稳定
  （`onEngineStop`）自动 `zoomToFit` 一次，之后不打扰视角；`resetView` 复位相机+取景。
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
- **节点 `name` 是主键**（全图唯一，3D 图 `nodeId('name')`），边的 `source/target`
  按 name 引用，悬空引用视为文件损坏；
- `symbolSize` 建议 1~100（表单输入框限制），实际按球体体积参与渲染。

`data/` 目录下的 `test.json` / `test.xk` 是早期 v1 格式（`{ data: [...] }`）的测试数据，
当前应用不读取。示例图谱见 `examples/金融.xk`。

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

`yarn test`（vitest run）共 **135 个用例、10 个文件**，全部不依赖真实 Electron 窗口
（mock `electron` 模块）：

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
| `tests/renderer/categoryColor.test.js` | 调色板稳定性（同名同色、循环取模） |
| `tests/renderer/graphData.test.js` | 节点合并、连接归一化、标签阈值、增量重着色计划 |
| `tests/renderer/historyActions.test.js` | 撤销/重做：多重边安全与常规序列回归 |

主进程的文件与 IPC 层是回归重点；渲染层 UI 依赖人工冒烟。

## 12. 构建与工程

- **开发**：`yarn dev`（electron-vite dev --watch，DevTools 自动分离打开）。
- **类型检查**：`yarn typecheck`（vue-tsc --noEmit）。
- **打包**：`yarn build`（electron-vite build → `out/`）后 `electron-builder` 出包到
  `release/`；分平台脚本 `yarn build:win / build:mac / build:linux`，`yarn build:unpack`
  只出目录不出安装包。asar 开启，`files` 只带 `out/`、`resources/` 与 `examples/`
  （含示例清单，§5.6）。prebuild 自动重新生成示例清单；改/增/删 `examples/` 内
  `.xk` 后也可手动 `yarn generate:examples`。
- **包管理器用 yarn**：请勿混用 npm（会静默丢依赖）；国内网络下 Electron 二进制下载
  失败时，手动执行 install.js 需显式携带 `ELECTRON_MIRROR` 环境变量（`.npmrc` 对该
  路径不生效）。
- Lint：ESLint 10 flat config（`eslint.config.mjs`），格式化交给 Prettier。
