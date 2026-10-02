// 冒烟驱动：国际化（中英双语）全链路。首页开设置 → 断言语言行（三态
// radio：跟随系统/中文/English）→ 切 English：localStorage xk-locale 落库
// 硬断言 + 首页侧栏按钮（World Tree/Settings/Open Local File）变英文 →
// 刷新后仍英文（持久化）→ 双击示例卡进图表页：工具栏按钮 Delete Node
// 英文（buttonList computed 跟随）→ localStorage 切回 auto + 刷新：
// 图表页恢复中文（i18n 初始化路径读同一 key）+ antd locale 跟随
// （Modal 默认文案不在本链路单独断言，ConfigProvider 绑定已由 typecheck
// 与渲染无错兜底）。
// 用法：node scripts/smoke-i18n.mjs   （需先 npm run build；
//       应用不能在运行——单实例锁会让新实例启动即退出）
import { _electron as electron } from 'playwright-core'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = process.env.SMOKESHOT_DIR
  ? path.resolve(APP_DIR, process.env.SMOKESHOT_DIR)
  : path.join(APP_DIR, '.smoke-shots-i18n')
const fs = await import('node:fs')
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
const storedLocale = () => page.evaluate(() => localStorage.getItem('xk-locale'))

try {
  // 1. 首页就绪（中文系统默认跟随系统 → 中文）。localStorage 首次为
  // null；上次冒烟收尾显式写过 'auto'（跨启动持久化）也属跟随系统形态
  await page.waitForSelector('#openSettings', { timeout: 15_000 })
  const initialStored = await storedLocale()
  expectTrue(
    '初始 localStorage（跟随系统形态）',
    initialStored === null || initialStored === 'auto',
    String(initialStored)
  )
  expectEq('初始首页按钮（中文）', await page.locator('#openWorld').innerText(), '世界树')

  // 2. 开设置：语言行存在 + 三态 radio 文本（语言名各自原文）
  await page.locator('#openSettings').click()
  await page.locator('[data-locale-row]').waitFor({ state: 'visible', timeout: 5_000 })
  await page.waitForTimeout(300) // 弹窗入场动画
  const radioTexts = await page
    .locator('[data-locale-row] .ant-radio-button-wrapper')
    .allInnerTexts()
  expectTrue(
    '语言行三态 radio 文本',
    radioTexts.join('|') === '跟随系统|中文|English',
    radioTexts.join('|')
  )
  await shot('01-settings-locale-row')

  // 3. 切 English：localStorage 落库 + 弹窗标题即时变英文
  await page.locator('[data-locale-row] .ant-radio-button-wrapper', { hasText: 'English' }).click()
  await page.waitForTimeout(300)
  expectEq('切 English 后 localStorage', await storedLocale(), 'en-US')
  expectEq('弹窗标题即时英文', await page.locator('.ant-modal-title').innerText(), 'Settings')
  await shot('02-settings-en')

  // 4. 关弹窗：首页侧栏按钮变英文
  await page.locator('.ant-modal-close').click()
  await page.locator('.ant-modal').waitFor({ state: 'hidden', timeout: 5_000 })
  expectEq('首页 世界树→World Tree', await page.locator('#openWorld').innerText(), 'World Tree')
  expectEq('首页 设置→Settings', await page.locator('#openSettings').innerText(), 'Settings')
  expectEq(
    '首页 打开本地文件→Open Local File',
    await page.locator('#uploadFile').innerText(),
    'Open Local File'
  )
  await shot('03-home-en')

  // 5. 刷新：持久化生效（i18n 初始化路径读 localStorage）
  await page.reload()
  await page.waitForSelector('#openSettings', { timeout: 15_000 })
  expectEq('刷新后仍英文', await page.locator('#openWorld').innerText(), 'World Tree')
  expectEq('刷新后 localStorage', await storedLocale(), 'en-US')

  // 6. 打开示例图：工具栏按钮英文（buttonList computed 跟随）
  await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
  await page.locator('.xk-example-card').first().dblclick()
  await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
  await page.waitForTimeout(800) // 等装载
  const toolbarLabels = await page
    .locator('.move-header div[style*="text-align: center"]')
    .allInnerTexts()
  expectTrue(
    '图表页工具栏英文（Delete Node 在列）',
    toolbarLabels.some((x) => x.includes('Delete Node')),
    toolbarLabels.join('|')
  )
  await shot('04-chart-en')

  // 7. 切回跟随系统（中文系统 → 恢复中文）：i18n 初始化读同一 key
  await page.evaluate(() => localStorage.setItem('xk-locale', 'auto'))
  await page.reload()
  await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
  await page.waitForTimeout(800)
  const toolbarLabelsZh = await page
    .locator('.move-header div[style*="text-align: center"]')
    .allInnerTexts()
  expectTrue(
    '切回 auto 恢复中文（删除节点在列）',
    toolbarLabelsZh.some((x) => x.includes('删除节点')),
    toolbarLabelsZh.join('|')
  )
  expectEq('auto 落库', await storedLocale(), 'auto')
  await shot('05-chart-zh')
} catch (err) {
  failures++
  console.error('FATAL: 冒烟执行异常——', err.message)
} finally {
  if (errors.length) {
    console.error('渲染错误：')
    errors.forEach((e) => console.error(' ', e))
    failures += errors.length
  } else {
    console.log('渲染无错误 []')
  }
  await app.close().catch(() => {})
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
