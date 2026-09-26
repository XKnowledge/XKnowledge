// 冒烟驱动：世界树——首页入口进入、全景渲染、Ctrl+F 全库搜索、
// 搜索跳转自动展开（展开列表出现 + 相机飞达）。覆盖 WorldView /
// XkWorldGraph / worldGraph.js 在真实渲染链路上的行为。
// 用法：node scripts/smoke-world.mjs   （需先 npm run build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 专属截图目录（避免与其他冒烟脚本并行互删，同 smoke-search 惯例）
const SHOT_DIR = process.env.SMOKESHOT_DIR
  ? path.resolve(APP_DIR, process.env.SMOKESHOT_DIR)
  : path.join(APP_DIR, '.smoke-shots-world')
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
  // 应用带单实例锁：已有 XKnowledge 实例在跑时新实例直接退出
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
const expectTrue = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
  if (!cond) failures++
}

// bug记录 #1 回归锚点：逐帧盯文档溢出态——画布曾以库默认 window 尺寸
// （比容器高 53px）创建，首帧溢出闪双向滚动条，场景构建长帧把溢出画足
// 数百毫秒才被 ResizeObserver 修正；修复后应全程零溢出帧
await page.evaluate(() => {
  window.__ovfFrames = 0
  const tick = () => {
    const de = document.documentElement
    if (de.scrollWidth > de.clientWidth || de.scrollHeight > de.clientHeight) {
      window.__ovfFrames++
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

// 场景 1：首页入口 → 世界全景
await page.evaluate(() => (window.__ovfFrames = 0)) // 只统计世界页打开后的帧
await page.locator('#openWorld').click()
await page.waitForSelector('.world-graph-container canvas', { timeout: 60_000 }) // 首建全量扫描放宽
await page.waitForTimeout(4_000) // 力布局铺开 + 标签渲染
await shot('world-overview')
expectTrue(
  '世界页打开全程无文档溢出',
  (await page.evaluate(() => window.__ovfFrames)) === 0,
  `溢出帧 ${await page.evaluate(() => window.__ovfFrames)}`
)
expectTrue(
  '世界页头部按钮',
  (await page.locator('.world-header button', { hasText: '图库目录' }).count()) === 1
)
// 头部拖动区回归：titleBarStyle hidden 后窗口拖动全靠 CSS 区域声明，曾整页漏配
// drag 致世界页不可拖（图表页正常）。只断言 CSS 区域——合成鼠标事件触发原生
// 拖动在 CDP 下不稳定，不做窗口位移断言；按钮 no-drag 保证拖动语义不吞点击
const dragRegions = await page.evaluate(() => ({
  header: getComputedStyle(document.querySelector('.world-header')).webkitAppRegion,
  button: getComputedStyle(document.querySelector('.world-header .ant-btn')).webkitAppRegion
}))
expectTrue('头部为窗口拖动区', dragRegions.header === 'drag', `实际 ${dragRegions.header}`)
expectTrue('头部按钮 no-drag 可点击', dragRegions.button === 'no-drag', `实际 ${dragRegions.button}`)

// 场景 2：Ctrl+F 全库搜索
await page.keyboard.press('Control+f')
await page.waitForSelector('.world-search')
await page.locator('.world-search-input').fill('化学')
await page.waitForTimeout(500)
const hitCount = await page.locator('.world-search-item').count()
expectTrue('全库搜索有命中', hitCount > 0, `命中 ${hitCount} 项`)
const firstHit = (await page.locator('.world-search-item').first().textContent()) ?? ''
expectTrue('命中为「图名 › 节点名」两级', firstHit.includes('›'), firstHit.trim().slice(0, 40))
await shot('world-search')

// 场景 3：回车跳转 → 自动展开（展开列表出现 = 展开链路全通）
await page.keyboard.press('Enter')
await page.waitForSelector('.world-expanded-bar', { timeout: 20_000 })
await page.waitForTimeout(2_000) // 相机飞行
await shot('world-expanded')
expectTrue('展开列表出现', (await page.locator('.world-expanded-bar .ant-tag').count()) === 1)

expectTrue('无页面错误', errors.length === 0, errors.join(' | '))
await app.close()
if (failures > 0) {
  console.error(`\n${failures} 项失败`)
  process.exit(1)
}
console.log('\n全部通过')
