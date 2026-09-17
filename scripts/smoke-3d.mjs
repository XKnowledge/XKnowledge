// 冒烟驱动：生产构建启动应用，双击首页示例卡进入图表页，采样点击 canvas
// 验证 3D 渲染与点击高亮（增量重着色路径），收集渲染进程错误。
// 用法：node scripts/smoke-3d.mjs   （需先 yarn build）
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

// 1. 首页：等待示例卡出现（示例列表经 IPC 异步加载，首卡为"新建空白"空框）
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await shot('01-home')

// 2. 双击第一张示例卡 → 同窗口跳转图表页
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
// WebGL 失败提示条不应出现
await page.waitForTimeout(3_000) // 等布局稳定 + 首次 zoomToFit 完成
await shot('02-chart')
const fallbackCount = await page.locator('.graph3d-fallback').count()
console.log('webgl-fallback:', fallbackCount === 0 ? 'absent (ok)' : 'PRESENT (FAIL)')

// 3. 采样点击画布中心区域，命中节点后侧栏表单出现且高亮生效
const canvasBox = await page.locator('.graph3d-container').boundingBox()
const probes = []
if (canvasBox) {
  const cx = canvasBox.x + canvasBox.width / 2
  const cy = canvasBox.y + canvasBox.height / 2
  for (const [dx, dy] of [
    [0, 0],
    [-70, 0],
    [70, 0],
    [0, -70],
    [0, 70]
  ]) {
    probes.push([cx + dx, cy + dy])
  }
}
let hit = false
for (const [x, y] of probes) {
  await page.mouse.click(x, y)
  await page.waitForTimeout(400)
  const siderOn = await page.evaluate(() => {
    const s = document.querySelector('.sider-style')
    return !!s && getComputedStyle(s).display !== 'none'
  })
  if (siderOn) {
    hit = true
    break
  }
}
console.log('node-click-sidebar:', hit ? 'opened (ok)' : 'NOT OPENED (FAIL)')
await shot('03-highlight')

// 4. 再点一次同位置（切换/取消高亮），不应报错
if (hit) await page.mouse.click(probes[0][0], probes[0][1])
await page.waitForTimeout(400)
await shot('04-after-second-click')

console.log('renderer-errors:', errors.length === 0 ? 'none (ok)' : JSON.stringify(errors, null, 2))
await app.close()

const ok = fallbackCount === 0 && hit && errors.length === 0
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
