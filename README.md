# XKnowledge

一款基于 Electron 的桌面知识图谱软件：以 3D 力导向图组织与展示知识——节点代表概念，
连接代表关系，类目用颜色区分。图谱保存为自有的 `.xk` 文件（JSON 格式），支持导出
带水印的 PNG 图片。

## 功能特性

- **3D 力导向图**：左键旋转、滚轮缩放、右键平移；布局稳定后自动取景，可随时复位。
- **图编辑**：节点/连接的创建、修改、删除；节点支持名称、描述、类目、大小；改名时
  相连连接自动跟随；删除节点连带清理其连接。
- **类目与图例**：类目颜色按名称稳定哈希分配（同名永远同色），图例点击即可切换
  类目显隐。
- **撤销 / 重做**：覆盖全部六类编辑操作（`Ctrl+Z` / `Ctrl+Y`）。
- **多窗口**：新建/打开文件各占独立窗口；同一文件重复打开时自动置前已有窗口；
  窗口标题显示当前文件名，多个同名文件自动补目录区分（如「金融 — 资料」）。
- **可靠的保存**：60 秒自动保存、原子写入防截断、外部修改冲突检测（提示另存为而非
  静默覆盖）、关闭未保存窗口前三选一确认（保存/放弃/取消）。
- **导出 PNG**：当前视图一键导出，自动合成「By XKnowledge」水印。

## 使用

安装后启动即可：

1. 首页双击「思维导图」模板（或左下角「打开本地文件」打开 `.xk` 文件）；
2. 用工具栏或快捷键增删改节点与连接；
3. `Ctrl+S` 保存，属性面板里可调整排斥力、标签显示并导出图片。

完整说明（界面布局、文件操作细节、快捷键、`.xk` 格式、常见问题）见
**[docs/user-guide.md](docs/user-guide.md)**。

## 从源码运行

需要 Node.js 与 yarn：

```bash
yarn install   # 安装依赖
yarn dev       # 开发模式启动
```

> 请全程使用 yarn，不要与 npm 混用（可能静默丢依赖）。国内网络下 Electron 二进制
> 下载失败时，手动执行 install.js 需显式携带 `ELECTRON_MIRROR` 环境变量。

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `yarn dev` | 开发模式（electron-vite watch + DevTools） |
| `yarn test` | 运行单元测试（vitest，37 个用例） |
| `yarn typecheck` | 类型检查（vue-tsc） |
| `yarn build` | 构建（electron-vite build → `out/`） |

## 构建安装包

```bash
# For windows
$ yarn build:win

# For macOS
$ yarn build:mac

# For Linux
$ yarn build:linux

# 只出免安装目录（不出安装包）
$ yarn build:unpack
```

打包产物输出到 `release/`。

## 项目结构

```
src/
├─ main/        # Electron 主进程：窗口管理、IPC、.xk 读写与校验、路径安全
├─ preload/     # contextBridge 白名单暴露 window.electronAPI
├─ shared/      # IPC 通道名单（主进程与 preload 共用）
└─ renderer/    # Vue 3 渲染层：首页、图表编辑页、3D 图组件、侧边栏表单
tests/          # vitest 单元测试（主进程文件/IPC 层 + 渲染层工具）
examples/       # 示例图谱（金融.xk）
docs/           # 文档
```

架构与模块职责详见 **[docs/architecture.md](docs/architecture.md)**。

## 技术栈

Electron 44 · electron-vite 5 / Vite 7 · Vue 3 · vue-router 5 · Ant Design Vue 4 ·
3d-force-graph（Three.js）· TypeScript · Vitest · ESLint / Prettier

## `.xk` 文件格式

UTF-8 编码的 JSON：

```json
{
  "version": 2,
  "nodes": [{ "name": "GDP", "des": "…", "symbolSize": 50, "category": "宏观经济" }],
  "links": [{ "source": "GDP", "target": "CPI", "name": "传导", "des": "…" }]
}
```

节点以 `name` 为唯一标识，连接按节点名引用；格式细节与约束见使用说明。

## 许可证

- 本软件供**个人非商业用途**免费使用，允许原样、完整、免费转发安装包
- 源代码与软件的一切权利归版权人所有，未经书面授权不得使用代码、逆向工程或商业使用
- 商用或组织使用授权请联系 [GitHub Issues](https://github.com/XKnowledge/XKnowledge/issues)
- 完整条款见 [LICENSE](./LICENSE)
