// 冒烟驱动：图内搜索框跟随主题（回归）——深色主题下 Ctrl+F 的搜索输入框
// 不再是 UA 默认白底。根因：XkGraphSearch/XkWorldSearch 的 <input> 未设
// 背景色，antd reset.css 不覆盖 input 背景，页面也未声明 color-scheme，
// Chromium UA 默认解析为 light → 白底输入框浮在深色浮层上；结果下拉列表
// 走 CSS 变量正常，唯独输入框白（即用户报告「搜索框还是白色，下拉菜单
// 已正确」）。修复：输入框背景透明、文字/占位符走主题变量。
// 断言（像素级——「样式存在」≠「渲染生效」，必须验产物）：
//   1. 深色主题：输入框区域主色为深色（≤60 通道值），修复前为 ~rgb(255,255,255)
//   2. 浅色主题：输入框区域主色为浅色（≥200），不回归
//   3. 计算样式：深色主题下输入框 backgroundColor 不再是纯白
// 截图存 .artifacts/smoke-shots-search-theme/ 供人工目检。
// 用法：node scripts/smoke-search-theme.mjs   （需先 npm run build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.artifacts', 'smoke-shots-search-theme')
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
  // 应用带单实例锁：已有 XKnowledge 实例在跑时新实例直接退出（exitCode 0）
  console.error('FATAL: 应用启动即退出——请先关闭正在运行的 XKnowledge（含 yarn dev）再跑冒烟')
  console.error(err.message.split('\n')[0])
  process.exit(1)
}
const page = await app.firstWindow()
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.waitForTimeout(300)

/** 经设置弹窗显式切主题（不依赖 localStorage 里上次会话的残留偏好） */
const switchTheme = async (label) => {
  await page.locator('#openSettings').click()
  await page.locator('.ant-modal .ant-radio-button-wrapper', { hasText: label }).click()
  await page.locator('.ant-modal-close').click()
  await page.locator('.ant-modal').waitFor({ state: 'hidden', timeout: 5_000 })
  await page.waitForTimeout(300)
}

/**
 * 截取元素区域并在页面内 canvas 解码，返回占比最高的颜色（主色）。
 * 输入框内有占位符文字等少量杂色，主色即背景色。
 */
const dominantColor = async (locator, shotName) => {
  const box = await locator.boundingBox()
  const shotPath = path.join(SHOT_DIR, shotName)
  await page.screenshot({ path: shotPath, clip: box })
  const b64 = fs.readFileSync(shotPath).toString('base64')
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const cv = document.createElement('canvas')
    cv.width = img.width
    cv.height = img.height
    cv.getContext('2d').drawImage(img, 0, 0)
    const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
    const counts = new Map()
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    let best = null
    let bestN = 0
    for (const [k, n] of counts) {
      if (n > bestN) {
        best = k
        bestN = n
      }
    }
    return { rgb: best.split(',').map(Number), share: bestN / (data.length / 4) }
  }, b64)
}

// 1. 首页切深色 → 双击首卡进图表页 → Ctrl+F 开搜索
await switchTheme('深色')
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(3_000) // 等布局稳定 + 首次 zoomToFit 完成
await page.keyboard.press('Control+f')
await page.waitForSelector('.graph-search', { timeout: 5_000 })
await page.waitForTimeout(300)
const input = page.locator('.graph-search-input')
expectTrue('Ctrl+F 搜索浮层打开', await input.isVisible())

// 2. 计算样式：深色下输入框背景不再是 UA 默认纯白
const darkBg = await page.evaluate(
  () => getComputedStyle(document.querySelector('.graph-search-input')).backgroundColor
)
expectTrue(
  '深色主题输入框计算背景非纯白（修复点：脱离 UA 白底）',
  darkBg !== 'rgb(255, 255, 255)',
  darkBg
)

// 3. 像素级：深色下输入框区域主色为深色
const d = await dominantColor(input, '01-dark-input.png')
console.log(`深色采样: rgb(${d.rgb.join(',')}) 占比 ${(d.share * 100).toFixed(0)}%`)
expectTrue(
  '深色主题输入框主色为深色（≤60）',
  d.rgb.every((c) => c <= 60) && d.share >= 0.5,
  `rgb(${d.rgb.join(',')}) share=${(d.share * 100).toFixed(0)}%`
)

// 4. 图表页菜单切回浅色（真实切换链路，不依赖 reload），浅色不回归
await page.locator('.no-move').click()
await page.locator('.ant-dropdown-menu-item', { hasText: '设置' }).click()
await page.locator('.ant-modal .ant-radio-button-wrapper', { hasText: '浅色' }).click()
await page.locator('.ant-modal-close').click()
await page.locator('.ant-modal').waitFor({ state: 'hidden', timeout: 5_000 })
await page.waitForTimeout(300)

const l = await dominantColor(input, '02-light-input.png')
console.log(`浅色采样: rgb(${l.rgb.join(',')}) 占比 ${(l.share * 100).toFixed(0)}%`)
expectTrue(
  '浅色主题输入框主色为浅色（≥200，不回归）',
  l.rgb.every((c) => c >= 200) && l.share >= 0.5,
  `rgb(${l.rgb.join(',')}) share=${(l.share * 100).toFixed(0)}%`
)

await page.screenshot({ path: path.join(SHOT_DIR, '03-light-full.png') })
console.log('shot: 03-light-full')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAIL`)
await app.close()
process.exit(failures === 0 ? 0 : 1)
