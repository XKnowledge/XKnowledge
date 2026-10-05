// 冒烟驱动：建图可见入口三件套（评审结论：机制只有一个——手势+就地编辑器，
// 门要有好几扇）——
// 1) 空图引导：空白画布中央 data-empty-hint 提示（最困惑时刻的画布自白），
//    就地编辑器打开时让位（编辑器也开在中心，视觉冲突）、建成首节点即退场；
// 2) 工具栏「创建节点」按钮：data-toolbar-action="create_node"，点击与双击
//    同管道（视图中心为落点打开就地编辑器，走同一条 canvas-create-node 链），
//    全程键盘建成首节点；
// 3) 连线触点提示：点选节点后底部导航条（.scene-nav-info）切为「已选中节点：
//    按住 Ctrl 拖…」——默认导航文案本身含「连线」二字，断言用连接提示独有
//    的「已选中节点」前缀区分；点空白回落默认导航。
// 悬停轮询坑沿 smoke-canvas-edit 惯例：画布手势前 settleMouse 冲刷悬停。
// 用法：node scripts/smoke-create-entry.mjs   （需先 npm run build；
//       应用不能在运行——单实例锁会让新实例启动即退出）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = process.env.SMOKESHOT_DIR
  ? path.resolve(APP_DIR, process.env.SMOKESHOT_DIR)
  : path.join(APP_DIR, '.artifacts', 'smoke-shots-create-entry')
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
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) })
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
const navInfoText = () =>
  page.evaluate(() => document.querySelector('.scene-nav-info')?.textContent ?? '')
/** 手势前冲刷悬停（three-render-objects 悬停轮询 50ms 节流，见 smoke-canvas-edit 头注） */
const settleMouse = async (x, y) => {
  await page.mouse.move(x, y)
  await page.waitForTimeout(250)
}
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
  return page.locator('.graph3d-wrap').getAttribute('data-node-count')
}
const waitEditorCount = async (mode, want, timeout = 3_000) => {
  const sel = `[data-canvas-edit-mode="${mode}"]`
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if ((await page.locator(sel).count()) === want) return true
    await page.waitForTimeout(100)
  }
  return (await page.locator(sel).count()) === want
}
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

// 1. 首页 → 新建空白卡 → 图表页；空图初始态：默认导航文案 + 空图引导
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.new-blank-card').click()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(1_500) // 等 3D 引擎挂载与首帧取景
expectEq('空白图节点计数', await page.locator('.graph3d-wrap').getAttribute('data-node-count'), '0')
expectTrue('初始为默认导航文案（无选中）', (await navInfoText()).includes('建节点'))
expectTrue('空图出现中央引导提示', (await page.locator('[data-empty-hint]').count()) === 1)
await shot('01-blank-hint')

// 2. 工具栏四按钮齐备（创建/删除节点、删除连接、编辑栏）。按钮本体无文字
//    （图标钮，文字在兄弟节点），标签断言取 closest('.ant-space') 条目容器
for (const [action, label] of [
  ['create_node', '创建节点'],
  ['delete_node', '删除节点'],
  ['delete_edge', '删除连接'],
  ['toggle_sider', '编辑栏']
]) {
  const ok = await page.evaluate(
    ([a, text]) => {
      const btn = document.querySelector(`[data-toolbar-action="${a}"]`)
      const host = btn?.closest('.ant-space')
      return !!btn && !!host && host.textContent.includes(text)
    },
    [action, label]
  )
  expectEq(`工具栏按钮 ${label}`, ok ? '有' : '缺', '有')
}

// 3. 「创建节点」按钮 → 与双击同管道：就地编辑器以中心为落点打开
await page.locator('[data-toolbar-action="create_node"]').click()
expectTrue('按钮打开建点编辑器', await waitEditorCount('node', 1))
expectTrue('编辑器开着时空图引导让位', (await page.locator('[data-empty-hint]').count()) === 0)
await awaitEditorFocus()
await shot('02-editor-from-button')
await page.keyboard.type('Alpha')
await page.keyboard.press('Enter')
const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
await dropdown.waitFor({ state: 'visible', timeout: 5_000 })
await dropdown.locator('input').fill('核心')
await dropdown.locator('button', { hasText: '新增' }).click()
expectEq('按钮路径 Alpha 建成（节点计数）', await awaitNodeCount('1'), '1')
expectTrue('首节点建成后引导退场', (await page.locator('[data-empty-hint]').count()) === 0)
await shot('03-first-node-created')

// 4. 连线触点提示：点选 Alpha（单节点投影在画布中心）→ 导航条切连接提示；
//    点空白回落默认。断言用「已选中节点」前缀（默认文案也含「连线」二字）
const box = await page.locator('.graph3d-container').boundingBox()
const C = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
const E1 = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.75 } // 远离中心的空白点
await settleMouse(C.x, C.y)
await page.mouse.click(C.x, C.y)
expectTrue(
  '点选节点后导航条切连接提示（含 Ctrl）',
  await page
    .waitForFunction(
      () => {
        const text = document.querySelector('.scene-nav-info')?.textContent ?? ''
        return text.includes('已选中节点') && text.includes('Ctrl')
      },
      null,
      { timeout: 3_000 }
    )
    .then(() => true)
    .catch(() => false)
)
await shot('04-connect-hint')
await settleMouse(E1.x, E1.y)
await page.mouse.click(E1.x, E1.y)
// 库的 background-click 经悬停轮询异步派发 + watch 改文案：轮询等回落
expectTrue(
  '点空白后回落默认导航',
  await page
    .waitForFunction(
      () => {
        const text = document.querySelector('.scene-nav-info')?.textContent ?? ''
        return !text.includes('已选中节点') && text.includes('建节点')
      },
      null,
      { timeout: 3_000 }
    )
    .then(() => true)
    .catch(() => false)
)

// 5. 第三扇门：菜单「创建节点」——与删除节点同组（菜单里删有建无的不对称
//    修复），经 shortcutActive/shortcutWatch 分发到同一 createNodeAtCenter
await page.locator('.sider-menu-style a').hover() // Windows trigger=hover
await page.locator('.ant-dropdown-menu-item', { hasText: '创建节点' }).click()
expectTrue('菜单「创建节点」打开建点编辑器', await waitEditorCount('node', 1))
await shot('05-editor-from-menu')
await page.keyboard.press('Escape')
expectTrue('菜单路径 Esc 关闭编辑器', await waitEditorCount('node', 0))
expectEq(
  '菜单路径取消不建点（节点计数）',
  await page.locator('.graph3d-wrap').getAttribute('data-node-count'),
  '1'
)

console.log(errors.length ? `渲染错误 ${errors.length} 条:` : '渲染无错误', errors)
// 收尾用 destroy：必然留下未保存修改，app.close 会撞原生未保存确认对话框
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})
process.exitCode = failures === 0 && errors.length === 0 ? 0 : 1
