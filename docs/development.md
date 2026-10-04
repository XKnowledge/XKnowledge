# XKnowledge 开发指南

本文面向开发者，讲**怎么参与开发**：环境搭建、日常工作流、测试体系、构建打包、
CI 与发版、提交信息规范。代码结构、模块职责与设计决策见
[软件结构文档](./architecture.md)（本文不重复其内容）；面向最终用户的功能说明见
[用户手册](./user-guide.md)。

## 1. 环境搭建

前置：Node.js（CI 锚定 22，见 §7）与 yarn。

```bash
yarn install     # 安装依赖（postinstall 自动执行 electron-builder install-app-deps）
yarn dev         # 开发模式启动（electron-vite dev --watch，DevTools 自动分离打开）
```

- **包管理器只用 yarn**，不要与 npm 混用——会静默丢依赖。
- 仓库根 `.npmrc` 已配置 npmmirror 的 Electron 与 electron-builder 二进制镜像；
  国内网络下手动执行 install.js 时需**显式携带 `ELECTRON_MIRROR` 环境变量**
  （`.npmrc` 对该路径不生效）。CI 出于网络环境差异会先删掉 `.npmrc` 再装依赖。

## 2. 常用脚本

| 命令                                           | 说明                                                         |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `yarn dev`                                     | 开发模式（electron-vite dev --watch + DevTools）             |
| `yarn test`                                    | 单元测试（vitest run，约 2 秒，见 §4.1）                     |
| `yarn typecheck`                               | 类型检查（vue-tsc --noEmit）                                 |
| `npx eslint .`                                 | Lint（ESLint 10 flat config，无独立 script）                 |
| `npx prettier --write .`                       | 格式化（Prettier 3，printWidth 100）                         |
| `yarn build`                                   | 构建（electron-vite build → `out/`）                         |
| `yarn generate:examples`                       | 重新生成示例图库清单 `examples/examples.manifest.json`       |
| `yarn build:viewer`                            | 重新生成导出 HTML 的单文件模板 `resources/viewer/index.html` |
| `yarn build:unpack`                            | 构建并只出免安装目录（不出安装包）                           |
| `yarn build:win` / `build:mac` / `build:linux` | 三平台安装包 → `release/`                                    |

`prebuild` 在每次 `yarn build` 前自动重跑示例清单与 viewer 模板两个生成器
（内容相同不重写），通常无需手动执行。

## 3. 开发工作流

改代码 → 跑测试 → 过检查 → （涉及界面交互时）跑冒烟：

1. `yarn test` —— 单元测试全绿（约 2 秒，没有理由跳过）；
2. `yarn typecheck` —— vue-tsc 无错；
3. `npx eslint .` —— 无 lint 问题；
4. `npx prettier --write .` —— 格式化改动文件（CI 与仓库风格以 prettier 为准）；
5. UI / 交互改动跑对应的冒烟脚本（见 §4.2）。

几条贯穿全仓的约定（背景与理由见 [软件结构文档](./architecture.md)）：

- **纯逻辑抽纯函数模块**：不依赖 electron 的逻辑放 `.mjs` / 纯函数文件，主进程、
  vitest、构建脚本三方直接 import 同一份实现（`chartValidation.mjs`、
  `exampleManifest.mjs` 均为此模式）。
- **IPC 通道名单单源**：`src/shared/ipc-channels.js` 是唯一出处，禁止裸写字符串。
- **双语字典单源**：`src/shared/locales/`（纯数据模块，禁止 import vue/electron），
  渲染层与主进程共用；改文案两个语言都要改，`tests/shared/locales.test.js` 会锁
  key 树与占位符一致性。
- **改 `examples/` 内 `.xk` 后必须 `yarn generate:examples`**——同步守护测试
  对清单与目录现扫结果逐字节对比，忘了跑测试必红。
- **改 `src/viewer/` 后必须 `yarn build:viewer`**——`resources/viewer/index.html`
  是构建产物入库，导出 HTML 功能读的是它。
- 代码语言：主进程与 preload 全部为 JS；渲染层入口与工具函数为 TS（vue-tsc 只查
  TS 侧）。

## 4. 测试体系

### 4.1 单元测试（`yarn test`）

vitest run，全量 mock `electron` 模块、不依赖真实窗口，约 2 秒跑完。截至 v2.5.0
为 484 用例 / 34 文件（数量随版本增长，以 `yarn test` 输出为准），按被测层分目录：

| 目录              | 覆盖                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `tests/main/`     | 主进程：文件读写与校验、路径守卫、IPC 登记、窗口管理、标题计算、示例清单、HTML 导出拼装  |
| `tests/preload/`  | contextBridge 桥接面：API → IPC 通道映射、推送回调剥 event                               |
| `tests/renderer/` | 渲染层 utils / store：画布编辑、历史栈、图数据、快捷键、主题、语言、大纲解析、视频导出等 |
| `tests/shared/`   | 纯函数：剪贴板序列化、viewer 数据白名单、双语字典一致性                                  |
| `tests/viewer/`   | 导出 HTML 查看器的语言选择等                                                             |

项目测试约定（重要）：

- **`.vue` 组件不硬加组件单测**——可测逻辑抽到 utils / store 再测；组件交互由
  冒烟 E2E 覆盖。
- **断言中文文案的测试钉住 i18n 语言**（`beforeAll` 将 locale 钉为 zh-CN）：
  i18n 初始语言 = localStorage 偏好 ⊕ `navigator.language`，本地中文 Windows 恒绿、
  CI 英文 runner 会挂（已有前车之鉴）。
- 撤销/重做相关改动注意跑 `historyActions` 相关用例：**undo 后做新操作截断 redo
  分支**是历史栈的核心不变量。

### 4.2 冒烟测试（E2E）

`scripts/smoke-*.mjs` 共 21 个，playwright-core 驱动**真实 Electron 应用**走真实
路径（框选、剪贴板、保存框、录制……），每个脚本头部注释写明覆盖点与断言清单。

```bash
yarn build                        # 先构建（冒烟跑的是打包产物路径）
node scripts/smoke-copy-paste.mjs # 跑单个冒烟
```

注意：

- **应用不能在运行**（含 `yarn dev`）——单实例锁会让新实例启动即退出；
- 截图与断言产物默认落 `.artifacts/smoke-shots-*` 各脚本专属目录，环境变量
  `SMOKESHOT_DIR` 可覆盖；
- 定位 UI 元素依赖源码中的 `data-*` 锚点（如 `data-export-*`、`data-reset-view`），
  改动相关 DOM 时同步维护；
- 改交互行为时，先改/补对应冒烟的断言再改实现，脚本即回归清单。

## 5. 从源码运行

需要 Node.js 与 yarn：

```bash
yarn install   # 安装依赖
yarn dev       # 开发模式启动
```

> 请全程使用 yarn，不要与 npm 混用（可能静默丢依赖）。国内网络下 Electron 二进制
> 下载失败时，手动执行 install.js 需显式携带 `ELECTRON_MIRROR` 环境变量。

## 6. 构建与打包

- `yarn build` 产出 `out/`（main / preload / renderer 三段式）；
- `electron-builder` 出包到 `release/`：Windows NSIS 安装器、macOS dmg、Linux
  AppImage；`yarn build:unpack` 只出免安装目录；
- `prebuild` 自动重新生成示例清单与 viewer 模板（§2）；
- electron-builder 配置在 `package.json` 的 `build` 段（asar、files 白名单、NSIS
  向导细节等），逐项说明见 [软件结构文档 §12](./architecture.md)。

## 7. CI 与发版

CI 定义在 `.github/workflows/build.yml`：

- **触发**：推送 `v*` tag；
- **build job**：三平台矩阵（windows / macos / ubuntu，fail-fast 关闭），步骤为
  删 `.npmrc` → `yarn install --frozen-lockfile` → `yarn test` → `yarn typecheck`
  → 平台构建 → 上传安装包产物；
- **release job**：汇总三平台产物（exe / dmg / AppImage）创建 GitHub Release。

发版流程（依仓库惯例）：

1. `package.json` 版本号升级，单独提交（`chore：版本号升级至 vX.Y.Z`）；
2. 撰写 `docs/release-notes/vX.Y.Z.md`（沿用既有结构：新增功能 / 问题修复 / 其他 /
   内部 commit 清单，可从 `git log vPREV..HEAD` 整理）；
3. 提交后打 tag 并推送，CI 自动出包发 Release。

## 8. 提交信息规范

单行超长、信息密度高的中文提交信息是本仓库的鲜明风格：`类型：主题——关键决策与
理由、根因、影响面、踩坑、测试证据`。类型前缀沿用既有惯例：

| 前缀      | 用途                   |
| --------- | ---------------------- |
| `feat：`  | 新功能                 |
| `fix：`   | 缺陷修复（含根因分析） |
| `docs：`  | 文档                   |
| `test：`  | 测试补充               |
| `chore：` | 版本号、构建等杂项     |

要点：

- 写**为什么**而非仅写了什么——决策理由、被否掉的替代方案、踩过的坑都值得进
  commit message（仓库历史即设计文档）；
- 功能改动同步更新 `docs/user-guide.md` 与 `docs/architecture.md` 对应章节，
  并在 commit message 中注明（如「user-guide §x 同步」）；
- 附上测试证据（单测多少全过、哪个冒烟多少项 ALL PASS）。

## 9. 相关文档

| 文档                                                                                   | 内容                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------ |
| [architecture.md](./architecture.md)                                                   | 软件结构：架构、模块职责、IPC 契约、数据流 |
| [user-guide.md](./user-guide.md)                                                       | 面向最终用户的用户手册                     |
| [future-features.md](./future-features.md)                                             | 功能规划与调研                             |
| [release-notes/](./release-notes/)                                                     | 各版本更新说明                             |
| [superpowers/specs/](./superpowers/specs/)、[superpowers/plans/](./superpowers/plans/) | 各功能的设计文档与实施计划归档             |
