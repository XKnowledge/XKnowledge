// 冒烟：双击 .xk 打开文件。系统传给 exe 的参数形态就是「唯一路径参数」——
// 与安装器写入的 .xk 关联（XKnowledge.exe "%1"）完全同一条链路，故用
// 命令行参数启动即等价于双击。
// 覆盖：主进程取参 → 读盘校验 → 直接开图表窗口（不闪首页）→ 渲染端装载
// → 文件身份登记（标题显示文件名）。第二段再启一个进程，验证「已运行状态
// 下双击另一个文件」走 second-instance 并新开窗口。
// 用法：node scripts/smoke-open-file.mjs   （需先 yarn build）
import { _electron as electron } from 'playwright-core'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.artifacts', 'smoke-shots')
const WORK_DIR = path.join(APP_DIR, '.artifacts', 'smoke-open-file')
fs.rmSync(WORK_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })
fs.mkdirSync(WORK_DIR, { recursive: true })

const electronBin = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!fs.existsSync(electronBin)) {
  console.error('FATAL: electron binary not found at', electronBin)
  process.exit(1)
}

// 用内置示例当素材，但复制到工作目录：示例目录内的路径走「副本语义」，
// 这里要验证的是普通文件（有路径、保存直接写回）
const examplesDir = path.join(APP_DIR, 'examples')
const source = fs
  .readdirSync(examplesDir)
  .filter((f) => f.toLowerCase().endsWith('.xk'))
  .map((f) => path.join(examplesDir, f))[0]
if (!source) {
  console.error('FATAL: no .xk example found')
  process.exit(1)
}
const firstFile = path.join(WORK_DIR, '双击测试图谱.xk')
const secondFile = path.join(WORK_DIR, '第二个文件.xk')
fs.copyFileSync(source, firstFile)
fs.copyFileSync(source, secondFile)

const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
}

const errors = []
const app = await electron.launch({
  executablePath: electronBin,
  args: [APP_DIR, firstFile],
  timeout: 30_000
})

try {
  const page = await app.firstWindow()
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
  })

  // 1) 冷启动直接进图表页：不应先出现首页图库
  await page.waitForSelector('.graph3d-container', { timeout: 20_000 })
  const homeCards = await page.locator('.xk-example-card').count()
  if (homeCards !== 0) fail(`冷启动应直接进图表页，但首页卡片仍可见（${homeCards} 张）`)

  // 2) 文件身份登记完成 → 标题条显示文件名（而不是「未命名」）
  await page.waitForFunction(
    () => document.querySelector('.xk-title-text')?.textContent?.includes('双击测试图谱'),
    null,
    { timeout: 10_000 }
  )
  const titleText = (await page.locator('.xk-title-text').first().textContent())?.trim()
  if (!titleText?.includes('双击测试图谱')) fail(`标题未显示文件名：${titleText}`)
  console.log(`标题条：${titleText}`)

  // 3) 图形真的渲染出来了（不是空壳页面）
  await page.waitForTimeout(1_500)
  const nodes = await page.locator('.graph3d-container canvas').count()
  if (nodes === 0) fail('图表页没有 canvas，3D 画布未渲染')

  // 4) 主进程侧：窗口标题（任务栏）与可调尺寸（enterChartMode 已生效）
  const state = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return {
      title: w.getTitle(),
      resizable: w.isResizable(),
      count: BrowserWindow.getAllWindows().length
    }
  })
  if (!state.title.includes('双击测试图谱')) fail(`任务栏标题不对：${state.title}`)
  if (!state.resizable) fail('图表窗口未解锁尺寸（enterChartMode 未生效）')
  if (state.count !== 1) fail(`冷启动应只有 1 个窗口，实际 ${state.count}`)

  await page.screenshot({ path: path.join(SHOT_DIR, 'open-file-chart.png') })

  // 5) 已运行状态下「再双击」另一个文件：第二个进程抢不到单实例锁而立即退出，
  //    路径经 second-instance 转交主实例 → 新开一个图表窗口
  const child = spawn(electronBin, [APP_DIR, secondFile], { stdio: 'ignore' })
  await new Promise((resolve, reject) => {
    child.on('exit', resolve)
    child.on('error', reject)
  })
  // 窗口一出现时渲染层还在装载，标题要等 file:opened 上报后才变成文件名
  const deadline = Date.now() + 25_000
  let titles = []
  while (Date.now() < deadline) {
    titles = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => w.getTitle())
    )
    if (titles.length === 2 && titles.some((t) => t.includes('第二个文件'))) break
    await new Promise((r) => setTimeout(r, 300))
  }
  if (titles.length !== 2) fail(`第二次双击应新开窗口，实际窗口数 ${titles.length}`)
  if (!titles.some((t) => t.includes('第二个文件'))) fail(`第二窗口标题不对：${titles.join(' | ')}`)
  console.log(`窗口标题：${titles.join(' | ')}`)
} finally {
  await app.close()
}

if (errors.length) {
  console.error('渲染进程错误：')
  for (const e of errors) console.error('  ' + e)
  process.exitCode = 1
}

console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED')
