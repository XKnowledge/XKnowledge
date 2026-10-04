// 冒烟驱动：跨文件复制/粘贴。真实路径（框选 → Ctrl+C → 剪贴板）+ 注入路径
// （evaluate 经 preload writeGraphClipboard 注入「来自另一文件」的选区 JSON →
// Ctrl+V）——剪贴板是 OS 级全局，注入后的读取/解析/合并与真实跨窗口复制完全
// 同代码路径。断言：复制剪贴板内容（标记/计数/坐标剥离）、同图粘贴合并推论
// （全同名全重复 → 没有可粘贴的新内容、不进历史）、跨文件全新节点合并
// （+2 节点 +1 边、粘贴清选中、Ctrl+Z 整批撤销）、同名合并（跳过 1、边接上
// 现有同名节点）、非本应用格式提示后数据不动、无选中 Ctrl+C 无动作且剪贴板
// 未被覆写。
// 用法：node scripts/smoke-copy-paste.mjs   （需先 npm run build；
//       应用不能在运行——单实例锁会让新实例启动即退出）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = process.env.SMOKESHOT_DIR
  ? path.resolve(APP_DIR, process.env.SMOKESHOT_DIR)
  : path.join(APP_DIR, '.artifacts', 'smoke-shots-copy-paste')
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
/** 轮询等 data-node-count/data-link-count 到期望值（粘贴后数据重灌异步落锚点） */
const waitCounts = async (n, m, timeout = 5_000) => {
  try {
    await page.waitForFunction(
      ([wn, wm]) => {
        const w = document.querySelector('.graph3d-wrap')
        return (
          w?.getAttribute('data-node-count') === wn && w?.getAttribute('data-link-count') === wm
        )
      },
      [String(n), String(m)],
      { timeout }
    )
  } catch {
    /* 超时由调用方断言兜底 */
  }
  return [await nodeCount(), await linkCount()]
}
/** toast 是否出现（antd message，3s 自动消失，等 2s 足够） */
const toastSeen = async (text) =>
  page
    .locator('.ant-message-notice', { hasText: text })
    .first()
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false)
/** 手势前冲刷悬停（three-render-objects 的 click 派发用悬停轮询对象，rAF 异步
 *  50ms 节流）：先 move 到目标点，等轮询追上再落笔 */
const settleMouse = async (x, y) => {
  await page.mouse.move(x, y)
  await page.waitForTimeout(250)
}
/** 剪贴板选区 JSON 注入（模拟「来自另一文件」的复制产物） */
const injectSelection = (payload) =>
  page.evaluate((t) => window.electronAPI.writeGraphClipboard(t), JSON.stringify(payload))
const readClipboardText = () =>
  page.evaluate(() => window.electronAPI.readGraphClipboard().then((r) => r.text))

// 1. 首页 → 双击首个示例卡 → 图表页（示例视同副本打开，可编辑）
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(3_000) // 等 3D 引擎挂载 + 布局收敛 + 装载粗取景
const N = Number(await nodeCount())
const M = Number(await linkCount())
expectTrue('示例图装载（节点 >= 2）', N >= 2, `节点 ${N}`)
expectTrue('示例图装载（连接 >= 1）', M >= 1, `连接 ${M}`)

// 2. 开侧栏 → 复位视图 zoomToFit：几何稳定，全画布框（内缩 15px）必罩全部节点
await page.locator('.no-move-button').nth(2).click() // 删除节点/删除连接/编辑栏
await page.waitForTimeout(800)
await page.locator('button', { hasText: '复位视图' }).click()
await page.waitForTimeout(1_200)
const box = await page.locator('.graph3d-container').boundingBox()
const TR = { x: box.x + box.width - 15, y: box.y + 15 }
const BL = { x: box.x + 15, y: box.y + box.height - 15 }

// 3. Shift+拖全画布框选 → Ctrl+C：toast + 剪贴板内容 Node 侧校验
await settleMouse(TR.x, TR.y)
await page.keyboard.down('Shift')
await page.mouse.down()
await page.waitForTimeout(100)
await page.mouse.move(BL.x, BL.y, { steps: 10 })
await page.mouse.up()
await page.keyboard.up('Shift')
expectEq('全画布框选：节点+边全选中', await waitSelCount(String(N + M)), String(N + M))
await shot('01-all-selected')

await page.keyboard.press('Control+c')
expectTrue('复制 toast 出现', await toastSeen('已复制'))
const clip = JSON.parse(await readClipboardText())
expectEq('剪贴板 app 标记', clip.app, 'xknowledge')
expectEq('剪贴板 type 标记', clip.type, 'graph-selection')
expectEq('剪贴板节点数', clip.nodes.length, N)
expectEq('剪贴板边数', clip.links.length, M)
expectTrue(
  '力布局坐标已剥离',
  clip.nodes.every((n) => !('x' in n) && !('vx' in n))
)
await shot('02-copied')

// 4. 同图 Ctrl+V（合并语义推论：全同名、全端点对重复 → 无新内容，不进历史）
await page.keyboard.press('Control+v')
expectTrue('同图粘贴 toast（没有新内容）', await toastSeen('没有可粘贴的新内容'))
expectEq('同图粘贴节点数不变', await nodeCount(), String(N))
expectEq('同图粘贴连接数不变', await linkCount(), String(M))

// 5. 跨文件注入①：全新节点 + 新边（无同名路径）
await injectSelection({
  app: 'xknowledge',
  type: 'graph-selection',
  version: 1,
  nodes: [
    { name: '冒烟新点P', des: '', symbolSize: 50, category: '冒烟类目' },
    { name: '冒烟新点Q', des: '', symbolSize: 50, category: '冒烟类目' }
  ],
  links: [{ source: '冒烟新点P', target: '冒烟新点Q', name: '', des: '' }]
})
await page.keyboard.press('Control+v')
expectTrue('跨文件粘贴 toast（已粘贴 2 个节点）', await toastSeen('已粘贴 2 个节点'))
{
  const [n2, m1] = await waitCounts(N + 2, M + 1)
  expectEq('粘贴后节点 +2', n2, String(N + 2))
  expectEq('粘贴后连接 +1', m1, String(M + 1))
}
expectEq('粘贴后选中清空', await selCount(), '0')
await shot('03-pasted-new')
// Ctrl+Z 一步整批撤销（pasteGraph 单条历史）
await page.keyboard.press('Control+z')
{
  const [nz, mz] = await waitCounts(N, M)
  expectEq('撤销回节点 N', nz, String(N))
  expectEq('撤销回连接 M', mz, String(M))
}
await shot('04-after-undo')

// 6. 跨文件注入②：同名合并路径——用第 3 步读回的首节点名（图中真实存在）
//    + 新节点 R + 边 首节点-R → 粘贴 1 节点 1 边、跳过 1 同名、边接上现有节点
const existingName = clip.nodes[0].name
await injectSelection({
  app: 'xknowledge',
  type: 'graph-selection',
  version: 1,
  nodes: [
    { name: existingName, des: '', symbolSize: 50, category: '' },
    { name: '冒烟新点R', des: '', symbolSize: 50, category: '' }
  ],
  links: [{ source: existingName, target: '冒烟新点R', name: '', des: '' }]
})
await page.keyboard.press('Control+v')
expectTrue('同名合并 toast（跳过 1 个已存在节点）', await toastSeen('跳过 1 个已存在节点'))
{
  const [n1, m1] = await waitCounts(N + 1, M + 1)
  expectEq('同名合并节点 +1', n1, String(N + 1))
  expectEq('同名合并连接 +1（接上现有同名节点）', m1, String(M + 1))
}
await shot('05-pasted-merge')
await page.keyboard.press('Control+z')
{
  const [nz, mz] = await waitCounts(N, M)
  expectEq('撤销回节点 N（第二次）', nz, String(N))
  expectEq('撤销回连接 M（第二次）', mz, String(M))
}

// 7. 非本应用格式：纯文本剪贴板 → 提示后数据不动
await page.evaluate((t) => window.electronAPI.writeGraphClipboard(t), '普通文本')
await page.keyboard.press('Control+v')
expectTrue('非格式提示 toast', await toastSeen('剪贴板没有可粘贴的图谱内容'))
expectEq('非格式粘贴节点数不动', await nodeCount(), String(N))

// 8. 无选中 Ctrl+C：无 toast、剪贴板未变（不被覆写成空/垃圾）。粘贴路径已
//    resetRefData 清空三路选中态（框选集/直选边/最后点击节点），直接断言后按键
//    ——不点空白兜底：撤销后取景重新框满全图，画布角落可能贴着节点球，
//    误点会点亮「最后点击节点」路径反而破坏本断言
expectEq('前置：选中集已空', await selCount(), '0')
// antd message 的 notice 节点在本应用 DOM 常驻（视觉 3s 消失但节点不
// removal），文本匹配会命中历史残留——「不弹新 toast」用计数法断言
const noticeCountBefore = await page.locator('.ant-message-notice').count()
await page.keyboard.press('Control+c')
await page.waitForTimeout(600) // message.info 若触发会立即入 DOM
expectEq(
  '无选中复制不弹新 toast',
  String(await page.locator('.ant-message-notice').count()),
  String(noticeCountBefore)
)
expectEq('剪贴板未被覆写', await readClipboardText(), '普通文本')

console.log(errors.length ? `渲染错误 ${errors.length} 条:` : '渲染无错误', errors)
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
// 收尾用 destroy：本流程必然留下未保存修改（粘贴已撤销但历史栈非空算 dirty），
// app.close 会撞上原生未保存确认对话框（无人应答永久挂起）
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})
process.exitCode = failures === 0 && errors.length === 0 ? 0 : 1
