评估完成。信息全齐，以下是完整评估报告：

---
依赖升级评估报告（2026-09）

现状

- 安全：yarn audit 报 302 个漏洞（4 Critical / 182 High / 90 Moderate / 26 Low），重灾区是 Electron 28（Chromium 120，2024 年初，早已停止安全维护）和 vite 5 的传递依赖链
- 版本差距：16 个直接依赖中有 13 个落后 latest 一个大版本以上，最远的是 Electron 28 → 44（跨 16 个大版本）

关键兼容性发现（决定升级路线的硬约束）

┌────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────┐
│                        约束                        │                                 影响                                  │
├────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ electron-vite@5 的 peer 只接受 vite ^5 || ^6 || ^7 │ vite 上限锁在 7，不能上 vite 8（支持 8 的 electron-vite 6 还在 beta） │
├────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ vitest@5 要求 vite ^6.4+                           │ 与 vite 7 兼容 ✓                                                      │
├────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ vue-tsc@3.3 要求 typescript >=5.0                  │ 可配 TS 5.9；TS 7（tsgo）太激进，观望                                 │
├────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ node v24.13.0（本机）                              │ 满足全部要求 ✓                                                        │
├────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ Electron 23 起仅支持 Win10+                        │ 你是 Win11 ✓                                                          │
└────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────┘

分期建议（按收益/风险排序）

P0 安全止损 —— 消掉绝大部分 Critical/High
- electron 28 → 44、electron-builder 24 → 26
- 项目主进程 API 面（BrowserWindow / ipcMain.handle / dialog / contextBridge / before-input-event / render-process-gone）全是长期稳定 API，跨版本理论破坏点少，但必须全量手工冒烟

P1 构建链整备
- electron-vite 2 → 5、vite 5 → 7、@vitejs/plugin-vue 5 → 6、vitest 3 → 5
- 35 个单元测试是现成的回归网，vitest 5 迁移成本低

P2 质量工具
- typescript 5.4 → 5.9 + vue-tsc 1.8 → 3.3（typecheck 链整体换代）
- eslint 8 → 10：须把 .eslintrc.cjs 重写为 flat config（eslint.config.js），配套 @electron-toolkit/eslint-config 2、eslint-plugin-vue 10、@vue/eslint-config-prettier 10

P3 应用层 major（可延后）
- echarts 5.6 → 6.1：官方破坏点主要是默认主题变化（legend 移到底部等），graph force API 兼容，需视觉冒烟
- vue-router 4 → 5：项目只有两条路由，风险很小
- 顺手零风险：ant-design-vue 4.2.6（patch）、vue 3.5、prettier 3.9

实操风险点
- electron-vite 2 → 5、vite 5 → 7、@vitejs/plugin-vue 5 → 6、vitest 3 → 5
- 35 个单元测试是现成的回归网，vitest 5 迁移成本低

P2 质量工具
- typescript 5.4 → 5.9 + vue-tsc 1.8 → 3.3（typecheck 链整体换代）
- eslint 8 → 10：须把 .eslintrc.cjs 重写为 flat config（eslint.config.js），配套 @electron-toolkit/eslint-config 2、eslint-plugin-vue 10、@vue/eslint-config-prettier 10

P3 应用层 major（可延后）
- echarts 5.6 → 6.1：官方破坏点主要是默认主题变化（legend 移到底部等），graph force API 兼容，需视觉冒烟
- vue-router 4 → 5：项目只有两条路由，风险很小
- 顺手零风险：ant-design-vue 4.2.6（patch）、vue 3.5、prettier 3.9

实操风险点

1. Electron 二进制下载：.npmrc 里的 electron_mirror 配置格式已被 npm 标记警告，升到 Electron 44 后可能要修正镜像配置才能拉下二进制（国内网络）
2. prettier 3.9 可能重排部分格式 → 建议格式化单独成一个提交，不与功能混
3. 每期完成后跑全套验证（35 测试 + build 三段 + typecheck + eslint + 手工冒烟）

---
建议执行顺序：P0 → P1 → P2 → P3，每期一个独立提交，P0+P1 也可以合并做（构建链和安全止损互相不干扰但冒烟只需一轮）。

要开始的话，从 P0 动手？

Sources:
- Apache ECharts 6 Upgrade Guide
- ECharts 6 New Features