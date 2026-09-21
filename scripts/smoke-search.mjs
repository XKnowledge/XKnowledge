// 冒烟驱动：首页图库搜索——验证搜索框与「示例图库」标题同行、部分子串过滤
// （搜「具与」命中「玩具与桌游」）、搜索时隐藏新建空白首卡、无匹配空态、
// 清空后恢复全量、全量卡片按标题拼音 A→Z 排列。覆盖 filterExamples /
// sortExamples 纯函数在真实渲染链路上的行为。
// 用法：node scripts/smoke-search.mjs   （需先 npm run build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 专属截图目录：.smoke-shots 被多个冒烟脚本共用且都会 rmSync 清场，
// 并行跑时会互相删图，故本脚本默认用独立目录（可用 SMOKESHOT_DIR 覆盖）
const SHOT_DIR = process.env.SMOKESHOT_DIR
  ? path.resolve(APP_DIR, process.env.SMOKESHOT_DIR)
  : path.join(APP_DIR, '.smoke-shots-search')
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
const cardCount = () => page.locator('.xk-example-card').count()
const cardTitles = async () =>
  (await page.locator('.xk-example-card .name').allInnerTexts()).map((s) => s.trim())

// 1. 首页加载：搜索框与标题在同一行（垂直中心距离 < 行高一半）
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
const total = await cardCount()
expectTrue('示例卡加载', total > 100, `共 ${total} 张`)
const titleBox = await page.locator('.gallery-header h2').boundingBox()
const searchBox = await page.locator('.gallery-search').boundingBox()
const sameRow =
  titleBox && searchBox && Math.abs(titleBox.y + titleBox.height / 2 - (searchBox.y + searchBox.height / 2)) < 25
expectTrue('搜索框与标题同行', sameRow, `title y=${titleBox?.y?.toFixed(0)} search y=${searchBox?.y?.toFixed(0)}`)
await shot('01-home')

// 1.5 色点封顶：最大分类卡「茶」（17 分类，饮食与风味拆分后居首）点数与类目数
//     一致、无 +N 收纳点、描述行仍在（未被色点挤没）；普通卡无 +N 点。
//     18 封顶 + 「+N」路径需 ≥19 分类的卡，饮食拆分（19→7 类）后库中暂无，
//     该防御逻辑仍在组件内但无真实图可触发
const bigCard = page
  .locator('.xk-example-card')
  .filter({ has: page.locator('.name', { hasText: /^茶$/ }) })
  .first()
await bigCard.scrollIntoViewIfNeeded()
expectEq('最大卡色点数（=类目数 17）', await bigCard.locator('.dot').count(), 17)
expectTrue('最大卡无 +N 点', (await bigCard.locator('.dot-more').count()) === 0)
expectTrue('最大卡描述行未被挤没', await bigCard.locator('.desc').isVisible())
const normalCard = page.locator('.xk-example-card', { hasText: '玩具与桌游' }).first()
expectTrue('普通卡无 +N 点', (await normalCard.locator('.dot-more').count()) === 0)
await shot('01b-dots-capped')

// 1.6 拼音排序：全量卡片标题按 localeCompare('zh-CN') 单调不降
//     （sortExamples 载入即排序在真实渲染链路上的兑现；断言单调性而非
//      逐对硬编码，图库增删示例不致脆断）
const allTitles = await cardTitles()
let monotonic = true
for (let i = 1; i < allTitles.length; i++) {
  if (allTitles[i - 1].localeCompare(allTitles[i], 'zh-CN') > 0) {
    monotonic = false
    break
  }
}
expectTrue(
  '卡片按标题拼音 A→Z 排列',
  monotonic,
  `共 ${allTitles.length} 张，首三：${allTitles.slice(0, 3).join('、')}`
)
// 截图前回顶：1.5 的 scrollIntoViewIfNeeded 把视口留在图库中段，
// 不回顶则 01c 拍不到首行（新建空白卡 + 拼音首三张），截图无法佐证断言
await page.evaluate(() => {
  const el = document.querySelector('.inner-div')
  if (el) el.scrollTop = 0
})
await shot('01c-sorted')

// 2. 部分子串搜索：「具与」命中「玩具与桌游」（跨标题/描述/分类共 6 张，断言用包含式防图库演进脆断）
const input = page.locator('.gallery-search input')
await input.fill('具与')
await page.waitForTimeout(300)
const hitTitles = await cardTitles()
expectTrue('命中包含「玩具与桌游」', hitTitles.includes('玩具与桌游'), `共 ${hitTitles.length} 张`)
expectTrue('命中包含「文具与书写工具」', hitTitles.includes('文具与书写工具'))
expectTrue('搜索时隐藏新建空白卡', !(await page.locator('.new-blank-card').isVisible()))
await shot('02-search-partial')

// 3. 「风土」按分类子串命中「茶」（山头风土）与「葡萄酒」（品鉴与风土，咖啡茶与
//    葡萄酒并入后的新增命中）；「饮食与风味」的「产地风土」类目已随咖啡部分迁出
await input.fill('风土')
await page.waitForTimeout(300)
const fengtu = await cardTitles()
expectTrue('分类命中「茶」', fengtu.includes('茶'), `共 ${fengtu.length} 张`)
expectTrue('分类命中「葡萄酒」', fengtu.includes('葡萄酒'))
await shot('03-search-desc')

// 4. 无匹配：空态文案区分
await input.fill('量子色动力学不存在')
await page.waitForTimeout(300)
expectEq('无匹配卡片数', await cardCount(), 0)
expectTrue('空态显示「无匹配的示例」', await page.getByText('无匹配的示例').isVisible())
await shot('04-no-hit')

// 5. 清空（allowClear 的叉）恢复全量与首卡
await page.locator('.ant-input-clear-icon').click()
await page.waitForTimeout(300)
expectEq('清空后恢复全量', await cardCount(), total)
expectTrue('清空后新建空白卡回归', await page.locator('.new-blank-card').isVisible())
await shot('05-cleared')

// 6. 滚到底留隙：末行卡片与视口底边至少隔 10px，不贴窗口底。
//    滚动与测量都在页面内做——Playwright 的 boundingBox 跨内部滚动容器
//    （.inner-div 自滚）时坐标与视口对不上，量出过假值。
//    .content 的 padding-bottom 30px 经 Chromium 末端 padding 截断后
//    实际兑现约 13px，阈值取 10 留余量（AddView.vue 注释有说明）
const gap = await page.evaluate(() => {
  const el = document.querySelector('.inner-div')
  if (el) el.scrollTop = el.scrollHeight
  const cards = document.querySelectorAll('.xk-example-card')
  const last = cards[cards.length - 1]
  return last ? window.innerHeight - last.getBoundingClientRect().bottom : -1
})
await page.waitForTimeout(300)
expectTrue('滚到底卡片与底边留隙', gap >= 10, `gap=${Math.round(gap)}px`)
await shot('06-bottom-gap')

console.log(errors.length ? `渲染错误 ${errors.length} 条:` : '渲染无错误', errors)
await app.close()
process.exitCode = failures === 0 && errors.length === 0 ? 0 : 1
