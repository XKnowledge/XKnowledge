// 冒烟驱动：深色主题图标反色——黑色 PNG 工具栏图标（.no-move-button img）与
// 菜单图标（.no-move img）在 #1f1f1f 深色标题栏下几乎隐形，theme.css 为
// :root[data-theme='dark'] 增加 invert(1) 反色规则。本冒烟走真实用户流全链路
// 验证：首页设置弹窗显式切深色 → 双击示例进图表页 → 断言 data-theme / 标题栏
// 底色 / 全部图标 filter= invert → 经图表页菜单「设置」入口切回浅色（顺带覆盖
// 该入口）→ 断言 filter 复原 none。截图存 .smoke-shots-theme-icons/（专属目录
// 防与其他脚本互相清场）供人工目检深浅两版标题栏。
// 用法：node scripts/smoke-theme-icons.mjs   （需先 yarn build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.smoke-shots-theme-icons')
fs.rmSync(SHOT_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })

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
const page = await app.firstWindow()
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
})

const expectOk = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : `：${detail}`}`)
  if (!ok) failures++
}
const shotHeader = async (name) => {
  await page.locator('.move-show').screenshot({ path: path.join(SHOT_DIR, `${name}.png`) })
  console.log(`shot: ${name}`)
}

/** 图表页图标环境快照：data-theme / 标题栏底色 / 图标数 / filter 去重集 */
const iconState = () =>
  page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.no-move-button img, .no-move img')]
    const bg = getComputedStyle(document.querySelector('.move-show')).backgroundColor
    const m = bg.match(/\d+/g)?.map(Number)
    return {
      theme: document.documentElement.dataset.theme,
      headerBg: bg,
      // 通道均值：黑图标可读性的先决条件是底色够深。不断言精确值——
      // antd darkAlgorithm 的 .ant-layout-header(#001529) 与 .move-show 的
      // var(--xk-bg-layout)(#1f1f1f) 同优先级、注入顺序决胜，谁是最终
      // 底色属框架行为，两者皆深即可
      headerBgDim: m ? m.slice(0, 3).every((c) => c <= 60) : false,
      imgCount: imgs.length,
      filters: [...new Set(imgs.map((el) => getComputedStyle(el).filter))]
    }
  })

// 1. 首页：设置弹窗显式切深色（显式选择排除 auto×系统偏好组合的环境差异）
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('#openSettings').click()
await page.locator('.ant-modal .ant-radio-button-wrapper', { hasText: '深色' }).click()
await page.locator('.ant-modal-close').click()
await page.locator('.ant-modal').waitFor({ state: 'hidden', timeout: 5_000 })

// 2. 双击首个示例卡同窗口进入图表页
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(1_500) // 等 enterChartMode 生效

// 3. 深色断言：主题标记 / 标题栏底色够深 / 6 个图标（5 工具栏+1 菜单）全 invert
let s = await iconState()
expectOk('深色主题生效', s.theme === 'dark', `data-theme=${s.theme}`)
expectOk('标题栏深色底', s.headerBgDim, s.headerBg)
expectOk('图标齐全（5 工具栏 + 1 菜单）', s.imgCount === 6, `实际 ${s.imgCount}`)
expectOk(
  '深色下全部图标反色',
  s.filters.length === 1 && s.filters[0].includes('invert'),
  JSON.stringify(s.filters)
)
await shotHeader('01-dark-header')
await page.screenshot({ path: path.join(SHOT_DIR, '02-dark-full.png') })
console.log('shot: 02-dark-full')

// 4. 图表页菜单「设置」二次入口切回浅色（顺带覆盖该入口可用性）
await page.locator('.no-move').click()
await page.locator('.ant-dropdown-menu-item', { hasText: '设置' }).click()
await page.locator('.ant-modal .ant-radio-button-wrapper', { hasText: '浅色' }).click()
await page.locator('.ant-modal-close').click()
await page.locator('.ant-modal').waitFor({ state: 'hidden', timeout: 5_000 })
await page.waitForTimeout(300)

// 5. 浅色断言：filter 复原 none，反色规则不再命中
s = await iconState()
expectOk('浅色主题生效', s.theme === 'light', `data-theme=${s.theme}`)
expectOk('浅色下图标不反色', s.filters.length === 1 && s.filters[0] === 'none', JSON.stringify(s.filters))
await shotHeader('03-light-header')

console.log('renderer-errors:', errors.length === 0 ? 'none (ok)' : JSON.stringify(errors, null, 2))
// 未做任何数据编辑，无脏态确认弹窗风险；destroy 兜底防意外挂起
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().forEach((w) => w.destroy())
})
await app.close().catch(() => {})

const ok = failures === 0 && errors.length === 0
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
