// 冒烟驱动：生产构建启动应用，双击「世界树」示例卡（208 图谱 / 16k 节点
// / 23k 边的全量合并图），验证大图打开不卡死：
//   - 双击 → 图表页容器出现的耗时（主线程阻塞时长）
//   - 注入 rAF 帧率探针，统计打开后每秒帧数（卡死 = rAF 长期停跳）
//   - evaluate 往返延迟（主线程被长任务占死时 evaluate 会超时）
//   - 渲染进程无 pageerror / console.error
// 用法：node scripts/smoke-world-tree.mjs   （需先 yarn build）
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

// 1. 首页等待示例卡加载完成（世界树卡在列表内，IPC 异步装载）
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
const worldCard = page.locator('.xk-example-card', { hasText: '世界树' }).first()
await worldCard.waitFor({ state: 'visible', timeout: 10_000 })
console.log('world-tree-card: found (ok)')

// 2. 注入帧率探针后再双击：每秒一个 rAF 计数，供事后逐秒帧率
await page.evaluate(() => {
  window.__fps = []
  let count = 0
  let last = performance.now()
  const tick = () => {
    count++
    const now = performance.now()
    if (now - last >= 1000) {
      window.__fps.push(count)
      count = 0
      last = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

const tOpen = Date.now()
await worldCard.dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 30_000 })
console.log(`chart-page-open: ${(Date.now() - tOpen)}ms after dblclick`)

// 3. 打开后再观察 25s：覆盖装载、标签构建与力模拟冷却期
await page.waitForTimeout(25_000)
await shot('01-world-tree')

// 4. 主线程响应性：evaluate 往返应明显快于 2s（卡死时会被长任务压住）
const tEval = Date.now()
await page.evaluate(() => document.querySelectorAll('.graph3d-legend-item').length)
const evalMs = Date.now() - tEval
console.log(`evaluate-roundtrip: ${evalMs}ms`)

// 5. 帧率统计：剔除首个不完整秒，取最近 10 秒均值与最小值
const fps = await page.evaluate(() => ({ log: window.__fps }))
const log = fps.log ?? []
const recent = log.slice(-10)
const avg = recent.reduce((a, b) => a + b, 0) / (recent.length || 1)
const min = Math.min(...(recent.length ? recent : [0]))
console.log(`fps recent-10s: avg ${avg.toFixed(1)}, min ${min} (log: ${log.join(',')})`)

// 6. 类目图例交互冒烟：点击一个类目切换显隐（linkVisibility Map 路径）
const legendCount = await page.evaluate(() => document.querySelectorAll('.graph3d-legend-item').length)
console.log(`legend-items: ${legendCount}`)
if (legendCount > 0) {
  const tToggle = Date.now()
  await page.locator('.graph3d-legend-item').first().click()
  await page.waitForTimeout(1_500)
  console.log(`legend-toggle: ${Date.now() - tToggle}ms (含1.5s等待)`)
  await shot('02-after-legend-toggle')
  await page.locator('.graph3d-legend-item').first().click()
}

console.log('renderer-errors:', errors.length === 0 ? 'none (ok)' : JSON.stringify(errors, null, 2))
await app.close()

const ok =
  errors.length === 0 && evalMs < 2000 && avg >= 3 && min >= 1 && legendCount > 0
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
