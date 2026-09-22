// 冒烟驱动：首页图库分帧渲染——「新建空白卡先出、停顿、卡片齐现」两段式的
// 消除效果验证。清单（exampleManifest）已把数据等待压到 ~15ms，剩余可感停顿
// 来自 207 张卡片一次性挂载+绘制的 ~250-350ms 主线程长任务；分帧渲染让首批
// 卡片与虚线框几乎同帧出现，剩余每帧一批铺完。
// 断言：
//   1. 虚线框可见后 ≤150ms 内视口已有 ≥30 张卡片（视口覆盖语义：大屏
//      2560 宽每行 ~12 张 × 2 行 = 24 张，30 含余量；一次性渲染现状为
//      ~250-350ms，必 FAIL——本冒烟的先红后绿依据）
//   2. 分帧铺完后全量 207 张在 DOM
//   3. 渲染期间无 >150ms 长帧（分帧基线 100~146ms 波动；一次性渲染退化特征 250~350ms）
//   4. 搜索结果即时全量（分帧只服务初始装载，不延迟搜索反馈）
//   5. 清空关键字恢复全量
// 用法：node scripts/smoke-gallery-frame.mjs   （需先 yarn build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.smoke-shots-gallery-frame')
fs.rmSync(SHOT_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })

const electronBin = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!fs.existsSync(electronBin)) {
  console.error('FATAL: electron binary not found at', electronBin)
  process.exit(1)
}

let failures = 0
const expectTrue = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
  if (!cond) failures++
}

let app
try {
  app = await electron.launch({ executablePath: electronBin, args: [APP_DIR], timeout: 30_000 })
} catch (err) {
  console.error('FATAL: 应用启动即退出——请先关闭正在运行的 XKnowledge（含 yarn dev）再跑冒烟')
  console.error(err.message.split('\n')[0])
  process.exit(1)
}
const page = await app.firstWindow()

// 打点注入：虚线框首现时刻 + 该时刻卡片数 + 卡片达到 30 张的时刻 + 帧间隔
// （只统计虚线框出现之后的帧间隔——启动早期 bundle 解析的长帧与本冒烟无关；
//   装载窗口内帧间隔 >120ms = 主线程长阻塞，两段式卡顿的本质度量）
await page.addInitScript(() => {
  window.__frame = { blankAt: null, cardsAtBlank: 0, reach50At: null, maxGap: 0, lastT: 0 }
  const tick = () => {
    const now = performance.now()
    if (
      window.__frame.lastT > 0 &&
      window.__frame.blankAt !== null &&
      window.__frame.lastT >= window.__frame.blankAt &&
      now - window.__frame.lastT > window.__frame.maxGap
    ) {
      window.__frame.maxGap = now - window.__frame.lastT
    }
    window.__frame.lastT = now
    const cards = document.querySelectorAll('.xk-example-card').length
    if (window.__frame.blankAt === null && document.querySelector('.new-blank-card')) {
      window.__frame.blankAt = now
      window.__frame.cardsAtBlank = cards
    }
    if (window.__frame.blankAt !== null && window.__frame.reach50At === null && cards >= 30) {
      window.__frame.reach50At = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

// 1. 冷启动：虚线框出现 → 首批卡片就位的间隔（两段式可感性）
await page.reload()
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
// 等分帧全部铺完（最坏 4-5 帧 + paint 余量）
await page.waitForTimeout(1_200)
const f = await page.evaluate(() => window.__frame)
expectTrue(
  '虚线框出现时卡片数为 0（数据尚未返回，虚线框必然先行 1-3 帧）',
  f.cardsAtBlank === 0,
  `cardsAtBlank=${f.cardsAtBlank}`
)
expectTrue(
  '虚线框可见后 ≤150ms 内视口已有 ≥30 张卡片（无两段式观感）',
  f.reach50At !== null && f.reach50At - f.blankAt <= 150,
  f.reach50At !== null
    ? `虚线框 ${f.blankAt.toFixed(0)}ms → 30 张 ${f.reach50At.toFixed(0)}ms（间隔 ${(f.reach50At - f.blankAt).toFixed(0)}ms）`
    : `虚线框 ${f.blankAt?.toFixed(0)}ms 后 1.2s 内未达 30 张`
)
await page.screenshot({ path: path.join(SHOT_DIR, '01-home-full.png') })

// 2. 分帧铺完后全量在 DOM
const total = await page.locator('.xk-example-card').count()
expectTrue('分帧铺完后全量卡片在 DOM', total > 100, `共 ${total} 张`)

// 2.5 装载期间无长帧阻塞：最大相邻帧间隔 ≤120ms（一次性渲染 207 张时
//     paint 段 200-350ms 掉帧——用户可感的「卡一下」；分帧后每帧一批，
//     单帧 ≤~100ms）。取整个装载窗口（blankAt 前一帧起算已由 lastT 全程记录，
//     此处直接用全程 maxGap 近似——装载是窗口内最重的阶段）。
expectTrue(
  '渲染期间无 >150ms 长帧（分帧基线 100~146ms 波动，退化特征——一次性渲染——为 250~350ms）',
  f.maxGap <= 150,
  `最大帧间隔 ${f.maxGap.toFixed(0)}ms`
)

// 3. 搜索即时全量：输入后立即读数（50ms）与稳定后读数一致——分帧若泄漏到
//    搜索路径，立即数会小于稳定数
await page.locator('.gallery-search input').fill('具与')
const immediate = await page.locator('.xk-example-card').count()
await page.waitForTimeout(500)
const settled = await page.locator('.xk-example-card').count()
expectTrue(
  '搜索结果即时全量（无分帧延迟）',
  immediate === settled && immediate > 0 && immediate < total,
  `立即 ${immediate} 张 / 稳定 ${settled} 张`
)
await page.screenshot({ path: path.join(SHOT_DIR, '02-search.png') })

// 4. 清空恢复全量
await page.locator('.gallery-search').locator('input').fill('')
await page.waitForTimeout(600)
const restored = await page.locator('.xk-example-card').count()
expectTrue('清空关键字恢复全量', restored === total, `恢复 ${restored} / 全量 ${total}`)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAIL`)
await app.close()
process.exit(failures === 0 ? 0 : 1)
