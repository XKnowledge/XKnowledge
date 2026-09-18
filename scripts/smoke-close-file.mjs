// 冒烟驱动：图表页菜单「关闭文件」——无修改路径直接返回首页，且窗口从
// 调大状态对称恢复默认 900x670 并重新锁定。收集渲染进程错误。
// （未保存三选一确认为原生模态对话框，无法自动化，需人工验证。）
// 用法：node scripts/smoke-close-file.mjs   （需先 yarn build）
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

// 主进程侧读写窗口状态（尺寸/可调性）
const winState = () =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return { size: w.getSize(), resizable: w.isResizable(), maximizable: w.isMaximizable() }
  })

// 1. 首页 → 双击示例卡同窗口进入图表页
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(1_500) // 等 enterChartMode 生效（解锁尺寸）
await shot('01-chart')

// 2. 模拟用户在图表页调大窗口（图表模式已解锁），再读回确认
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0].setSize(1200, 800)
})
await page.waitForTimeout(500)
const enlarged = await winState()
console.log('enlarged:', JSON.stringify(enlarged))

// 3. 悬停左上角菜单触发器 → 点「关闭文件」
await page.locator('a.no-move').hover()
await page.waitForTimeout(500) // 等 dropdown 浮层展开
await page.getByText('关闭文件', { exact: true }).click()

// 4. 应回到首页（示例卡重新出现），窗口对称恢复默认尺寸并锁定
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.waitForTimeout(1_000) // 等 exitChartMode 的恢复调用落地
await shot('02-back-home')
const restored = await winState()
console.log('restored:', JSON.stringify(restored))

// DPI 缩放下 getSize 有 ±2px 量化偏移（放大设 1200x800 读回 1201x801 同理），容差判断
const sizeOk = Math.abs(restored.size[0] - 900) <= 2 && Math.abs(restored.size[1] - 670) <= 2
const lockedOk = restored.resizable === false && restored.maximizable === false
console.log('window-restored:', sizeOk && lockedOk ? 'ok' : 'FAIL')
console.log('renderer-errors:', errors.length === 0 ? 'none (ok)' : JSON.stringify(errors, null, 2))
await app.close()

const ok = sizeOk && lockedOk && errors.length === 0 && enlarged.resizable === true
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
