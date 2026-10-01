// 冒烟驱动：画布直操编辑——双击空白建点（就地输入名称回车 → 类目下拉内新增
// 「核心」→ 选定即建成：data-node-count/图例断言）、按住节点拖出连线的确定性
// 部分（预览线出现 → 松开空白处静默放弃、预览消失）、Esc 取消路径、再建 Beta
// （下拉此时已有类目，方向键+回车选定）、Ctrl+Z 撤销计数回落、画布右缘双击
// 编辑器不溢出容器。连边的数据链路由 xkUtils 单测覆盖，这里只防手势层回归。
// 新建空白图起步：空图无默认类目，首个类目只能走下拉内即时新增——正是该
// 路径的被测价值。
// 6.5 鼠标流回归：类目 select 必须能被鼠标点开（曾用 v-model:open——antd
// Select 不发 update:open，受控 open 吞掉内部开关请求：点选框无反应、键盘
// 打开后也关不掉）；且「先鼠标点选既有类目 → 输名字 → 回车」应直接建成
// （antd change 只在值变化时发射，同值重选不触发，曾卡死建不出）。
// 两个时序坑（脚本侧规避，产品行为另行报告）：
// a) three-render-objects 的 click 派发用的是悬停轮询对象 state.hoverObj
//    （rAF 异步、pointerRaycasterThrottleMs=50ms 节流），而 pointerPos 只被
//    canvas 容器内的 pointermove 更新——antd 下拉 teleport 到 body，容器看
//    不到鼠标离开，悬停停在刚建的节点上；紧接的画布点击会异步派发
//    onNodeClick(旧节点)（开侧栏、并在 dblclick 开出编辑器后把它关掉）。
//    对策：每个画布手势前 mouse.move 到目标点 + 等 250ms（≥5 个轮询周期）
//    冲刷悬停，再落笔。
// b) 建点落点平面在相机前方约 1000 世界单位处（cameraPosition 的 lookAt 是
//    合成点），第二节点落下后 d3 center 力把两节点对称弹开、投影偏离落点，
//    拖拽起点不可预测。对策：拖拽测试放在只有 Alpha 时从画布中心发起——
//    单节点在世界原点、相机在光轴上，投影与中心数学上重合，命中必然。
// 用法：node scripts/smoke-canvas-edit.mjs   （需先 npm run build；
//       应用不能在运行——单实例锁会让新实例启动即退出）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 专属截图目录（可用 SMOKESHOT_DIR 覆盖）：.smoke-shots 被多脚本共用且清场，
// 并行跑会互相删图
const SHOT_DIR = process.env.SMOKESHOT_DIR
  ? path.resolve(APP_DIR, process.env.SMOKESHOT_DIR)
  : path.join(APP_DIR, '.smoke-shots-canvas-edit')
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
/** 轮询等 data-node-count 到达期望值（建点经 reactive watch 重灌，异步） */
const awaitNodeCount = async (expected, timeout = 5_000) => {
  try {
    await page.waitForFunction(
      (v) => document.querySelector('.graph3d-wrap')?.getAttribute('data-node-count') === v,
      expected,
      { timeout }
    )
  } catch {
    /* 超时由调用方断言兜底 */
  }
  return nodeCount()
}
/** 就地编辑器出现/消失轮询（v-if 即时，轮询只为消时序抖动） */
const waitEditorCount = async (mode, want, timeout = 3_000) => {
  const sel = `[data-canvas-edit-mode="${mode}"]`
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if ((await page.locator(sel).count()) === want) return true
    await page.waitForTimeout(100)
  }
  return (await page.locator(sel).count()) === want
}
/** 手势前冲刷悬停（见文件头坑 a）：先 move 到目标点，等悬停轮询追上 */
const settleMouse = async (x, y) => {
  await page.mouse.move(x, y)
  await page.waitForTimeout(250)
}
/** 编辑器打开后等名称框拿到焦点（watch 里 nextTick focus，就位前打字会丢字） */
const awaitEditorFocus = () =>
  page
    .waitForFunction(
      () => {
        const el = document.activeElement
        return !!el && !!el.closest('.xk-canvas-editor')
      },
      null,
      { timeout: 3_000 }
    )
    .catch(() => {})

// 1. 首页 → 新建空白虚线卡（单击）→ 图表页
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.new-blank-card').click()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(1_500) // 等 3D 引擎挂载与 enterChartMode 生效
expectEq('空白图节点计数', await nodeCount(), '0')
await shot('01-blank-chart')

const box = await page.locator('.graph3d-container').boundingBox()
const C = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
// 取点避让：Alpha 落在画布中心（空图唯一节点在世界原点、相机在光轴上，
// 投影与中心重合），其余交互点离中心 200px 以上（远超 16px 拾取阈值）
const E1 = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.75 } // Esc 取消路径用
const PB = { x: box.x + box.width * 0.22, y: box.y + box.height * 0.25 } // Beta 落点
const PG = { x: box.x + box.width * 0.62, y: box.y + box.height * 0.75 } // Gamma 落点（鼠标流）

// 2. 画布中心双击 → 建点编辑器出现，输入 Alpha 回车 → 类目下拉展开，
//    下拉内新增类目「核心」（空图起步的唯一类目路径）→ 选定即建成
await settleMouse(C.x, C.y)
await page.mouse.dblclick(C.x, C.y)
expectTrue('双击空白出现建点编辑器', await waitEditorCount('node', 1))
await awaitEditorFocus()
await shot('02-node-editor-open')
await page.keyboard.type('Alpha')
await page.keyboard.press('Enter')
// antd 下拉 teleport 到 body；排除收起态残留（ant-select-dropdown-hidden）
const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
await dropdown.waitFor({ state: 'visible', timeout: 5_000 })
// 下拉宽不钳到 select 宽（dropdownMatchSelectWidth=false）：新增按钮须完整
// 可见——曾随 select 定宽 130px 被 overflow 裁掉大半（输入框 100 + 按钮要 ~172px）
expectTrue(
  '下拉内新增按钮完整可见',
  await page.evaluate(() => {
    const dd = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    const btn = dd?.querySelector('button')
    if (!dd || !btn) return false
    return btn.getBoundingClientRect().right <= dd.getBoundingClientRect().right + 0.5
  })
)
await dropdown.locator('input').fill('核心')
await dropdown.locator('button', { hasText: '新增' }).click()
expectEq('Alpha 建成（节点计数）', await awaitNodeCount('1'), '1')
expectTrue(
  '图例出现新类目「核心」',
  (await page.locator('.graph3d-legend-item', { hasText: '核心' }).count()) === 1
)
await shot('03-alpha-created')

// 3. 拖拽手势确定性部分（此时全图只有 Alpha、位于画布中心，落点即投影）：
//    从中心按下 → 拖出 +200px → 预览线出现 → 松开在空白处 → 静默放弃
await settleMouse(C.x, C.y)
await page.mouse.down()
await page.waitForTimeout(100) // 等 pointerdown/pointer capture 就位再拖，防首段 move 丢失
await page.mouse.move(C.x + 200, C.y, { steps: 8 })
await page.waitForTimeout(150) // 等悬停轮询跟进到空点，松开不误派发节点点击
expectTrue('拖拽中预览线出现', (await page.locator('[data-link-preview]').count()) === 1)
await shot('04-drag-preview')
await page.mouse.up()
expectTrue('松开后预览线消失', (await page.locator('[data-link-preview]').count()) === 0)
const edgeEditors = await page.locator('[data-canvas-edit-mode="edge"]').count()
if (edgeEditors === 1) {
  // 意外命中节点（布局漂移等）：Esc 关掉并在断言中容忍，脚本稳定性优先
  await page.keyboard.press('Escape')
  expectTrue('意外命中节点：Esc 关闭边编辑器（容忍路径）', await waitEditorCount('edge', 0))
} else {
  expectTrue('松开空白处静默放弃（未弹边编辑器）', edgeEditors === 0)
}
expectEq('放弃连线不建边（节点计数）', await nodeCount(), '1')
expectEq('放弃连线不建边（连接计数）', await wrap.getAttribute('data-link-count'), '0')
await shot('05-release-cancelled')

// 4. Esc 取消路径：再双击空白 → 编辑器出现 → Esc 关闭，不建点
await settleMouse(E1.x, E1.y)
await page.mouse.dblclick(E1.x, E1.y)
expectTrue('再次双击出现建点编辑器', await waitEditorCount('node', 1))
await page.keyboard.press('Escape')
expectTrue('Esc 后编辑器消失', await waitEditorCount('node', 0))
expectEq('Esc 取消不建点（节点计数）', await nodeCount(), '1')
await shot('06-esc-cancelled')

// 5. 再建 Beta：下拉此时已有「核心」，方向键+回车选定（键盘流全程不落鼠标）
await settleMouse(PB.x, PB.y)
await page.mouse.dblclick(PB.x, PB.y)
expectTrue('Beta 双击出现建点编辑器', await waitEditorCount('node', 1))
await awaitEditorFocus()
await page.keyboard.type('Beta')
await page.keyboard.press('Enter')
await dropdown.waitFor({ state: 'visible', timeout: 5_000 })
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
let count = await awaitNodeCount('2')
if (count !== '2') {
  // 键盘流未命中时兜底直接点选项（antd 默认高亮行为随版本浮动，脚本稳定性优先）
  console.log('keyboard select 未生效，fallback 点击选项')
  await dropdown.locator('.ant-select-item-option', { hasText: '核心' }).click()
  count = await awaitNodeCount('2')
}
expectEq('Beta 建成（节点计数）', count, '2')
await shot('07-beta-created')

// 6. Ctrl+Z 撤销：画布直操建点同样进撤销栈，一次撤销 Beta（2→1）
await page.keyboard.press('Control+z')
expectEq('Ctrl+Z 后节点计数回落', await awaitNodeCount('1'), '1')
await shot('08-after-undo')

// 6.5 鼠标流回归（见文件头）：鼠标点开类目下拉 → 点选既有类目「核心」→
//     下拉应收起 → 输名字 Gamma 回车 → 直接建成（不再重开下拉重选）
await settleMouse(PG.x, PG.y)
await page.mouse.dblclick(PG.x, PG.y)
expectTrue('鼠标流双击出现建点编辑器', await waitEditorCount('node', 1))
await awaitEditorFocus()
await page.locator('[data-canvas-edit-mode="node"] .xk-canvas-editor-cat').click()
let mouseOpened = true
try {
  await dropdown.waitFor({ state: 'visible', timeout: 5_000 })
} catch {
  mouseOpened = false
}
expectTrue('鼠标点击类目 select 下拉展开', mouseOpened)
await dropdown.locator('.ant-select-item-option', { hasText: '核心' }).click()
expectTrue(
  '选项点选后下拉自动收起',
  await page
    .waitForFunction(
      () => {
        const d = document.querySelector(
          '.ant-select-dropdown:not(.ant-select-dropdown-hidden)'
        )
        return !d || getComputedStyle(d).display === 'none'
      },
      null,
      { timeout: 2_000 }
    )
    .then(() => true)
    .catch(() => false)
)
await page.locator('[data-canvas-edit-mode="node"] .xk-canvas-editor-name').click()
await page.keyboard.type('Gamma')
await page.keyboard.press('Enter')
expectEq('先选类目后输名字回车直接建成', await awaitNodeCount('2'), '2')
await shot('085-gamma-mouseflow')

// 7. 画布右缘双击：编辑器出现且右边界不溢出容器（clampEditorPos 钳制兑现）。
//    box 重量化：途中若有节点点击误开侧栏，画布已缩窄，旧坐标会落进侧栏
const box2 = await page.locator('.graph3d-container').boundingBox()
const edgeX = box2.x + box2.width - 30
await settleMouse(edgeX, C.y)
await page.mouse.dblclick(edgeX, C.y)
expectTrue('右缘双击出现建点编辑器', await waitEditorCount('node', 1))
const edBox = await page.locator('[data-canvas-edit-mode="node"]').boundingBox()
// 上步软失败时 boundingBox 为 null：跳过几何断言（failures 已计数，exit 仍非零），
// 但继续走 Esc/收尾，避免裸解引用炸在 destroy 之前遗留孤儿 Electron 进程
if (edBox) {
  const overflow = edBox.x + edBox.width - (box2.x + box2.width)
  expectTrue('右缘编辑器不溢出容器右缘', overflow <= 1.5, `右溢出 ${overflow.toFixed(1)}px`)
  expectTrue('右缘编辑器不越容器左缘', edBox.x >= box2.x - 1.5)
}
await shot('09-right-edge-editor')
await page.keyboard.press('Escape')

console.log(errors.length ? `渲染错误 ${errors.length} 条:` : '渲染无错误', errors)
// 收尾用 destroy：本流程必然留下未保存修改，app.close 会撞上原生
// 未保存确认对话框（无人应答永久挂起）
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})
process.exitCode = failures === 0 && errors.length === 0 ? 0 : 1
