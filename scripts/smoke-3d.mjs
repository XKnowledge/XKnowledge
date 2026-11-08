// 冒烟驱动：生产构建启动应用，双击首页示例卡进入图表页，采样点击 canvas
// 验证 3D 渲染与点选高亮（选中态硬断言：命中节点 → data-highlight-node 与侧栏
// name 表单一致；再点同位置 toggle 取消；点空白保留高亮（点空白只清框选批量集）。命中边时继续探测节点；
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
/** 手势前冲刷悬停（three-render-objects 悬停轮询 50ms 节流，节点/背景点击
 *  都经悬停对象派发——裸 click 瞬移后轮询未跟上会整体落空，沿 smoke-canvas-edit
 *  惯例；旧「点空白清高亮」语义曾把探针落空自愈成换探针重来，新语义保留
 *  高亮后落空会静默保留旧值，必须 settle） */
const settleMouse = async (x, y) => {
  await page.mouse.move(x, y)
  await page.waitForTimeout(250)
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
// 2.1 新手教程防御：全新 userData 首次进图表页会自动开教程（dbdedea），
//     遮罩会拦画布探针点击——出现即点关闭（同真实用户跳过，stopTour 顺手
//     写「看过」标记）；非首次环境无教程，超时静默通过（同 smoke-autosave
//     2.1 的先例；本机跑过一次后 localStorage 有标记，教程不再弹）
try {
  await page.locator('.ant-tour-close').waitFor({ state: 'visible', timeout: 3_000 })
  await page.locator('.ant-tour-close').click()
  await page.waitForTimeout(300)
} catch {
  /* 教程未自动弹出，继续 */
}
// WebGL 失败提示条不应出现
await page.waitForTimeout(3_000) // 等布局稳定 + 首次 zoomToFit 完成
// 预开侧栏再取画布包围盒：点节点会唤起侧栏（编辑器语义）使画布变窄、
// 节点投影随相机 target 移位，同坐标第二击会落空——侧栏预开则点选不再
// 触发几何变化，probe 坐标全程稳定（§4 toggle 两击、§5 点空白都依赖之）
await page.locator('[data-toolbar-action="toggle_sider"]').click()
await page.waitForTimeout(600) // v-show 展开 + ResizeObserver + 画布几何稳定
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
  await settleMouse(x, y)
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

// 4. 再点命中的那个 probe（toggle 取消），断言高亮清空。侧栏已预开，
//    点节点不再改变画布几何，同坐标必再中同一节点
if (hitProbe) {
  await settleMouse(hitProbe[0], hitProbe[1])
  await page.mouse.click(hitProbe[0], hitProbe[1])
  await page.waitForTimeout(400)
  const after = await page.evaluate(
    () => document.querySelector('.graph3d-wrap')?.dataset.highlightNode ?? ''
  )
  console.log('toggle-off:', after === '' ? 'ok' : `STILL ${after} (FAIL)`)
  if (after !== '') failures++
}
await shot('04-after-second-click')

// 5. 点画布右下角空白：单击选中保留（点空白只清框选批量集，取消单击选中＝
//    再点该节点）。重新点亮后点空白，断言高亮仍在
if (hit) {
  await settleMouse(hitProbe[0], hitProbe[1])
  await page.mouse.click(hitProbe[0], hitProbe[1])
  await page.waitForTimeout(400)
  const relit = await page.evaluate(
    () => document.querySelector('.graph3d-wrap')?.dataset.highlightNode ?? ''
  )
  console.log('re-highlight:', relit !== '' ? `ok (${relit})` : 'NOT RELIT (FAIL)')
  if (relit === '') failures++
  await settleMouse(canvasBox.x + canvasBox.width - 30, canvasBox.y + canvasBox.height - 30)
  await page.mouse.click(canvasBox.x + canvasBox.width - 30, canvasBox.y + canvasBox.height - 30)
  await page.waitForTimeout(400)
  const blank = await page.evaluate(
    () => document.querySelector('.graph3d-wrap')?.dataset.highlightNode ?? ''
  )
  console.log('blank-click-keeps-highlight:', blank !== '' ? `ok (${blank})` : 'CLEARED (FAIL)')
  if (blank === '') failures++
}
await shot('05-after-blank-click')

console.log('renderer-errors:', errors.length === 0 ? 'none (ok)' : JSON.stringify(errors, null, 2))
await app.close()

const ok =
  fallbackCount === 0 && pageScrollbar === 0 && hit && failures === 0 && errors.length === 0
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
