// 冒烟驱动：60 秒自动保存不抢编辑状态——自动保存必须隐形（落盘 + 清脏），
// 不得清正在填写的表单、不得把侧边栏跳回属性面板。复现审计中-1：自动保存
// 复用手动保存的 saveFile，成功后无条件 resetSider+resetRefData，正在打字的
// 「新建节点」表单被静默清空且面板被切走。
// 窗口构造：示例卡 filePath='' 不触发自动保存、新建文件首存走原生对话框，
// 且 newChartWindow 直传的 path 不经 fileGuard 授权（PATH_NOT_AUTHORIZED，
// 自动保存必失败、失败分支不重置 UI，测不到目标路径）。故按真实用户流走
// 「打开文件」：主进程 app.evaluate stub dialog.showOpenDialog 指向预创建的
// 临时 .xk，readChartFile 真实读盘并授权，新窗口 hash 路由直达图表页，
// filePath 即该临时文件——自动保存可成功落盘（读写/授权/触发全真实，
// 仅人机入口对话框被替换）。
// 用法：node scripts/smoke-autosave.mjs   （需先 yarn build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.smoke-shots-autosave')
fs.rmSync(SHOT_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })
// 自动保存的落盘目标（放截图专属目录内：清场天然覆盖，且已被 gitignore）。
// 须预创建：FILE_OPEN 的 readChartFile 要真实读它并完成 fileGuard 授权
const TARGET = path.join(SHOT_DIR, 'autosave-target.xk')
fs.writeFileSync(TARGET, JSON.stringify({
  version: 2,
  description: '自动保存冒烟原始简介',
  nodes: [
    { name: '甲', des: '', symbolSize: 40, category: '冒烟' },
    { name: '乙', des: '', symbolSize: 40, category: '冒烟' },
    { name: '丙', des: '', symbolSize: 40, category: '冒烟' }
  ],
  links: [
    { source: '甲', target: '乙', name: '相连', des: '' },
    { source: '乙', target: '丙', name: '相连', des: '' }
  ]
}), 'utf-8')

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
const page1 = await app.firstWindow()
page1.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
page1.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
})

const shot = async (name) => {
  const f = path.join(SHOT_DIR, `${name}.png`)
  await page2.screenshot({ path: f })
  console.log(`shot: ${name}`)
}
// 主进程侧枚举全部窗口标题（新窗口标题含目标文件名，脏圆点在任务栏标题前缀）
const titleOf = async () => {
  const titles = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => w.getTitle())
  )
  return titles
}
const expectOk = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : `：${detail}`}`)
  if (!ok) failures++
}

// 1. 复刻「打开文件」链路开出带可写 filePath 的图表窗口（第二个窗口）：
//    stub 主进程原生对话框指向预创建的 TARGET，走 readChartFile 真实读盘
//    + fileGuard 授权，再 newChartWindow（与 ChartView.openFile 同两步）
await page1.waitForSelector('.xk-example-card', { timeout: 15_000 })
// 注意：ElectronApplication.evaluate 不支持第二参（函数唯一入参是被注入的
// electron 模块对象），且字符串形式只被求值、不会当函数调用——stub 须用
// 函数形式装（路径从 globalThis 取），路径值用字符串赋值表达式写进主进程
await app.evaluate(`globalThis.__smokeTarget = ${JSON.stringify(TARGET)}`)
await app.evaluate(({ dialog }) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [globalThis.__smokeTarget] })
})
const page2Promise = app.waitForEvent('window', { timeout: 15_000 }).catch(() => {
  // show:false 窗口事件偶发不达时按页面枚举兜底
  const pages = app.context().pages()
  return pages.find((p) => p !== page1) || null
})
await page1.evaluate(async () => {
  const res = await window.electronAPI.openFile()
  if (!res || res.canceled || res.alreadyOpen || !res.content) {
    throw new Error(`openFile 意外结果: ${JSON.stringify(res && Object.keys(res))}`)
  }
  await window.electronAPI.newChartWindow({ content: res.content, path: res.path })
})
const page2 = await page2Promise
if (!page2) throw new Error('图表窗口未创建')
page2.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
page2.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
})

// 2. 等图表页就绪（hash 路由直达） + enterChartMode 生效
await page2.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page2.waitForTimeout(1_500)

// 3. 开侧边栏（编辑栏是最后一个工具栏按钮，同 smoke-chart-info），
//    改简介置脏 → 断言脏链路（标题圆点）
await page2.locator('.no-move-button').last().click()
const textarea = page2.locator('.attr-panel textarea')
await textarea.waitFor({ state: 'visible', timeout: 5_000 })
await textarea.fill('自动保存冒烟：简介已修改')
await page2.waitForTimeout(500)
const dirtyTitles = await titleOf()
expectOk(
  '修改简介后标题带圆点',
  dirtyTitles.some((t) => t.includes('•')),
  JSON.stringify(dirtyTitles)
)

// 4. 点「复位视图」把焦点移出 textarea（文本输入上下文会屏蔽 Insert 键），
//    再按 Insert 打开「新建节点」表单，填一个未提交的节点名
await page2.locator('.attr-panel button', { hasText: '复位视图' }).click()
await page2.keyboard.press('Insert')
// XkCreateNode 的名称框是该表单第一个 textarea（:visible 过滤掉 v-show 隐藏的其他表单）
const nameArea = page2.locator('.sider-style form textarea:visible').first()
await nameArea.waitFor({ state: 'visible', timeout: 5_000 })
await nameArea.fill('冒烟半成品节点')
await shot('01-form-filled-dirty')
const formState = await nameArea.inputValue()
expectOk('表单已填入半成品节点名', formState === '冒烟半成品节点', formState)

// 5. 等 60 秒定时器触发自动保存（挂载起算 60s 一跳；此处已耗时约 10s，
//    显式等 70s 覆盖一跳，再轮询标题圆点消失确认保存完成）
await page2.waitForTimeout(70_000)
let saved = false
for (let i = 0; i < 20; i++) {
  const titles = await titleOf()
  if (!titles.some((t) => t.includes('•'))) {
    saved = true
    break
  }
  await page2.waitForTimeout(500)
}
expectOk('自动保存后标题圆点消失（脏已清）', saved)

// 6. 核心断言：正在填写的表单不被清空、侧边栏不跳回属性面板。
//    可见性断言用 :visible 定位器；值读取用 DOM 顺序定位器——XkCreateNode
//    是模板里第一个表单组件，其名称框即第一个 form textarea（v-show 隐藏
//    不改变 DOM 存在性，被切走后仍可读值）
await shot('02-after-autosave')
expectOk(
  '新建节点表单仍可见（未被切走）',
  await page2.locator('.sider-style form textarea:visible').first().isVisible()
)
const keptName = await page2.locator('.sider-style form textarea').first().inputValue()
expectOk('半成品节点名未被清空', keptName === '冒烟半成品节点', keptName)
expectOk(
  '侧边栏未跳回属性面板',
  !(await page2.locator('.attr-panel').isVisible())
)

// 7. 落盘验证：目标文件存在，简介为新值，未提交的表单节点没有入库
let savedChart = null
try {
  savedChart = JSON.parse(fs.readFileSync(TARGET, 'utf-8'))
} catch (err) {
  console.error('读取自动保存目标文件失败', err)
}
expectOk('自动保存已落盘（目标文件存在且可解析）', !!savedChart)
if (savedChart) {
  expectOk('落盘简介为新值', savedChart.description === '自动保存冒烟：简介已修改', savedChart.description)
  expectOk(
    '未提交的表单节点未入库（仍 3 节点）',
    Array.isArray(savedChart.nodes) && savedChart.nodes.length === 3,
    `nodes=${savedChart.nodes?.length}`
  )
}

console.log('renderer-errors:', errors.length === 0 ? 'none (ok)' : JSON.stringify(errors, null, 2))
// 收尾用 destroy：窗口此刻理论上是干净的，但失败场景下状态不可控，
// confirmUnsaved 原生对话框无人应答会永久挂起
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})

const ok = failures === 0 && errors.length === 0
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
