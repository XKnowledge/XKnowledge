// 冒烟驱动：世界树·视图面板·聚焦模式（三态：关闭/灰化/隐藏）——覆盖：
// 开面板 → 切「灰化」（自动聚焦默认焦点=度数最高超节点，data-focus-node 非空）
// → 跳数切换（焦点保持）→ 切「隐藏」（data-focus-mode=deep、焦点保持）→
// 切回「关闭」（焦点清空、跳数禁用）→ 聚焦+Ctrl+F 搜索自动展开 →
// 隐藏+全部收拢（模式保持）→ 刷新（模式/排斥力保持）→ 主题切换 → 画布点击换焦点
// （3D 命中不确定：命中则焦点变化，未命中只验证不报错）→ 排斥力调节。
// 视觉灰化/隐藏/取景以截图人工复核，不逐像素断言（同 smoke-focus 惯例）。
// 用法：node scripts/smoke-world-focus.mjs   （需先 yarn build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = process.env.SMOKESHOT_DIR
  ? path.resolve(APP_DIR, process.env.SMOKESHOT_DIR)
  : path.join(APP_DIR, '.smoke-shots-world-focus')
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
  app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], timeout: 30_000 })
} catch (err) {
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
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) })
  console.log(`shot: ${name}`)
}
const expectEq = (label, actual, expected) => {
  const pass = actual === expected
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: ${actual}${pass ? '' : `（期望 ${expected}）`}`)
  if (!pass) failures++
}
const expectOk = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : `：${detail}`}`)
  if (!ok) failures++
}
const panel = page.locator('.world-view-panel')
const focusNode = async () => (await panel.getAttribute('data-focus-node')) ?? ''
const focusMode = async () => (await panel.getAttribute('data-focus-mode')) ?? ''
/** 图实例已应用的 charge 强度（XkWorldGraph 挂载点 data-charge-strength 锚点） */
const chargeStrength = async () =>
  (await page.locator('.world-graph-wrap').getAttribute('data-charge-strength')) ?? ''

// antdv 关闭的下拉仍挂载在 DOM（ant-select-dropdown-hidden），只点当前展开的
const dropdownOption = (title) =>
  page.locator(
    `.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="${title}"]`
  )

// 场景 1：进入世界页，开视图面板
await page.locator('#openWorld').click()
await page.waitForSelector('.world-graph-container canvas', { timeout: 60_000 })
await page.waitForTimeout(4_000) // 力布局铺开
await shot('01-world-overview')

// 面板收起态只有一个按钮（antdv 对两字按钮自动插空格「视 图」，不能按文本匹配）
await page.locator('.world-view-panel > button').click()
await page.waitForSelector('.world-view-panel-body', { timeout: 5_000 })
expectEq('开启前模式为关闭', await focusMode(), 'off')
expectEq('开启前焦点为空', await focusNode(), '')
expectOk(
  '开启前跳数下拉禁用',
  (await page.locator('.world-view-hops.ant-select-disabled').count()) === 1
)
await shot('02-panel-open')

// 场景 2：切「灰化」→ 自动聚焦默认焦点（度数最高超节点）
await page.locator('.world-view-select').click()
await dropdownOption('灰化').click()
await page.waitForTimeout(1_000) // 等取景动画（600ms）+ 材质重建
const hub = await focusNode()
expectEq('灰化模式锚点', await focusMode(), 'focus')
expectOk('自动聚焦默认焦点非空', hub.length > 0, `焦点=${hub}`)
expectOk(
  '灰化后跳数下拉可用',
  (await page.locator('.world-view-hops.ant-select-disabled').count()) === 0
)
expectEq(
  '跳数默认 1',
  await page.locator('.world-view-hops .ant-select-selection-item').textContent(),
  '1'
)
await shot('03-world-focus-on')

// 场景 3：跳数 1 → 2（焦点保持）
await page.locator('.world-view-hops').click()
await dropdownOption('2').click()
await page.waitForTimeout(800)
expectEq(
  '跳数切换为 2',
  await page.locator('.world-view-hops .ant-select-selection-item').textContent(),
  '2'
)
expectEq('跳数切换焦点保持', await focusNode(), hub)
await shot('04-world-hops-2')

// 场景 4：切「隐藏」（deep，焦点保持）
await page.locator('.world-view-select').click()
await dropdownOption('隐藏').click()
await page.waitForTimeout(800)
expectEq('隐藏模式锚点', await focusMode(), 'deep')
expectEq('隐藏焦点保持', await focusNode(), hub)
await shot('05-world-deep-on')

// 场景 5：切回「关闭」→ 恢复（焦点清空、跳数禁用）
await page.locator('.world-view-select').click()
await dropdownOption('关闭').click()
await page.waitForTimeout(800)
expectEq('关闭后模式锚点', await focusMode(), 'off')
expectEq('关闭后焦点清空', await focusNode(), '')
expectOk(
  '关闭后跳数下拉禁用',
  (await page.locator('.world-view-hops.ant-select-disabled').count()) === 1
)
await shot('06-world-focus-off')

// 场景 6：排斥力滑杆（200 → charge -20；锚点断言 + 截图）
await page.locator('.world-view-number input').fill('200')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
expectEq('排斥力 200 应用到 charge', await chargeStrength(), '-20')
await shot('07-world-repulsion')

// 场景 7：聚焦（灰化）+ Ctrl+F 搜索 → 回车跳转自动展开（聚焦中场景变化）
await page.locator('.world-view-select').click()
await dropdownOption('灰化').click()
await page.waitForTimeout(800)
await page.keyboard.press('Control+f')
await page.waitForSelector('.world-search')
await page.locator('.world-search-input').fill('化学')
await page.waitForTimeout(500)
await page.keyboard.press('Enter')
await page.waitForSelector('.world-expanded-bar', { timeout: 20_000 })
await page.waitForTimeout(1_500)
await shot('08-world-focus-search-expand')
expectEq('搜索展开后仍处灰化模式', await focusMode(), 'focus')

// 场景 8：聚焦 + 深度隐藏下收拢全部（焦点随场景消失回退默认焦点，模式保持）
await page.locator('.world-search-close').click() // 搜索覆盖层会拦截点击，先关闭
await page.waitForTimeout(300)
await page.locator('.world-view-select').click()
await dropdownOption('隐藏').click()
await page.waitForTimeout(800)
await page.locator('.world-expanded-bar button').last().click() // 全部收拢（4 字无插空格）
await page.waitForTimeout(1_500)
expectEq('收拢后仍处隐藏模式', await focusMode(), 'deep')
expectOk('收拢后焦点回退非空', (await focusNode()).length > 0, `焦点=${await focusNode()}`)
await shot('09-world-deep-collapse-all')

// 场景 9：聚焦开启时刷新世界索引（模式保持、焦点回退、排斥力经 prop 回灌重挂实例）
// 两字按钮 antdv 自动插空格（「刷 新」），hasText 匹配不可靠，按顺序取第 2 个
await page.locator('.world-header button').nth(1).click()
await page.waitForTimeout(3_000)
expectEq('刷新后仍处隐藏模式', await focusMode(), 'deep')
expectOk('刷新后焦点回退非空', (await focusNode()).length > 0, `焦点=${await focusNode()}`)
expectEq('刷新后排斥力保持（重挂回灌 charge）', await chargeStrength(), '-20')
expectEq('刷新后滑杆值保持', await page.locator('.world-view-number input').inputValue(), '200')
await shot('10-world-deep-refresh')

// 场景 10：聚焦开启时切主题（storage 事件同窗口手动派发触发 themeStore 联动）
await page.evaluate(() => {
  localStorage.setItem('xk-theme-mode', 'dark')
  window.dispatchEvent(new StorageEvent('storage', { key: 'xk-theme-mode', newValue: 'dark' }))
})
await page.waitForTimeout(800)
expectEq('主题切换后模式保持', await focusMode(), 'deep')
await shot('11-world-focus-theme-toggle')
await page.evaluate(() => {
  localStorage.setItem('xk-theme-mode', 'light')
  window.dispatchEvent(new StorageEvent('storage', { key: 'xk-theme-mode', newValue: 'light' }))
})
await page.waitForTimeout(500)

// 场景 11：聚焦开启时画布单击换焦点——相机取景后焦点枢纽位于画布中心附近，
// 点击正中心大概率命中节点；命中则 data-focus-node 变化（软断言：打印实况）
const beforeClick = await focusNode()
const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
await page
  .locator('.world-graph-container')
  .click({ position: { x: Math.round(viewport.width / 2), y: Math.round(viewport.height / 2) } })
await page.waitForTimeout(600)
const afterClick = await focusNode()
console.log(
  `observe: 画布中心点击 焦点 ${beforeClick === afterClick ? '未变（未命中节点，可接受）' : `已切换 → ${afterClick}`}`
)
await shot('12-world-focus-canvas-click')

expectOk('无页面错误', errors.length === 0, errors.join(' | '))
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})

const ok = failures === 0 && errors.length === 0
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
