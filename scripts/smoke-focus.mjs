// 冒烟驱动：编辑栏·聚焦模式（三态：关闭/灰化/隐藏）——覆盖：切「灰化」
// （自动聚焦默认焦点=度数最高节点，Node 侧按同一规则复算期望名比对
// data-focus-node）→ 跳数下拉可用与切换 → 聚焦不置脏（窗口标题无圆点）→
// 切「隐藏」（data-focus-mode=deep、焦点保持、不置脏）→ 切回「关闭」
// 恢复。画布单击换焦点是 3D 场景坐标命中，自动化不可控，以「点击不报错 +
// 软观察」处理，视觉灰化/隐藏/取景以截图人工复核，不逐像素断言。
// 用法：node scripts/smoke-focus.mjs   （需先 yarn build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.smoke-shots-focus')
fs.rmSync(SHOT_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })

const electronBin = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!fs.existsSync(electronBin)) {
  console.error('FATAL: electron binary not found at', electronBin)
  process.exit(1)
}

// 首页第一张卡与渲染端同源：listExamples 的清单（examples.manifest.json，
// prebuild 生成，故本脚本须在 build 后运行）经 sortExamples 按标题拼音
// 升序（zh-CN collation，汉字排在拉丁字母标题之前）后的首个示例。
// 排序规则若改动须两边同步
const firstExample = () => {
  const dir = path.join(APP_DIR, 'examples')
  const items = JSON.parse(
    fs.readFileSync(path.join(dir, 'examples.manifest.json'), 'utf-8')
  ).items
  if (!Array.isArray(items) || !items.length) {
    throw new Error('示例清单缺失或为空（先 npm run build 生成）')
  }
  const sorted = [...items].sort(
    (a, b) =>
      String(a.title ?? '').localeCompare(String(b.title ?? ''), 'zh-CN') ||
      String(a.fileName ?? '').localeCompare(String(b.fileName ?? ''), 'zh-CN')
  )
  const parsed = JSON.parse(fs.readFileSync(path.join(dir, sorted[0].fileName), 'utf-8'))
  return { fileName: sorted[0].fileName, nodes: parsed.nodes ?? [], links: parsed.links ?? [] }
}

// 与 src/renderer/src/utils/graphData.js 的 defaultFocusNode 同规则复算期望
// 焦点名（度数最高 → symbolSize 大 → 先出现）。规则若改动须两边同步。
const expectedFocusName = ({ nodes, links }) => {
  if (!nodes.length) return ''
  const degree = new Map()
  const bump = (name) => degree.set(name, (degree.get(name) ?? 0) + 1)
  for (const l of links) {
    bump(l.source)
    bump(l.target)
  }
  let best = nodes[0]
  let bestDeg = degree.get(best.name) ?? 0
  for (let i = 1; i < nodes.length; i++) {
    const d = degree.get(nodes[i].name) ?? 0
    if (d > bestDeg || (d === bestDeg && (nodes[i].symbolSize ?? 0) > (best.symbolSize ?? 0))) {
      best = nodes[i]
      bestDeg = d
    }
  }
  return best.name
}

const errors = []
let failures = 0
const app = await electron.launch({
  executablePath: electronBin,
  args: [APP_DIR],
  timeout: 30_000
})
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
const nativeTitle = () =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())
const expectEq = (label, actual, expected) => {
  const pass = actual === expected
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: ${actual}${pass ? '' : `（期望 ${expected}）`}`)
  if (!pass) failures++
}
const expectOk = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : `：${detail}`}`)
  if (!ok) failures++
}

const example = firstExample()
const expectedHub = expectedFocusName(example)
console.log(`首个示例: ${example.fileName}（${example.nodes.length} 节点），期望默认焦点: ${expectedHub}`)

// 1. 首页 → 双击第一张示例卡同窗口进入图表页
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(1_500) // 等 enterChartMode 生效

// 2. 点工具栏「编辑栏」按钮唤出侧边栏（属性面板默认显示）。
// 「编辑栏」文字是按钮旁 label div 不在 a-button 内，点文字无效；
// 图标 png 被 vite 内联成 data URL 无文件名可匹配，按 buttonList 顺序取末个
await page.locator('.no-move-button').last().click()
const focusRow = page.locator('.focus-row')
await focusRow.waitFor({ state: 'visible', timeout: 5_000 })

// antdv 关闭的下拉仍挂载在 DOM（ant-select-dropdown-hidden），只点当前展开的
const dropdownOption = (title) =>
  page.locator(
    `.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="${title}"]`
  )

// 3. 开启前：模式=关闭、跳数下拉禁用、data-focus-node 为空
expectEq(
  '开启前模式为关闭',
  await focusRow.locator('.focus-mode-select .ant-select-selection-item').textContent(),
  '关闭'
)
expectOk('开启前跳数下拉禁用', (await focusRow.locator('.focus-hops-select.ant-select-disabled').count()) === 1)
expectEq('开启前焦点为空', await focusRow.getAttribute('data-focus-node'), '')

// 4. 模式切「灰化」→ 自动聚焦默认焦点
await focusRow.locator('.focus-mode-select').click()
await dropdownOption('灰化').click()
await page.waitForTimeout(800) // 等取景动画（600ms）
expectEq('默认焦点=度数最高节点', await focusRow.getAttribute('data-focus-node'), expectedHub)
expectEq('模式锚点=focus', await focusRow.getAttribute('data-focus-mode'), 'focus')
expectOk('开启后跳数下拉可用', (await focusRow.locator('.focus-hops-select.ant-select-disabled').count()) === 0)
expectEq('跳数默认 2', await focusRow.locator('.focus-hops-select .ant-select-selection-item').textContent(), '2')
await shot('01-focus-on')

// 5. 聚焦不置脏：窗口标题不得出现未保存圆点
expectOk('聚焦开启不置脏（标题无圆点）', !((await nativeTitle()) ?? '').includes('•'))

// 6. 画布单击换焦点：3D 坐标命中不可控，软观察（打印实际值，不计失败）；
//    点击本身不应抛错。命中节点/边会切到对应表单、隐藏属性面板——检测到
//    隐藏就点一次工具栏「编辑栏」复原（toggleSider 从表单态回到属性页）
await page.locator('.graph3d-container').click({ position: { x: 300, y: 250 } })
await page.waitForTimeout(300)
console.log(`observe: 单击画布后焦点 = ${await focusRow.getAttribute('data-focus-node')}`)
if (!(await focusRow.isVisible())) {
  await page.locator('.no-move-button').last().click()
  await focusRow.waitFor({ state: 'visible', timeout: 5_000 })
}

// 7. 跳数 2 → 1
await focusRow.locator('.focus-hops-select').click()
await dropdownOption('1').click()
await page.waitForTimeout(500)
expectEq('跳数切换为 1', (await focusRow.locator('.focus-hops-select .ant-select-selection-item').textContent()), '1')
await shot('02-hops-1')

// 8. 切「隐藏」：邻域外由灰化改隐藏（视觉以截图人工复核），焦点保持
const focusBeforeDeep = await focusRow.getAttribute('data-focus-node')
await focusRow.locator('.focus-mode-select').click()
await dropdownOption('隐藏').click()
await page.waitForTimeout(500)
expectEq('隐藏模式锚点', await focusRow.getAttribute('data-focus-mode'), 'deep')
expectEq('隐藏焦点保持', await focusRow.getAttribute('data-focus-node'), focusBeforeDeep)
expectOk('隐藏不置脏（标题无圆点）', !((await nativeTitle()) ?? '').includes('•'))
await shot('03-deep-on')

// 9. 切回「关闭」→ 恢复
await focusRow.locator('.focus-mode-select').click()
await dropdownOption('关闭').click()
await page.waitForTimeout(600) // 等相机恢复动画（400ms）
expectEq('关闭后焦点清空', await focusRow.getAttribute('data-focus-node'), '')
expectEq('关闭后模式锚点', await focusRow.getAttribute('data-focus-mode'), 'off')
expectOk('关闭后跳数下拉禁用', (await focusRow.locator('.focus-hops-select.ant-select-disabled').count()) === 1)
await shot('04-focus-off')

console.log('renderer-errors:', errors.length === 0 ? 'none (ok)' : JSON.stringify(errors, null, 2))
// 全程未置脏、无保存：直接 destroy 收尾防 confirmUnsaved 挂起（同 chart-info 冒烟）
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})

const ok = failures === 0 && errors.length === 0
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
