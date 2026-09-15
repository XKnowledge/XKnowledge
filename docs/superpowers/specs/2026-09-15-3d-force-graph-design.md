# XKnowledge 3D 力导向图设计

- 日期：2026-09-15
- 状态：已获用户批准（三节设计逐节确认）

## 背景与目标

XKnowledge 当前的知识图谱基于 ECharts 6 的 2D `graph`（`layout: 'force'`）系列，
图表本身承担编辑器职责（点击高亮、增删节点/边、拖拽、undo/redo、自动保存）。
用户希望改为**真 3D 力导向图**：节点在三维空间中分布，可旋转视角、缩放浏览。

已确认的约束与决策：

1. **编辑功能基本全保留**：点击节点/边弹侧边栏编辑、创建/删除节点和边、
   undo/redo 都必须在 3D 图中可用；3D 下难以实现的交互（如整图自由拖节点之外
   的高级定位）可放弃——实际上节点拖拽本身可保留。
2. **不兼容旧 `.xk` 文件**：现存的"echarts option JSON"格式文件无需打开，
   直接采用新格式。
3. **规模预期**：单图百级节点（几十到几百节点、几百到两千边）。

## 技术选型

**选定：[3d-force-graph](https://github.com/vasturiano/3d-force-graph)**
（Three.js/WebGL 渲染 + d3-force-3d 布局）。

理由：

- 专为 3D 力导向图设计：`onNodeClick`/`onLinkClick`/`onNodeHover`、
  `enableNodeDrag`（节点拖拽内置）、`nodeAutoColorBy` 类目着色、
  `nodeLabel`/`linkLabel` 悬浮标签、3D 力布局全自动，需求清单逐条命中。
- 与 ECharts 版本无关。echarts-gl 2.x 官方仅兼容 ECharts 5.x，而本项目
  已升级 ECharts 6，且 echarts-gl 自 2022 年基本停更，不支持
  highlight/downplay、legend、节点拖拽与边标签——不采用。
- 纯 Three.js 手写方案工作量数倍且收益为零——不采用。

附带收益：**移除 echarts 依赖**（全项目仅 ChartView 使用）。

## 数据格式（新 `.xk`）

从"存 ECharts option"改为纯数据，渲染配置不再进文件：

```json
{
  "version": 2,
  "nodes": [
    { "name": "node01", "des": "描述", "symbolSize": 50, "category": "类目0" }
  ],
  "links": [
    { "source": "node01", "target": "node02", "name": "link01", "des": "边描述" }
  ]
}
```

- 节点/边字段与现有侧边栏组件（XkCreateNode/XkCurrentNode/XkCreateEdge/
  XkCurrentEdge）完全一致，侧边栏编辑组件**零改动**。
- 坐标（x/y/z）由力布局在内存中计算，不持久化；每次打开自动展开，
  装载后 `zoomToFit` 归位。

## 组件划分

### `XkGraph3D.vue`（新建，`src/renderer/src/components/`）

承载所有 3D 职责，单一职责、可独立理解：

- ForceGraph3D 实例生命周期：init / `_destructor()` / resize / 挂载卸载。
- 着色：固定 12 色调色板按类目名稳定分配（同名类目永远同色）。
- 高亮：`highlightNodes`（最多 2 个）与 `highlightLink` props，
  通过 `nodeColor`/`linkColor` accessor 动态返回高亮色。
- 类目图例：HTML 覆盖层（色点 + 类目名），点击切换该类显隐
  （`nodeVisibility`/`linkVisibility`）。
- 水印 "By XKnowledge"：HTML 覆盖层固定 div，视觉与现状一致。
- 导出 PNG：构造时 `rendererConfig: { preserveDrawingBuffer: true }`，
  `toDataURL` 导出。
- 相机还原：相机归位 + `zoomToFit`。
- 接口全部走 props/emits 与 `defineExpose`：`nodes`、`links`、
  `highlightNodes`、`highlightLink` 进，`node-click`、`link-click`、
  `node-drag-end` 出；`setRepulsion(n)`、`exportPng()`、`resetView()`
  暴露为方法。不碰文件、不碰历史记录。

### `ChartView.vue`（改造）

瘦身为编排层，保留：快捷键、undo/redo（记录 nodes/links 快照，逻辑不变）、
侧边栏编排、自动保存、文件打开/保存。"刷新图表"从
`chartInstance.setOption(...)` 改为向 `XkGraph3D` 传新 props。

### 其他改动文件

- `template1.ts`：产出新格式模板（节点/边示例数据同现状）。
- `src/main/fileService.js`：主进程校验改为新格式
  （`version === 2`、`nodes`/`links` 为数组、link 的 source/target
  必须引用存在的节点名）。
- `package.json`：移除 echarts，新增 3d-force-graph（用 yarn，遵循项目约定）。

## 交互映射（现有功能 → 3D 落地）

| 现有功能 | 3D 实现方式 |
|---|---|
| 点击节点 → 高亮（最多 2 个，第 3 个挤掉最早）+ 侧边栏 | `onNodeClick`，高亮逻辑照搬，accessor 动态着色 |
| 点击边 → 高亮 + 侧边栏 | `onLinkClick`，同上 |
| 悬浮显示 `des` | `nodeLabel`/`linkLabel` accessor 返回 des（悬浮气泡） |
| 拖拽节点 | `enableNodeDrag(true)` 内置 |
| 缩放/平移 | 内置轨道相机：左键旋转、滚轮缩放、右键平移 |
| 排斥力滑杆 | `d3Force('charge').strength(-repulsion)`，滑杆交互照搬 |
| 类目图例筛选 | HTML 覆盖层图例，点击切换类目显隐 |
| 显示连接名称开关 | 改为悬浮显示（linkLabel）；3D 常显几百条边标签会糊成一片，不做常显 |
| 水印 | HTML 覆盖层 div |
| 工具箱导出 PNG / 还原 | 工具栏按钮：`toDataURL` 导出；相机归位 + `zoomToFit` |
| 节点名称常显 | 常显前 30 个大节点（按 symbolSize 排序）名称，其余悬浮显示 |

**编辑后刷新策略**：增删节点/边不整图重灌（避免重启仿真导致节点弹开）。
保留节点既有坐标，将变更增量喂给 d3-force-3d；新节点随机入场由力布局展开。

## 数据流

```
用户操作（侧边栏/快捷键/拖拽）
  → ChartView 修改 chartData（nodes/links 纯数据）
  → undo/redo 历史照旧（nodes/links 快照）
  → watch 触发 → XkGraph3D 新 props → d3-force-3d 增量更新
  → 自动保存/手动保存 → JSON.stringify(chartData) → .xk 文件
```

## 错误处理

- **装载失败**（JSON 损坏/结构缺失/悬空 link）：沿用现有双保险——主进程
  拦截（fileService 校验）+ 渲染进程兜底，`message.error` 固定中文提示，
  不崩溃。
- **WebGL 初始化失败**：图表区显示提示条；侧边栏编辑仍可用（数据层
  不依赖渲染层存活）。
- **资源释放**：路由卸载时 `graph._destructor()` + 移除 resize 监听，
  对齐现有 `dispose` 位置，防同窗口二次挂载泄漏（现有代码已踩过此坑）。

## 测试（vitest + vue-tsc，项目已有）

- `fileService` 新校验单测：合法文件、缺 version、缺 nodes、悬空 link 各一例。
- 类目调色板稳定性单测：同名类目两次计算同色。
- `XkGraph3D.vue` 渲染层不做 DOM 级测试（WebGL 场景测试成本高收益低），
  靠 `yarn test` + `yarn typecheck` + 手动冒烟把关：
  新建 → 编辑（增删节点/边/改属性）→ 保存 → 重开 → undo/redo → 导出 PNG。

## 明确不做（YAGNI）

- 旧 `.xk`（echarts option 格式）文件的兼容打开。
- 边标签常显、2D/3D 双模式切换、VR/AR。
- 节点坐标持久化（每次打开由力布局重新展开）。
