# 示例图库（Gallery）设计

日期：2026-09-17
状态：已与用户对齐，待实现

## 背景与目标

`examples/` 目录已有 8 个 `.xk` 示例图谱（金融、中国通史、计算机科学基础、数学知识体系、生物分子与细胞、物理力学与电磁、乐理基础、编程语言生态），但 `GalleryView.vue` 只是空占位符，示例未被任何代码引用。目标：实现图库页展示全部示例，双击即打开体验，且示例打进安装包。

### 已确认的决策（与用户对话记录）

- 入口：首页区块 + 侧边菜单"图库"项，两处入口（其余菜单项仍预留，维持 2026-09-14"死页面预留"决策）
- 卡片：数据徽章卡片（无图）——图谱名 + 类目色点 + 节点/边统计 + 一句话简介
- 架构：主进程目录扫描（方案一），新增示例零代码
- 打包：`build.files` 追加 `examples/**/*`，示例进 asar（只读，天然防写坏）

## 数据与 IPC

### 示例元数据

8 个 `.xk` 顶层补两个可选字段：

- `title`：显示名（如"中国通史"），缺省回退文件名（去扩展名）
- `description`：一句话简介，缺省空串

`validateChartStructure` 只校验必需项、不拒绝额外字段，因此元数据不影响"打开文件"对话框直接打开示例。

### 新 IPC 通道（加入 `src/shared/ipc-channels.js`）

| 通道 | 参数 | 返回 |
|------|------|------|
| `example:list` | 无 | `{examples: [{fileName, title, description, nodeCount, linkCount, categories[]}]}` |
| `example:open` | `{fileName}` | `{content}`；失败 throw（渲染端提示与"打开文件"一致的固定文案） |

### 主进程新模块 `src/main/exampleService.js`

- 目录定位：`path.join(app.getAppPath(), 'examples')`——开发态即项目根 examples，打包态即 asar 内 examples（Electron fs 对 asar 内文件透明支持读取）
- `listExamples()`：扫描目录内 `.xk` 文件，逐个读 JSON 提取元数据与统计（nodeCount/linkCount/categories 去重）。单个文件损坏（读失败/JSON 非法）跳过并在主进程 console.warn，不使整表失败；目录不存在返回空数组
- `openExample(fileName)`：fileName 白名单校验 `^[\w一-龥-]+\.xk$`，且 `path.resolve` 后必须仍在 examples 目录内（防路径穿越）；随后调用 `fileService.readChartFile` 复用全部既有结构校验（version/nodes/links/悬空边）

### 打包

`package.json` 的 `build.files` 数组追加 `"examples/**/*"`。

## UI 与交互

### 入口

- `BasicLayout.vue`：侧边菜单 items 由空数组恢复为 `[{key: '/gallery', label: '图库'}]`（handleClick 已支持路由跳转）
- `AddView.vue`："选取模板"区块下方加"示例图库"入口（标题层级与现有排版一致），点击 `router.push('/gallery')`

### GalleryView.vue

- 标题"示例图库" + 卡片网格（`a-space wrap` 布局，风格对齐 XkCardList）
- 空态：列表为空时显示"暂无示例"，不报错

### 新组件 `XkExampleCard.vue`

200px 宽徽章卡片，风格与现有 `.xk-card` 一致：

- 图谱名（title）
- 类目色点一行（颜色由 `src/renderer/src/utils/categoryColor.js` 同一调色板按类目名哈希计算——卡片配色与打开后图谱内配色天然一致）
- "N 节点 · N 边"统计
- 一句话简介（description）

交互对齐 XkCardList：单击选中（蓝色描边高亮），双击打开。

### 打开流程（副本模式）

双击卡片 → `window.electronAPI.openExample(fileName)` → `setPendingChart({value: content, path: ''})` → `router.push('/chart')`（同窗口跳转，App.vue 自动切全屏 chart 模式，与首页"打开本地文件"同一机制）。

### 保存语义（零新代码）

装载时 `path: ''`，现有 `FILE_SAVE` handler 在无 path 时自动走 `saveChartFileAs` 弹"另存为"对话框——用户编辑的始终是副本，asar 内示例只读永不被写坏；fileGuard 不会授权 asar 内路径，即使渲染端被攻破也无法经保存通道写示例。

## 边界情况

| 情况 | 行为 |
|------|------|
| examples 目录不存在 / 为空 | 列表返回空数组，页面显示"暂无示例" |
| 单个示例损坏 | list 跳过该文件（console.warn）；open 抛错 → `message.error('打开失败：文件读取失败或已损坏')` |
| fileName 含路径穿越（`../` 等） | 白名单 + resolve 校验拒绝 |

## 测试

- `tests/main/exampleService.test.js`（新，对齐现有 vitest 风格）：正常列表、损坏文件跳过、空目录、目录不存在、路径穿越拒绝、title/description 缺省回退
- `tests/main/ipc.test.js` 补 `example:list` / `example:open` 通道用例
- 人工验收：`yarn build:unpack` 后确认安装目录 asar 内含 examples/；dev 态双击卡片打开图谱、编辑后 Ctrl+S 弹"另存为"

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/shared/ipc-channels.js` | +2 通道常量 |
| `src/main/exampleService.js` | 新建 |
| `src/main/ipc.js` | 注册 2 handler |
| `src/preload/index.js`（以实际文件名为准） | 暴露 `listExamples` / `openExample` |
| `src/renderer/src/page/GalleryView.vue` | 实现 |
| `src/renderer/src/components/XkExampleCard.vue` | 新建 |
| `src/renderer/src/layouts/BasicLayout.vue` | 菜单项恢复"图库" |
| `src/renderer/src/page/AddView.vue` | 图库入口区块 |
| `package.json` | build.files 追加 examples |
| `examples/*.xk` × 8 | 补 title/description 元数据 |
| `tests/main/exampleService.test.js` | 新建 |
| `tests/main/ipc.test.js` | 补用例 |

## 不做的事（YAGNI）

- 不做图库内分类筛选（8 个示例平铺足够）
- 不恢复"最近/我的文件"等其他菜单项
- 不做示例内搜索
- 不生成静态缩略图或迷你渲染预览
