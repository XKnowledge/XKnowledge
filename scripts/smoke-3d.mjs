// 冒烟驱动：生产构建启动应用，双击首页示例卡进入图表页，采样点击 canvas
// 验证 3D 渲染与点选高亮（选中态硬断言：命中节点 → data-highlight-node 与侧栏
// name 表单一致；再点同位置 toggle 取消；点空白清除。命中边时继续探测节点；
// 边↔节点互斥的视觉由单测覆盖 + 截图人工复核），收集渲染进程错误。
// 用法：node scripts/smoke-3d.mjs   （需先 yarn build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.artifacts', 'smoke-shots')
fs.rmSync(SHOT_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })

const electronBin = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!fs.existsSync(electronBin)) {
  console.error('FATAL: electron binary not found at', electronBin)
  process.exit(1)
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

// 1. 首页：等待示例卡出现（示例列表经 IPC 异步加载，首卡为"新建空白"空框）
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await shot('01-home')

// 1.1 首页不应出现页面级滚动条（html 溢出即回归：
// 曾因布局根为 inline-flex 的 a-space，基线对齐使行框高出视口 ~2px）
const pageScrollbar = await page.evaluate(
  () => window.innerWidth - document.documentElement.clientWidth
)
console.log(
  'page-scrollbar:',
  pageScrollbar === 0 ? 'absent (ok)' : `PRESENT ${pageScrollbar}px (FAIL)`
)

// 2. 双击第一张示例卡 → 同窗口跳转图表页
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
// WebGL 失败提示条不应出现
await page.waitForTimeout(3_000) // 等布局稳定 + 首次 zoomToFit 完成
await shot('02-chart')
const fallbackCount = await page.locator('.graph3d-fallback').count()
console.log('webgl-fallback:', fallbackCount === 0 ? 'absent (ok)' : 'PRESENT (FAIL)')

// 3. 采样点击画布中心区域，命中节点后硬断言：高亮锚点 === 侧栏 name 表单值
//    （图-侧栏对应，不依赖命中具体哪个节点）；probe 命中边（侧栏开但高亮
//    是边）时继续探测节点
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
let hitProbe = null
for (const [x, y] of probes) {
  await page.mouse.click(x, y)
  await page.waitForTimeout(400)
  const state = await page.evaluate(() => ({
    node: document.querySelector('.graph3d-wrap')?.dataset.highlightNode ?? '',
    edge: document.querySelector('.graph3d-wrap')?.dataset.highlightEdge ?? '',
    // 侧栏可见 form 的第一个 textarea（XkCurrentNode 的名称字段；其余
    // 面板 v-show 隐藏，offsetParent 为 null）
    name:
      [...document.querySelectorAll('form textarea')].find((el) => el.offsetParent !== null)
        ?.value ?? ''
  }))
  if (state.node) {
    hit = true
    hitProbe = [x, y]
    const match = state.node === state.name
    console.log(
      'node-highlight-sidebar-match:',
      match ? `ok (${state.node})` : `MISMATCH node=${state.node} sidebar=${state.name} (FAIL)`
    )
    if (!match) failures++
    break
  }
  if (state.edge) console.log(`probe hit edge (${state.edge}), keep probing node`)
}
console.log('node-click-highlight:', hit ? 'hit (ok)' : 'NO NODE HIT (FAIL)')
if (!hit) failures++
await shot('03-highlight')

// 4. 再点命中的那个 probe（toggle 取消），断言高亮清空
if (hitProbe) {
  await page.mouse.click(hitProbe[0], hitProbe[1])
  await page.waitForTimeout(400)
  const after = await page.evaluate(
    () => document.querySelector('.graph3d-wrap')?.dataset.highlightNode ?? ''
  )
  console.log('toggle-off:', after === '' ? 'ok' : `STILL ${after} (FAIL)`)
  if (after !== '') failures++
}
await shot('04-after-second-click')

// 5. 点画布右下角空白：取消选中——高亮清空、面板回默认属性页（不强制收起）
if (hit) {
  await page.mouse.click(canvasBox.x + canvasBox.width - 30, canvasBox.y + canvasBox.height - 30)
  await page.waitForTimeout(400)
  const blank = await page.evaluate(
    () => document.querySelector('.graph3d-wrap')?.dataset.highlightNode ?? ''
  )
  console.log('blank-click-clear:', blank === '' ? 'ok' : `STILL ${blank} (FAIL)`)
  if (blank !== '') failures++
}
await shot('05-after-blank-click')

console.log('renderer-errors:', errors.length === 0 ? 'none (ok)' : JSON.stringify(errors, null, 2))
await app.close()

const ok = fallbackCount === 0 && pageScrollbar === 0 && hit && failures === 0 && errors.length === 0
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
