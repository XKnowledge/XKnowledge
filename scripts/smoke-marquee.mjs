// 冒烟驱动：Shift+拖框选批量选中与 Delete 批量删除。打开首个示例图
// （3D打印与增材制造：35 节点/42 边，计数动态读取不写死）——全画布框选
// （节点位置不可预知，但整幅框必罩住全部可见对象）断言 data-selection-count
// === 节点+边总数、拖拽中 [data-marquee] 矩形出现/松手消失、Delete 后 0/0、
// Ctrl+Z 一步整批恢复（deleteSelection 单条历史）、空框（Shift+单击未拖）
// 与点空白清空选中、无 Shift 普通拖不出框选矩形。
// 「点空白清空」同时是单击吞没回归：手势层截断 pointerdown 后，若不一并截断
// 手势期间的 pointermove，three-render-objects 会因按键移动置 isPointerDragging
// 而其 pointerup 在 isPointerPressed=false 时提前返回不清标志——残留 stale
// 吞掉框选后的第一次普通单击（点空白不清选中、点节点不开侧栏）。
// 几何稳定性：先经「编辑栏」开侧栏再点「复位视图」zoomToFit（80px 边距），
// 全画布框只内缩 15px 必罩住全部节点；无 Shift 普通拖（会真旋转相机）放最后。
// 用法：node scripts/smoke-marquee.mjs   （需先 npm run build；
//       应用不能在运行——单实例锁会让新实例启动即退出）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = process.env.SMOKESHOT_DIR
  ? path.resolve(APP_DIR, process.env.SMOKESHOT_DIR)
  : path.join(APP_DIR, '.artifacts', 'smoke-shots-marquee')
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
  // 应用带单实例锁：已有 XKnowledge 实例在跑时新实例直接退出（exitCode 0）
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
const nodeCount = () => wrap.getAttribute('data-node-count')
const linkCount = () => wrap.getAttribute('data-link-count')
const selCount = () => wrap.getAttribute('data-selection-count')
/** 轮询等 data-selection-count 到期望值（选中经 reactive watch 异步落锚点） */
const waitSelCount = async (expected, timeout = 5_000) => {
  try {
    await page.waitForFunction(
      (want) =>
        document.querySelector('.graph3d-wrap')?.getAttribute('data-selection-count') === want,
      expected,
      { timeout }
    )
  } catch {
    /* 超时由调用方断言兜底 */
  }
  return selCount()
}
/** 手势前冲刷悬停（three-render-objects 的 click 派发用悬停轮询对象，rAF 异步
 *  50ms 节流）：先 move 到目标点，等轮询追上再落笔 */
const settleMouse = async (x, y) => {
  await page.mouse.move(x, y)
  await page.waitForTimeout(250)
}

// 1. 首页 → 双击首个示例卡 → 图表页（示例视同副本打开，可编辑）
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(3_000) // 等 3D 引擎挂载 + 布局收敛 + 装载粗取景
const N = Number(await nodeCount())
const M = Number(await linkCount())
expectTrue('示例图装载（节点 >= 2）', N >= 2, `节点 ${N}`)
expectTrue('示例图装载（连接 >= 1）', M >= 1, `连接 ${M}`)
expectEq('初始无选中', await selCount(), '0')
await shot('01-example-loaded')

// 2. 开侧栏（编辑栏按钮）→ 复位视图 zoomToFit（80px 边距）：几何从此稳定，
//    全画布框（内缩 15px）必罩住全部节点；后续 box 全部按开侧栏后重量化
await page.locator('.no-move-button').nth(2).click() // 删除节点/删除连接/编辑栏
await page.waitForTimeout(800) // ResizeObserver + 画布自适应稳定
await page.locator('button', { hasText: '复位视图' }).click()
await page.waitForTimeout(1_200) // zoomToFit 600ms 补间完成
const box = await page.locator('.graph3d-container').boundingBox()
const TR = { x: box.x + box.width - 15, y: box.y + 15 } // 右上角，避开左上图例
const BL = { x: box.x + 15, y: box.y + box.height - 15 } // 左下角，避开底部提示条

/** Shift+拖全画布框选（TR→BL 对角覆盖） */
const marqueeSelectAll = async () => {
  await settleMouse(TR.x, TR.y)
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.waitForTimeout(100) // 等 pointerdown/pointer capture 就位再拖
  await page.mouse.move(BL.x, BL.y, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
}

// 3. Shift+拖全画布框选：拖拽中矩形出现 → 松手 → 全部可见对象选中
await settleMouse(TR.x, TR.y)
await page.keyboard.down('Shift')
await page.mouse.down()
await page.waitForTimeout(100)
await page.mouse.move(BL.x, BL.y, { steps: 10 })
expectTrue('Shift 拖拽中框选矩形出现', (await page.locator('[data-marquee]').count()) === 1)
await shot('02-marquee-dragging')
await page.mouse.up()
await page.keyboard.up('Shift')
expectTrue('松手后框选矩形消失', (await page.locator('[data-marquee]').count()) === 0)
expectEq('全画布框选：节点+边全选中', await waitSelCount(String(N + M)), String(N + M))
await shot('03-all-selected')

// 4. Delete 批量删除：全部节点/边一步清空，toast 反馈
await page.keyboard.press('Delete')
expectEq('Delete 后节点清零', await nodeCount(), '0')
expectEq('Delete 后连接清零', await linkCount(), '0')
expectEq('Delete 后选中集清空', await selCount(), '0')
expectTrue(
  '批量删除 toast 出现',
  await page
    .locator('.ant-message-notice', { hasText: '已删除' })
    .first()
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false)
)
await shot('04-after-delete')

// 5. Ctrl+Z 一步整批恢复（deleteSelection 是单条历史；数据重灌触发装载取景
//    重新框住全图，后续框选不依赖残影位置）
await page.keyboard.press('Control+z')
try {
  await page.waitForFunction(
    ([n, m]) => {
      const w = document.querySelector('.graph3d-wrap')
      return w?.getAttribute('data-node-count') === n && w?.getAttribute('data-link-count') === m
    },
    [String(N), String(M)],
    { timeout: 5_000 }
  )
} catch {
  /* 超时由断言兜底 */
}
expectEq('Ctrl+Z 恢复节点计数', await nodeCount(), String(N))
expectEq('Ctrl+Z 恢复连接计数', await linkCount(), String(M))
await shot('05-after-undo')

// 6. 空框清空：Shift+单击（未拖）= 零尺寸框 = 完整取消选中
await marqueeSelectAll()
expectEq('重新框选全图（前置）', await waitSelCount(String(N + M)), String(N + M))
await settleMouse(TR.x, TR.y)
await page.keyboard.down('Shift')
await page.mouse.click(TR.x, TR.y)
await page.keyboard.up('Shift')
expectEq('Shift+单击空框清空选中', await waitSelCount('0'), '0')

// 7. 重新框选后点空白：background-click 清空批量选中。这也是单击吞没回归
//    （见文件头）：手势后残留的 stale isPointerDragging 会吞掉这次单击
await marqueeSelectAll()
expectEq('再次框选全图（前置）', await waitSelCount(String(N + M)), String(N + M))
await settleMouse(TR.x, TR.y)
await page.mouse.click(TR.x, TR.y)
await page.waitForTimeout(400) // click 异步派发（rAF 后悬停轮询就位）
expectEq('点空白清空批量选中（单击吞没回归）', await waitSelCount('0'), '0')
await shot('06-cleared')

// 8. 无 Shift 普通拖：不得出现框选矩形（归 OrbitControls 旋转；小步旋转
//    放最后，避免扰动前面的全画布覆盖断言）
await settleMouse(TR.x, TR.y)
await page.mouse.down()
await page.waitForTimeout(100)
await page.mouse.move(TR.x - 40, TR.y + 20, { steps: 4 })
expectTrue('普通拖不出现框选矩形', (await page.locator('[data-marquee]').count()) === 0)
await page.mouse.up()
await page.waitForTimeout(150) // 悬停轮询冲刷，松手不误派发

console.log(errors.length ? `渲染错误 ${errors.length} 条:` : '渲染无错误', errors)
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
// 收尾用 destroy：本流程必然留下未保存修改，app.close 会撞上原生
// 未保存确认对话框（无人应答永久挂起）
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})
process.exitCode = failures === 0 && errors.length === 0 ? 0 : 1
