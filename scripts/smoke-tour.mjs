// 冒烟驱动：新手教程全链路。清标记 → 新建空白文件 → 教程自动开跑
// （欢迎气泡 + 居中）→ 下一步走菜单/工具栏步骤（高亮锚点就位）→ 点 X
// 跳过 → 气泡消失 + 标记落库 → 菜单「新手教程」重开（标记不拦手动）→
// 连点下一步走到尾步「开始建图吧」→ 点「结束导览」→ 气泡消失 + 标记仍
// 在。收尾 destroy（必然留下未保存空白图，app.close 会撞未保存确认框）。
// 用法：node scripts/smoke-tour.mjs   （需先 yarn build；应用不能在运行
//       ——单实例锁会让新实例启动即退出）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = process.env.SMOKESHOT_DIR
  ? path.resolve(APP_DIR, process.env.SMOKESHOT_DIR)
  : path.join(APP_DIR, '.artifacts', 'smoke-shots-tour')
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
// 注：rendering 级 SVG 报错（如 <rect> 负宽高）page.on('console') 收不到，
// 需 CDP Log.entryAdded（15a4cf9 的诊断先例）；教程贴边锚点的负值报错
// 已在该提交从源头修复（锚点换离边元素），无需白名单
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
const tourVisible = async () => page.locator('.ant-tour').isVisible({ timeout: 3_000 })
const tourTitle = async () =>
  page.locator('.ant-tour-title').innerText().catch(() => '')
const tourGone = async () =>
  page
    .locator('.ant-tour')
    .waitFor({ state: 'hidden', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)

// 1. 首页清标记 → 新建空白文件（进入图表页触发 onMounted 自动判定）
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.evaluate(() => localStorage.removeItem('xk-tour-done'))
await page.locator('.new-blank-card').click()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(800) // 3D 引擎挂载 + nextTick 首帧布局锚点就位

// 2. 自动开跑：欢迎气泡（居中步无 target）
expectTrue('教程自动开跑（欢迎气泡出现）', await tourVisible())
expectEq('首步标题', await tourTitle(), '欢迎使用 XKnowledge')
await shot('01-welcome')

// 3. 下一步 → 菜单步 → 工具栏步（真实锚点高亮，气泡标题随步切换）
await page.locator('.ant-tour-next-btn').click()
await page.waitForTimeout(300)
expectEq('第 2 步标题（菜单）', await tourTitle(), '菜单')
await shot('02-menu')
await page.locator('.ant-tour-next-btn').click()
await page.waitForTimeout(300)
expectEq('第 3 步标题（工具栏）', await tourTitle(), '工具栏')
await shot('03-toolbar')

// 4. X 跳过：气泡消失 + 标记落库（此后不再自动弹）
await page.locator('.ant-tour-close').click()
expectTrue('点 X 后气泡消失', await tourGone())
expectEq('跳过写标记', await page.evaluate(() => localStorage.getItem('xk-tour-done')), '1')

// 5. 菜单重开：标记不拦手动入口
await page.locator('.sider-menu-style a').hover() // Windows trigger=hover
await page.locator('[data-start-tour]').click()
expectTrue('菜单重开教程再现', await tourVisible())
expectEq('重开回首步', await tourTitle(), '欢迎使用 XKnowledge')

// 6. 连点下一步走完全部 9 步 → 尾步标题 → 「结束导览」按钮 → 气泡消失
for (let i = 0; i < 8; i++) {
  await page.locator('.ant-tour-next-btn').click()
  await page.waitForTimeout(150)
}
expectEq('尾步标题', await tourTitle(), '开始建图吧')
expectEq(
  '尾步按钮文案',
  (await page.locator('.ant-tour-next-btn').innerText()).trim(),
  '结束导览'
)
await shot('04-finish')
await page.locator('.ant-tour-next-btn').click()
expectTrue('结束导览后气泡消失', await tourGone())
expectEq('标记仍在', await page.evaluate(() => localStorage.getItem('xk-tour-done')), '1')

// 7. 标记在：同窗口再装载（关文件回首页 → 再新建）不再自动弹
await page.keyboard.press('Control+s') // 首次保存弹另存为——取消掉
await page.waitForTimeout(500)
const saveDialog = page.locator('.ant-modal:visible').first()
if (await saveDialog.isVisible().catch(() => false)) {
  await page.locator('.ant-modal .ant-btn', { hasText: '取消' }).first().click()
  await page.waitForTimeout(300)
}
await page.locator('.sider-menu-style a').hover()
await page.locator('.ant-dropdown-menu-item', { hasText: '关闭文件' }).click()
await page.waitForSelector('.xk-example-card', { timeout: 10_000 })
await page.locator('.new-blank-card').click()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(1_200)
expectTrue('已看过：不再自动弹', !(await tourVisible()))
await shot('05-no-autostart')

console.log(errors.length ? `渲染错误 ${errors.length} 条:` : '渲染无错误', errors)
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
// 收尾 destroy：必然留下未保存修改，app.close 会撞原生未保存确认对话框
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})
process.exitCode = failures === 0 && errors.length === 0 ? 0 : 1
