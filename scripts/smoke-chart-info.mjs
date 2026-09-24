// 冒烟驱动：编辑栏·图谱简介——验证简介查看与编辑全链路（chartData.description
// → computed 双向绑定 → textarea 展示；输入 → 置脏 → fileDirty → titleService
// 窗口标题圆点）。覆盖：打开示例后编辑栏可见原简介、修改后标题出现未保存圆点。
// （另存对话框为原生模态，无法自动化；持久化由 saveFile 整体序列化保证，
// 与 smoke-close-file.mjs 同结论，不在 UI 层重复验证。）
// 用法：node scripts/smoke-chart-info.mjs   （需先 yarn build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.smoke-shots-chart-info')
fs.rmSync(SHOT_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })

const electronBin = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!fs.existsSync(electronBin)) {
  console.error('FATAL: electron binary not found at', electronBin)
  process.exit(1)
}

// 与渲染端 listExamples 同源的首个示例：readdir 顺序一致，首页第一张卡即它
const firstExample = () => {
  const dir = path.join(APP_DIR, 'examples')
  const entry = fs
    .readdirSync(dir, { withFileTypes: true })
    .find((e) => e.isFile() && e.name.endsWith('.xk'))
  if (!entry) throw new Error('examples 目录下没有 .xk 示例')
  const parsed = JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf-8'))
  return { fileName: entry.name, description: parsed.description || '' }
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
const nativeTitle = () =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())
const expectEq = (label, actual, expected) => {
  const pass = actual === expected
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: ${actual}${pass ? '' : `（期望 ${expected}）`}`)
  if (!pass) failures++
}
const expectOk = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : `：${detail}`}`)
  if (!ok) failures++
}

const { fileName, description } = firstExample()
console.log(`首个示例: ${fileName}，简介长度 ${description.length}`)

// 1. 首页 → 双击第一张示例卡同窗口进入图表页
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(1_500) // 等 enterChartMode 生效

// 2. 点工具栏「编辑栏」按钮唤出侧边栏（属性面板默认显示）。
// 「编辑栏」文字是按钮旁的 label div（不在 a-button 内），点文字不触发
// click，须点按钮本身；图标 png 被 vite 内联成 data URL 无文件名可匹配，
// 按 buttonList 顺序编辑栏是最后一个工具栏按钮
await page.locator('.no-move-button').last().click()
const textarea = page.locator('.attr-panel textarea')
await textarea.waitFor({ state: 'visible', timeout: 5_000 })
await shot('01-sider-desc')

// 3. 断言：textarea 初始值 = 示例文件里的原简介
expectEq('编辑栏显示原简介', await textarea.inputValue(), description)

// 4. 修改简介 → 断言脏标记链路（窗口标题出现未保存圆点）
const cleanTitle = await nativeTitle()
expectOk('修改前标题无圆点', !cleanTitle.includes('•'), cleanTitle)
await textarea.fill('冒烟测试：简介已由编辑栏修改')
await page.waitForTimeout(500) // 等 fileDirty → titleService → setWindowTitle
const dirtyTitle = await nativeTitle()
expectOk('修改后标题带圆点', dirtyTitle.startsWith('• '), dirtyTitle)
await shot('02-dirty-dot')

console.log('renderer-errors:', errors.length === 0 ? 'none (ok)' : JSON.stringify(errors, null, 2))
// 简介已改、窗口处于脏状态：app.close() 会触发关闭拦截弹 confirmUnsaved
// 原生对话框（自动化无人应答，永久挂起）。destroy() 跳过 close 事件直接
// 销毁窗口——冒烟到此已验证完毕，无需走保存确认
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})

const ok = failures === 0 && errors.length === 0
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
