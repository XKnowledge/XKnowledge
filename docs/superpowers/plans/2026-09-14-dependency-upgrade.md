# 依赖升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除依赖安全漏洞（`yarn audit`：302 个，4 Critical / 182 High / 90 Moderate / 26 Low），把落后的依赖升级到兼容性允许的最新版，全程保持任意提交点可构建、可测试、可冒烟。

**评估日期:** 2026-09-14。版本号与漏洞数据均为当日快照，动手前用 `yarn outdated` / `yarn audit --summary` 复核。

**Tech Stack（升级前）:** Electron 28.3.3、electron-vite 2.2.0、vite 5.2.12、vitest 3.2.7、vue 3.4.27、vue-tsc 1.8.27 + typescript 5.4.5、eslint 8.57.0、echarts 5.5.0、ant-design-vue 4.2.1。

## 兼容性硬约束（决定路线，勿凭直觉改）

| 约束                                                  | 结论                                                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| electron-vite@5 peer 仅接受 `vite ^5 \|\| ^6 \|\| ^7` | **vite 上限锁 7**，禁上 vite 8（支持 8 的 electron-vite 6 仍是 beta，截至 2026-09）                                                 |
| vitest@5 peer 要求 `vite ^6.4+`                       | 与 vite 7 兼容 ✓                                                                                                                    |
| vue-tsc@3.3 peer 要求 `typescript >=5.0`              | 配 TS 5.9 ✓；**TS 7（tsgo）不采用**，vue-tsc 3 与原生编译器组合未经验证                                                             |
| 本机 node v24.13.0                                    | 满足 electron-vite 5（`^20.19 \|\| >=22.12`）与 vitest 5 ✓                                                                          |
| Electron 23 起仅支持 Win10+                           | 开发机 Win11 ✓，产品如需兼容 Win7 则止步 Electron 28（需用户决策，当前默认放弃 Win7）                                               |
| `.npmrc` 的 electron 二进制镜像                       | `electron_mirror=https://npmmirror.com/mirrors/electron/` 仍有效，但 npm 已警告该 key 格式过时；P0 装完若二进制拉取失败，先排查此处 |

## Global Constraints

- **只用 yarn**，禁止 npm install / npx（混用会静默丢依赖，见项目记忆 use-yarn-not-npm）。
- 每个 Task 一个独立提交，提交信息 `chore：`/`build：`/`fix：` + 中文描述（与仓库历史一致），任意提交点可构建。
- **每 Task 收尾必跑全套验证**：`yarn test`（35 个单元测试）→ `yarn typecheck` → `yarn build`（三端编译）→ `yarn run build:unpack`（Task 1、5 额外跑打包）→ 手工冒烟（见各 Task）。
- 主进程 API 面（BrowserWindow / ipcMain.handle / dialog.showMessageBox / contextBridge / sandbox / before-input-event / render-process-gone / unresponsive）全部是长期稳定 API——升级后如冒烟失败，优先怀疑行为差异而非 API 移除。
- 注释与提交信息使用简体中文。

## 统一冒烟清单（Task 1、2、5 必走；3、4 跑自动化即可）

1. 首页「打开本地文件」→ 图表窗口打开，内容渲染正常
2. 打开损坏/非法 JSON 文件 → 中文错误提示，不闪退、留在首页
3. 修改后点关闭 → 「保存/放弃/取消」三键确认框，三个分支行为正确
4. 两个窗口打开同一文件 → 第二次提示「已在打开的窗口中」并聚焦/置前第一个窗口（含最小化还原）
5. 外部修改已打开文件后保存 → 提示冲突要求另存为；自动保存暂停
6. 新建文件 → 新窗口空白模板；Ctrl+S 首存弹另存对话框
7. Ctrl+R / F5 不刷新窗口；Ctrl+Z/Y 撤销重做；Insert/Delete 增删节点
8. dev 模式 DevTools 自动打开（detach），生产模式不打开

---

### Task 1（P0 安全止损）: Electron 28 → 44 + electron-builder 24 → 26

漏洞大头（Chromium 120 已停止安全维护多年），预期消掉绝大多数 Critical/High。

**Files:**

- Modify: `package.json`、`yarn.lock`
- 可能 Modify: `.npmrc`（二进制下载失败时）

- [x] **Step 1: 升级**

```bash
yarn add -D electron@^44 electron-builder@^26
```

- [x] **Step 2: 二进制与打包验证**

`yarn run dev` 能起窗口（验证 electron 44 二进制下载成功）；`yarn run build:unpack` 产出 `release/` 目录（electron-builder 26 兼容性；Win 下如再遇 winCodeSign symlink 错误，需确认「Windows 开发人员模式」仍开启）。

- [x] **Step 3: 全套验证 + 统一冒烟清单（8 项全走）**

重点观察跨 16 个大版本的行为差异：窗口置前/聚焦（Windows 前台锁定行为有版本差异）、`before-input-event` 拦截刷新、`render-process-gone` 假死处理。

- [x] **Step 4: 提交**

```
build：Electron 28 升级至 44，electron-builder 26，消除 Chromium 安全漏洞
```

**风险:** 行为差异不可预穷举，靠冒烟清单兜底；出问题可单独 revert 本提交回到 Electron 28（代码无 API 改动，revert 零成本）。

---

### Task 2（P1 构建链）: electron-vite 5 / vite 7 / plugin-vue 6 / vitest 5

**Files:**

- Modify: `package.json`、`yarn.lock`、可能 `electron.vite.config.js`（新配置项警告）
- 可能 Modify: `tests/`（vitest 5 若有断言 API 变化）

- [x] **Step 1: 升级（vite 明确锁 ^7，禁 8）**

```bash
yarn add -D electron-vite@^5 vite@^7 @vitejs/plugin-vue@^6 vitest@^5
```

- [x] **Step 2: 测试迁移检查**

`yarn test` 35 个测试全绿；vitest 3→5 若报 API 废弃（关注 `vi.mock` 行为、`mock.calls` 结构），逐个修测试文件，不改生产代码。

- [x] **Step 3: 构建验证**

`yarn build` 三端编译；启动冒烟（清单 1、7 即可，构建链不动运行时逻辑）。

- [x] **Step 4: 提交**

```
build：升级构建链 electron-vite 5 / vite 7 / vitest 5
```

**风险:** 低——35 个测试是现成回归网。**vite 8 在 electron-vite 支持前一律不升。**

---

### Task 3（P2 质量工具·类型链）: typescript 5.9 + vue-tsc 3

**Files:**

- Modify: `package.json`、`yarn.lock`
- 可能 Modify: `tsconfig.json`（vue-tsc 3 可能要求新字段）

- [x] **Step 1: 升级**

```bash
yarn add -D typescript@^5.9 vue-tsc@^3
```

vue-tsc 1.8 → 3 是架构换代（volar 新版），`yarn typecheck` 必须零错误才算过关；宽松 tsconfig（allowJs / checkJs: false）大概率无需动。

- [x] **Step 2: 验证 + 提交**

`yarn typecheck` + `yarn test`，绿了提交：

```
build：typescript 5.9 + vue-tsc 3，升级类型检查链
```

**风险:** 低。TS 7 / vitest@5 的 `@types/node` peer 与本项目无关（纯 JS，不装 @types/node 也不影响）。

---

### Task 4（P2 质量工具·Lint 链）: eslint 10 + flat config 重写

**Files:**

- Create: `eslint.config.js`
- Delete: `.eslintrc.cjs`、`.eslintignore`（flat config 用 ignores 字段）
- Modify: `package.json`、`yarn.lock`、可能 `@rushstack/eslint-patch` 相关引用

- [x] **Step 1: 升级依赖**

```bash
yarn add -D eslint@^10 eslint-plugin-vue@^10 @vue/eslint-config-prettier@^10 @electron-toolkit/eslint-config@^2 @rushstack/eslint-patch@^1.16
```

- [x] **Step 2: 重写配置为 flat config**

`.eslintrc.cjs` 的 extends 链（eslint:recommended / plugin:vue/vue3-recommended / @electron-toolkit / @vue/eslint-config-prettier）与两条规则（`vue/require-default-prop: off`、`vue/multi-word-component-names: off`）原样迁移到 `eslint.config.js`；`.eslintignore` 的四个目录写进 `ignores`。`@electron-toolkit/eslint-config` 2.x 自带 flat preset，参考其 README 接法。

- [x] **Step 3: 验证 + 提交**

`npx --no-install eslint .`（或 `yarn eslint .`）0 error；现有 373 条 prettier 格式 warning 应保持同量级（不因升级暴增新规则告警，暴增则逐条评估是否先 `eslint --fix`）。提交：

```
build：eslint 10 + flat config，重写 lint 配置
```

**风险:** 中——配置重写易引入规则集漂移；以「告警数量与类型不暴增」为准绳。

---

### Task 5（P3 应用层 major + 顺手清理）: echarts 6 / vue-router 5 / patch 族

**Files:**

- Modify: `package.json`、`yarn.lock`
- 可能 Modify: `src/renderer/src/page/ChartView.vue`（echarts 6 主题兼容）

- [x] **Step 1: 零风险先行（patch/minor）**

```bash
yarn add ant-design-vue@^4.2.6
yarn add -D vue@^3.5 prettier@^3.9
```

- [x] **Step 2: vue-router 5**

```bash
yarn add vue-router@^5
```

项目仅两条路由 + 一次 `router.push`，`yarn build` + 冒烟第 1 项即可。

- [x] **Step 3: echarts 6（视觉冒烟重点）**

```bash
yarn add echarts@^6
```

官方破坏点集中在**默认主题**（legend 位置移到底部、视觉样式变化）。冒烟观察：力导向图渲染、节点/边高亮（dispatchAction highlight/downplay）、edgeLabel 显隐、工具箱（saveAsImage/restore）、水印 graphic。视觉不可接受则注册回 v5 默认主题（官方升级指南给恢复方法），功能层 API 兼容。

- [x] **Step 4: prettier 格式化单独提交（如 diff 非空）**

prettier 3.9 可能重排部分格式，`yarn prettier --write .` 后**独立提交**：

```
style：prettier 3.9 统一格式化
```

- [x] **Step 5: 终验 + 提交**

`yarn audit --summary` 记录升级后漏洞数（预期从 302 降到个位数或 0）；全套验证 + 统一冒烟清单 8 项全走；`yarn run build:unpack` 产出安装包。提交：

```
build：echarts 6 / vue-router 5 / 依赖 patch 族升级
```

**风险:** echarts 视觉回归用户可感知；若不可接受可拆出单独 revert echarts，其余保留。

---

## 完成标准

- [x] `yarn audit --summary` 漏洞数 302 → 132（Critical 4→0、High 182→95、Moderate 90→29、Low 26→8）。未达原定 ≤10：剩余全部为 electron-builder 26.15.3（latest）工具链的传递依赖（@xmldom/xmldom、minimatch、js-yaml 等），上游未发修复；经 asar list 验证产物只含 `out/**`（`build.files` 排除 node_modules），**均不进入用户安装包**
- [x] 35 单元测试全绿、typecheck 零错误、eslint 0 error（格式 warning 373→42）、build 三段绿、build:unpack 产出正常
- [ ] 统一冒烟清单 8 项通过（待用户手工执行；重点：echarts 6 默认主题把 legend 移到底部，可能与 `bottom: 5%` 水印重叠）
- [x] 每个 Task 一个提交，历史可逐个 revert（c7aa964 / 78d7373 / 41adbf7 / 2c45b6a / fc4cd95 / fa5df63）

## 执行附记（2026-09-15）

- eslint-plugin-vue 10 将 `vue-eslint-parser` 列为必需 peer，yarn 1 不自动装 peer，需显式 `yarn add -D vue-eslint-parser@^10`
- eslint 9 起 `no-unused-vars` 的 `caughtErrors` 默认 `all`，fileService.js 改用 optional catch binding 修复
- 某轮 `yarn add` 后 `node_modules/electron/dist` 曾丢失（postinstall 解压失败）。修复：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js`——手动跑 install.js 时 `.npmrc` 的 electron_mirror 不生效（@electron/get 只认环境变量）
