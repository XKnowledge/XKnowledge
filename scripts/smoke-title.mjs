// 冒烟驱动：窗口标题显示——验证 app:title-changed 推送全链路（主进程计算 →
// setTitle 任务栏 → 推送 → 渲染端 XkTitleText 文本）。覆盖：首页默认标题、
// 进图表页未命名、file:opened 上报路径后显示文件名、空路径上报不清本窗口标题。
// 用法：node scripts/smoke-title.mjs   （需先 yarn build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.smoke-shots')
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
const titleText = () => page.locator('.xk-title-text').first().innerText()
const nativeTitle = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())
const expectEq = (label, actual, expected) => {
  const pass = actual === expected
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: ${actual}${pass ? '' : `（期望 ${expected}）`}`)
  if (!pass) failures++
}

// 1. 首页：默认标题（BasicLayout 标题条 + 原生标题一致）
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
expectEq('首页标题条', await titleText(), 'XKnowledge')
expectEq('首页原生标题', await nativeTitle(), 'XKnowledge')
await shot('01-home')

// 2. 双击示例卡同窗口进图表页：示例为副本语义（path=''）→ 未命名
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(800) // 等 enter-chart-mode 推送到达
expectEq('图表页标题条', await titleText(), '未命名 — XKnowledge')
expectEq('图表页原生标题', await nativeTitle(), '未命名 — XKnowledge')
await shot('02-chart-untitled')

// 3. 经真实上报通道 file:opened 报一个路径（等价装载/保存成功后的上报）
await page.evaluate(() => window.electronAPI.fileOpened({ path: 'C:\\冒烟\\金融.xk' }))
await page.waitForTimeout(500)
expectEq('上报路径后标题条', await titleText(), '金融 — XKnowledge')
expectEq('上报路径后原生标题', await nativeTitle(), '金融 — XKnowledge')
await shot('03-chart-filename')

// 4. 空路径上报只清登记、不动本窗口标题（「关闭文件」由 exit-chart-mode 恢复默认，
//    此处不触发路由跳转，标题应保持文件名）
await page.evaluate(() => window.electronAPI.fileOpened({ path: '' }))
await page.waitForTimeout(500)
expectEq('空路径上报后标题条', await titleText(), '金融 — XKnowledge')

// 5. 位置：标题紧挨菜单图标（53px sider + 12px 间距），不与居中的按钮组重叠
const titleBox = await page.locator('.chart-title').boundingBox()
const nearMenu = titleBox && titleBox.x < 250
console.log(`${nearMenu ? 'PASS' : 'FAIL'} 标题紧邻菜单图标: x=${titleBox?.x}`)
if (!nearMenu) failures++

// 6. 按钮组容器从菜单右侧起（x≈53），证明标题绝对定位未挤偏其居中
const toolbarBox = await page.locator('.move-header').boundingBox()
const toolbarIntact = toolbarBox && Math.abs(toolbarBox.x - 53) < 5
console.log(
  `${toolbarIntact ? 'PASS' : 'FAIL'} 按钮组容器未被挤偏: x=${toolbarBox?.x}（应≈53）`
)
if (!toolbarIntact) failures++

console.log(errors.length ? `渲染错误 ${errors.length} 条:` : '渲染无错误', errors)
await app.close()
process.exitCode = failures === 0 && errors.length === 0 ? 0 : 1
