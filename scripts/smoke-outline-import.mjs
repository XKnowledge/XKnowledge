// 冒烟驱动：菜单「从大纲导入...」全链路——hover 展开左上角菜单 → 点菜单项开出
// Modal → 粘贴混合大纲（双一级标题 + 二级标题 + 段落
// 描述 + [[双链]] 引已有名）→ 实时预览统计「5 个节点、5 条连接」（[[代数]] 不
// 重复建点；数学-物理 边来自解析器根链语义：相邻一级标题依次连成链）→ 导入后
// data-node/link-count 与图例类目断言 → Ctrl+Z 一步撤销整批回落 0/0 → 撤销后
// 同内容再导入正常成功（无「没有可导入的内容」提示）→ 第三次导入命中同名全跳
// 过、message.info 提示出现。覆盖 outlineParser 纯函数 + onOutlineImport 追加
// 合并 + importOutline 历史在真实渲染链路上的行为。
// 用法：node scripts/smoke-outline-import.mjs   （需先 npm run build；
//       应用不能在运行——单实例锁会让新实例启动即退出）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 专属截图目录（可用 SMOKESHOT_DIR 覆盖）：.smoke-shots 被多脚本共用且清场，
// 并行跑会互相删图
const SHOT_DIR = process.env.SMOKESHOT_DIR
  ? path.resolve(APP_DIR, process.env.SMOKESHOT_DIR)
  : path.join(APP_DIR, '.smoke-shots-outline-import')
fs.rmSync(SHOT_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })

const electronBin = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!fs.existsSync(electronBin)) {
  console.error('FATAL: electron binary not found at', electronBin)
  process.exit(1)
}

const errors = []
let failures = 0
let app
try {
  app = await electron.launch({
    executablePath: electronBin,
    args: [APP_DIR],
    timeout: 30_000
  })
} catch (err) {
  // 应用带单实例锁：已有 XKnowledge 实例在跑时新实例直接退出（exitCode 0），
  // 表现为 launch 即 "browser has been closed"
  console.error('FATAL: 应用启动即退出——请先关闭正在运行的 XKnowledge（含 yarn dev）再跑冒烟')
  console.error(err.message.split('\n')[0])
  process.exit(1)
}
const page = await app.firstWindow()
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
})

const shot = async (name) => {
  const f = path.join(SHOT_DIR, `${name}.png`)
  await page.screenshot({ path: f })
  console.log(`shot: ${name}`)
}
const expectEq = (label, actual, expected) => {
  const pass = actual === expected
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: ${actual}${pass ? '' : `（期望 ${expected}）`}`)
  if (!pass) failures++
}
const expectTrue = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
  if (!cond) failures++
}

const wrap = page.locator('.graph3d-wrap')
/** 轮询等 .graph3d-wrap 的计数属性到达期望值（导入经 reactive watch 重灌，异步） */
const awaitCountAttr = async (attr, expected, timeout = 5_000) => {
  try {
    await page.waitForFunction(
      ([a, v]) => document.querySelector('.graph3d-wrap')?.getAttribute(a) === v,
      [attr, expected],
      { timeout }
    )
  } catch {
    /* 超时由调用方断言兜底 */
  }
  return wrap.getAttribute(attr)
}
/** 轮询等 locator 数量到达期望值（图例条目等随图重灌出现） */
const awaitLocatorCount = async (locator, expected, timeout = 5_000) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if ((await locator.count()) === expected) return true
    await page.waitForTimeout(100)
  }
  return (await locator.count()) === expected
}

const OUTLINE = '# 数学\n## 代数\n研究数量与结构\n## 几何\n# 物理\n## 量子力学\n与 [[代数]] 相关'
const NO_CONTENT_TEXT = '没有可导入的内容'
const noContentNotices = page.locator('.ant-message-notice', { hasText: NO_CONTENT_TEXT })
// Modal 锚点：XkOutlineImport 在 a-modal 上写的 data-outline-import 属性会被
// antd Modal 连同 Portal 包装整层吞掉、不落到 DOM（实跑验证），改锚组件内容里
// 唯一的 .xk-outline-hint；关闭后 antd 仍挂载（wrap display:none），isVisible
// 如实反映开关态
const modal = page.locator('.ant-modal-content').filter({ has: page.locator('.xk-outline-hint') })

/** hover 菜单触发器（Windows 平台 trigger=hover）→ 等 dropdown 展开 → 点
 *  「从大纲导入...」→ 等 Modal 出现。antd 关闭后 dropdown 仍挂载（带
 *  ant-dropdown-hidden），须锁定非隐藏实例再取菜单项 */
const openOutlineImport = async () => {
  await page.locator('a.no-move').hover()
  const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
  await menu.waitFor({ state: 'visible', timeout: 5_000 })
  await menu.locator('.ant-dropdown-menu-item', { hasText: '从大纲导入' }).click()
  await modal.first().waitFor({ state: 'visible', timeout: 5_000 })
}
/** 粘贴大纲并点「导入」。按钮文本匹配用 /导\s*入/：antd Button 对两字中文
 *  标签自动插空格（'导 入'），朴素子串 '导入' 匹配不到 */
const fillAndImport = async () => {
  await modal.locator('textarea').fill(OUTLINE)
  await modal.locator('.ant-btn-primary', { hasText: /导\s*入/ }).click()
}
/** 撤销快捷键前显式失焦：焦点在输入框时 Ctrl+Z 被输入框吞掉（见 user-guide §5） */
const blurActive = () => page.evaluate(() => document.activeElement?.blur?.())

// 1. 首页 → 新建空白虚线卡（单击）→ 图表页（空图）
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.new-blank-card').click()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(1_500) // 等 3D 引擎挂载与 enterChartMode 生效
expectEq('空白图节点计数', await wrap.getAttribute('data-node-count'), '0')
expectEq('空白图连接计数', await wrap.getAttribute('data-link-count'), '0')
await shot('01-blank-chart')

// 2. hover 菜单 → 「从大纲导入...」→ Modal 出现，粘贴混合大纲 → 实时统计
//    预期推演：节点=数学/代数/几何/物理/量子力学（[[代数]] 已存在不新建）；
//    边=数学-代数、数学-几何、数学-物理（根链）、物理-量子力学、量子力学-代数
await openOutlineImport()
expectTrue('大纲导入 Modal 出现', await modal.isVisible())
await modal.locator('textarea').fill(OUTLINE)
const stat = modal.locator('.xk-outline-stat')
await stat.waitFor({ state: 'visible', timeout: 3_000 })
expectEq('预览统计', (await stat.textContent()).trim(), '将导入 5 个节点、5 条连接')
await shot('02-modal-preview')

// 3. 导入 → 计数 5/5，图例出现「数学」「物理」两个类目（一级标题即类目）
await modal.locator('.ant-btn-primary', { hasText: /导\s*入/ }).click()
expectEq('导入后节点计数', await awaitCountAttr('data-node-count', '5'), '5')
expectEq('导入后连接计数', await awaitCountAttr('data-link-count', '5'), '5')
expectTrue(
  '图例出现类目「数学」',
  await awaitLocatorCount(page.locator('.graph3d-legend-item', { hasText: '数学' }), 1)
)
expectTrue(
  '图例出现类目「物理」',
  await awaitLocatorCount(page.locator('.graph3d-legend-item', { hasText: '物理' }), 1)
)
await page.waitForTimeout(400) // 等 Modal 收起动画走完，存档截图不带回弹残影
await shot('03-imported')

// 4. Ctrl+Z 一步撤销整批（importOutline 是单条历史），计数回落 0/0
await blurActive()
await page.keyboard.press('Control+z')
expectEq('Ctrl+Z 后节点计数回落', await awaitCountAttr('data-node-count', '0'), '0')
expectEq('Ctrl+Z 后连接计数回落', await awaitCountAttr('data-link-count', '0'), '0')
await shot('04-after-undo')

// 5. 撤销后同内容再导入：节点已不在，应正常成功（不出现「没有可导入的内容」）
await openOutlineImport()
await fillAndImport()
expectEq('二次导入节点计数', await awaitCountAttr('data-node-count', '5'), '5')
expectEq('二次导入连接计数', await awaitCountAttr('data-link-count', '5'), '5')
await page.waitForTimeout(1_000) // 给可能误现的 info 提示留观察窗
expectEq('二次导入无「没有可导入的内容」提示', await noContentNotices.count(), 0)
await shot('05-reimported')

// 6. 第三次同内容导入：同名全跳过且无新连接 → message.info 出现，计数不动
//    waitFor 包 catch：提示未出现时不抛错炸脚本（留 orphan Electron 进程），
//    由断言记 FAIL 走正常收尾
await openOutlineImport()
await fillAndImport()
const infoShown = await noContentNotices
  .first()
  .waitFor({ state: 'visible', timeout: 3_000 })
  .then(() => true)
  .catch(() => false)
expectTrue('重复导入出现「没有可导入的内容」提示', infoShown)
expectEq('重复导入节点计数不动', await wrap.getAttribute('data-node-count'), '5')
expectEq('重复导入连接计数不动', await wrap.getAttribute('data-link-count'), '5')
await shot('06-duplicate-info')

console.log(errors.length ? `渲染错误 ${errors.length} 条:` : '渲染无错误', errors)
// 收尾用 destroy：本流程必然留下未保存修改，app.close 会撞上原生
// 未保存确认对话框（无人应答永久挂起）
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})
process.exitCode = failures === 0 && errors.length === 0 ? 0 : 1
