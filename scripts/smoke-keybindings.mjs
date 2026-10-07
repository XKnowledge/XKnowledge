// 冒烟驱动：快捷键自定义全链路。打开首个示例图 → 开设置断言 5 键位行 +
// 3 手势行 → delete 改绑 X（落库/按钮文案/恢复默认按钮出现）→ 画布框选后
// X 批量删除、Delete 旧键失效 → Ctrl+Z 整批恢复 → 冲突录制（save 录 X 被
// 「删除」占用 toast 拒绝原值不变）→ search 裸键录制被拒（无输入框守卫，
// 裸键打断打字）→ 单行恢复默认 → 录制中 Esc 只取消录制不关弹窗 → 合法改键
// 后「全部恢复默认」出现并一键还原 → 默认 Delete 键恢复生效。
// 几何稳定性：沿 smoke-marquee 手法——开侧栏 + 复位视图 zoomToFit 后全画布
// 框选必罩住全部可见对象。
// 用法：node scripts/smoke-keybindings.mjs   （需先 npm run build；
//       应用不能在运行——单实例锁会让新实例启动即退出）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = process.env.SMOKESHOT_DIR
  ? path.resolve(APP_DIR, process.env.SMOKESHOT_DIR)
  : path.join(APP_DIR, '.artifacts', 'smoke-shots-keybindings')
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
/** toast 出现即真（antd message 有入场动画，waitFor visible 2s 兜底） */
const toastSeen = async (text) =>
  page
    .locator('.ant-message-notice', { hasText: text })
    .first()
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false)

const wrap = page.locator('.graph3d-wrap')
const nodeCount = () => wrap.getAttribute('data-node-count')
const selCount = () => wrap.getAttribute('data-selection-count')
/** 手势前冲刷悬停（three-render-objects 的 click 派发用悬停轮询对象） */
const settleMouse = async (x, y) => {
  await page.mouse.move(x, y)
  await page.waitForTimeout(250)
}

const rowBtn = (id) => page.locator(`[data-keybinding-row="${id}"] .xk-binding-btn`)
const rowReset = (id) => page.locator(`[data-keybinding-row="${id}"] .xk-reset-btn`)
const modalVisible = () => page.locator('.ant-modal').isVisible()
const openSettings = async () => {
  await page.locator('.sider-menu-style a').hover() // Windows trigger=hover
  await page.locator('.ant-dropdown-menu-item', { hasText: '设置' }).click()
  await page.locator('.ant-modal').waitFor({ state: 'visible', timeout: 5_000 })
  await page.waitForTimeout(300) // 弹窗入场动画
}
// 用 × 按钮关闭（确定性）：非录制态的 Esc 关闭是 antd 自身行为、不在本
// 功能验证范围（录制态 Esc 只取消录制已单列断言）
const closeSettings = async () => {
  await page.locator('.ant-modal-close').click()
  await page.locator('.ant-modal').waitFor({ state: 'hidden', timeout: 5_000 })
}

// 1. 首页 → 双击首个示例卡 → 图表页；开侧栏复位视图稳定几何
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(3_000) // 3D 引擎挂载 + 布局收敛 + 装载粗取景
const N = Number(await nodeCount())
expectTrue('示例图装载（节点 >= 2）', N >= 2, `节点 ${N}`)
// 编辑栏开侧栏：显式锚点（d175e0b 后工具栏 4 按钮，原 nth(2) 已指向
// 「删除连接」开侧栏失效）
await page.locator('[data-toolbar-action="toggle_sider"]').click()
await page.waitForTimeout(800)
await page.locator('button', { hasText: '复位视图' }).click()
await page.waitForTimeout(1_200) // zoomToFit 600ms 补间完成
const box = await page.locator('.graph3d-container').boundingBox()
const TR = { x: box.x + box.width - 15, y: box.y + 15 }
const BL = { x: box.x + 15, y: box.y + box.height - 15 }

/** Shift+拖全画布框选（TR→BL 对角覆盖） */
const marqueeSelectAll = async () => {
  await settleMouse(TR.x, TR.y)
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.waitForTimeout(100)
  await page.mouse.move(BL.x, BL.y, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
}

// 2. 开设置：5 键位行 + 3 手势行 + 默认文案（冒烟跑在 Windows：Ctrl）
await openSettings()
expectEq('快捷键行数', String(await page.locator('[data-keybinding-row]').count()), '7')
expectEq('鼠标手势行数', String(await page.locator('[data-gesture-row]').count()), '3')
expectEq('save 默认文案', await rowBtn('save').innerText(), 'Ctrl+S')
expectEq('delete 默认文案', await rowBtn('delete').innerText(), 'Delete')
expectEq('search 默认文案', await rowBtn('search').innerText(), 'Ctrl+F')
await shot('01-settings-default')

// 3. delete 改绑 X：录制态文案 → 落键 → 按钮变 X + 落库 + 恢复默认按钮出现
await rowBtn('delete').click()
expectEq('录制态文案', await rowBtn('delete').innerText(), '按下新组合…')
expectEq('录制态锚点', await rowBtn('delete').getAttribute('data-recording'), 'on')
await page.keyboard.press('x')
await page.waitForTimeout(200)
expectEq('delete 改绑后文案', await rowBtn('delete').innerText(), 'X')
expectEq('录制态退出', await rowBtn('delete').getAttribute('data-recording'), 'off')
expectTrue('恢复默认按钮出现', (await rowReset('delete').count()) === 1)
const stored1 = await page.evaluate(() => JSON.parse(localStorage.getItem('xk-keybindings')))
expectEq(
  'delete 落库',
  JSON.stringify(stored1.delete),
  JSON.stringify({ modifiers: [], key: 'x' })
)
await shot('02-delete-rebound')
await closeSettings()

// 4. 框选全图 → X 批量删除（新键生效）→ Ctrl+Z 整批恢复
await marqueeSelectAll()
expectTrue('框选全图（前置）', (await selCount()) !== '0' && (await selCount()) !== null)
await page.keyboard.press('x')
try {
  await page.waitForFunction(
    () => document.querySelector('.graph3d-wrap')?.getAttribute('data-node-count') === '0',
    { timeout: 5_000 }
  )
} catch {
  /* 超时由断言兜底 */
}
expectEq('X 批量删除后节点清零', await nodeCount(), '0')
expectTrue('批量删除 toast', await toastSeen('已删除'))
await page.keyboard.press('Control+z')
try {
  await page.waitForFunction(
    (n) => document.querySelector('.graph3d-wrap')?.getAttribute('data-node-count') === n,
    String(N),
    { timeout: 5_000 }
  )
} catch {
  /* 超时由断言兜底 */
}
expectEq('Ctrl+Z 恢复节点计数', await nodeCount(), String(N))

// 5. 再框选 → 按 Delete 旧键不触发（选中数不变）
await marqueeSelectAll()
const selBefore = await selCount()
await page.keyboard.press('Delete')
await page.waitForTimeout(600)
expectEq('Delete 旧键失效（选中数不变）', await selCount(), selBefore)
expectEq('节点未被旧键误删', await nodeCount(), String(N))
await settleMouse(TR.x, TR.y)
await page.mouse.click(TR.x, TR.y) // 点空白清空选中
await page.waitForTimeout(400)

// 6. 冲突录制：save 录 X 被「删除」占用 → toast + 原值不变
await openSettings()
await rowBtn('save').click()
await page.keyboard.press('x')
expectTrue('冲突 toast 出现', await toastSeen('已被「删除」占用'))
await page.waitForTimeout(300)
expectEq('save 原值不变', await rowBtn('save').innerText(), 'Ctrl+S')

// 7. search 裸键录制被拒（无输入框守卫，裸键打断打字）
await rowBtn('search').click()
await page.keyboard.press('g')
expectTrue('search 裸键 toast 出现', await toastSeen('修饰键'))
await page.waitForTimeout(300)
expectEq('search 原值不变', await rowBtn('search').innerText(), 'Ctrl+F')

// 8. delete 单行恢复默认：按钮回 Delete、落库项清除、恢复按钮消失
await rowReset('delete').click()
await page.waitForTimeout(200)
expectEq('delete 恢复默认文案', await rowBtn('delete').innerText(), 'Delete')
expectTrue('恢复默认按钮消失', (await rowReset('delete').count()) === 0)
const stored2 = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('xk-keybindings') ?? '{}')
)
expectTrue('delete 落库项已清除', !('delete' in stored2))

// 9. 录制中 Esc 只取消录制、弹窗不关
await rowBtn('delete').click()
expectEq('再次进入录制态', await rowBtn('delete').getAttribute('data-recording'), 'on')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
expectEq('Esc 取消录制后文案复原', await rowBtn('delete').innerText(), 'Delete')
expectTrue('Esc 取消录制不关弹窗', await modalVisible())
await shot('03-esc-cancel-recording')

// 10. 合法改键（save 录 Ctrl+K）→「全部恢复默认」出现 → 一键还原
await rowBtn('save').click()
await page.keyboard.press('Control+k')
await page.waitForTimeout(200)
expectEq('save 改绑 Ctrl+K', await rowBtn('save').innerText(), 'Ctrl+K')
expectTrue('全部恢复默认按钮出现', (await page.locator('.xk-reset-all').count()) === 1)
await page.locator('.xk-reset-all button').click()
await page.waitForTimeout(200)
expectEq('全部恢复默认后 save 文案', await rowBtn('save').innerText(), 'Ctrl+S')
expectTrue('全部恢复默认按钮消失', (await page.locator('.xk-reset-all').count()) === 0)
await shot('04-reset-all')
await closeSettings()

// 11. 默认键恢复生效：框选 → Delete 清零 → Ctrl+Z 还原
await marqueeSelectAll()
await page.keyboard.press('Delete')
try {
  await page.waitForFunction(
    () => document.querySelector('.graph3d-wrap')?.getAttribute('data-node-count') === '0',
    { timeout: 5_000 }
  )
} catch {
  /* 超时由断言兜底 */
}
expectEq('恢复默认后 Delete 生效', await nodeCount(), '0')
await page.keyboard.press('Control+z')
try {
  await page.waitForFunction(
    (n) => document.querySelector('.graph3d-wrap')?.getAttribute('data-node-count') === n,
    String(N),
    { timeout: 5_000 }
  )
} catch {
  /* 超时由断言兜底 */
}
expectEq('Ctrl+Z 还原节点计数', await nodeCount(), String(N))
await shot('05-default-restored')

console.log(errors.length ? `渲染错误 ${errors.length} 条:` : '渲染无错误', errors)
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
// 收尾用 destroy：本流程必然留下未保存修改，app.close 会撞上原生
// 未保存确认对话框（无人应答永久挂起）
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})
process.exitCode = failures === 0 && errors.length === 0 ? 0 : 1
