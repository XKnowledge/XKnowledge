// 冒烟驱动：首页滚动条跟随主题（bug5 回归）——深色主题下滚动条不再是
// 跟随操作系统的亮色原生滚动条。根因：Electron 44（Chromium 152）滚动条
// 统一化后 ::-webkit-scrollbar 伪元素样式被忽略（样式表里有但渲染不生效，
// 回退为 Windows 浅色原生滚动条）；修复改用标准属性 scrollbar-color
// （thumb/track 双值，跟随 theme.css 主题变量）。
// 2026-10 同根因扩展：设置弹窗内容滚动区（.xk-settings-scroll）同样回退
// 浅色原生滚动条（世界树侧栏/两处搜索列表/3D 图例等无样式滚动容器一并
// 修复，其余位置低频由一次性验证覆盖，此处守护用户报告的设置弹窗）。
// 断言（像素级——本 bug 的教训是「样式存在」≠「渲染生效」，必须验产物）：
//   1. 浅色主题：home 滚动条轨道浅色、滑块可见且浅灰
//   2. 设置弹窗浅/深两主题：轨道随主题（深色 ≤60 通道值）、滑块可区分
//   3. 深色主题（home）：轨道深色、滑块深灰且与轨道可区分
//   4. 两容器 scrollbar-color 计算值非 auto 且按主题切换
// 截图存 .artifacts/smoke-shots-scrollbar-theme/ 供人工目检。
// 用法：node scripts/smoke-scrollbar-theme.mjs   （需先 yarn build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.artifacts', 'smoke-shots-scrollbar-theme')
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
 * 截取容器右缘滚动条区域并在页面内 canvas 解码采样：
 * 取滚动条条带中心列的逐行颜色，按出现频次得出轨道色（占比最高）与
 * 滑块色（与轨道不同的最长连续色段——scrollTop 置顶时滑块在顶部短条）。
 * sel 参数化以覆盖多处滚动容器（home 内容区 + 设置弹窗）。
 */
const scrollbarColors = async (sel, shotName) => {
  const dpr = await page.evaluate(() => window.devicePixelRatio)
  const box = await page.locator(sel).boundingBox()
  const clip = { x: box.x + box.width - 30, y: box.y, width: 30, height: Math.min(600, box.height) }
  const shotPath = path.join(SHOT_DIR, shotName)
  await page.evaluate((sel) => {
    // 滚到中部让比例滑块落在采样区间（15%-95%）内；置顶时滑块在顶部 ~4% 内
    const el = document.querySelector(sel)
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
  }, sel)
  await page.waitForTimeout(200)
  await page.screenshot({ path: shotPath, clip })
  const b64 = fs.readFileSync(shotPath).toString('base64')
  return page.evaluate(
    async ({ b64, dpr, sel }) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const cv = document.createElement('canvas')
      cv.width = img.width
      cv.height = img.height
      cv.getContext('2d').drawImage(img, 0, 0)
      // 滚动条占 .inner-div 右缘 ~17-21 CSS px，条带中心取右缘内 8 CSS px
      const x = img.width - Math.round(8 * dpr)
      const counts = new Map()
      const rows = []
      for (let y = Math.round(img.height * 0.15); y < img.height * 0.95; y++) {
        const [r, g, b] = cv.getContext('2d').getImageData(x, y, 1, 1).data
        const key = `${r},${g},${b}`
        counts.set(key, (counts.get(key) || 0) + 1)
        rows.push(key)
      }
      // 轨道 = 采样列中出现最多的颜色
      let track = null
      let trackN = 0
      for (const [k, n] of counts) {
        if (n > trackN) {
          track = k
          trackN = n
        }
      }
      // 滑块 = 与轨道不同的最长连续段（跳过抗锯齿过渡色：允许段内混入出现
      // 次数 <5 的杂色）
      let thumb = null
      let bestLen = 0
      let curColor = null
      let curLen = 0
      for (const key of rows) {
        if (key === track) {
          if (curColor && curLen > bestLen) {
            bestLen = curLen
            thumb = curColor
          }
          curColor = null
          curLen = 0
          continue
        }
        if (curColor === null) {
          curColor = key
          curLen = 1
        } else {
          curLen++
        }
      }
      if (curColor && curLen > bestLen) thumb = curColor
      const rgb = (s) => s.split(',').map(Number)
      return { track: rgb(track), thumb: thumb ? rgb(thumb) : null }
    },
    { b64, dpr, sel }
  )
}

// 1. 浅色主题：轨道浅、滑块浅灰可辨
await switchTheme('浅色')
let s = await scrollbarColors('.inner-div', '01-light-scrollbar.png')
console.log(
  `浅色采样: track=rgb(${s.track.join(',')}) thumb=${s.thumb ? `rgb(${s.thumb.join(',')})` : '未检出'}`
)
expectTrue(
  '浅色主题滚动条轨道为浅色',
  s.track.every((c) => c >= 200),
  `rgb(${s.track.join(',')})`
)
expectTrue('浅色主题滑块可见（与轨道有色差）', s.thumb !== null, '')
expectTrue(
  '浅色主题滑块为浅灰',
  s.thumb !== null && s.thumb.every((c) => c >= 180),
  s.thumb ? `rgb(${s.thumb.join(',')})` : ''
)

// 2. 设置弹窗（2026-10 bug：弹窗内容滚动区无滚动条样式，深色下回退
//    系统浅色原生滚动条——同 .inner-div 根因，本守护同步覆盖）。
//    弹窗保持打开态在弹窗内直接切主题，两主题各采样一次。
await page.locator('#openSettings').click()
await page.locator('.xk-settings-scroll').waitFor({ state: 'visible', timeout: 5_000 })
s = await scrollbarColors('.xk-settings-scroll', '03-light-settings.png')
console.log(
  `浅色设置弹窗采样: track=rgb(${s.track.join(',')}) thumb=${s.thumb ? `rgb(${s.thumb.join(',')})` : '未检出'}`
)
expectTrue(
  '浅色主题设置弹窗轨道为浅色',
  s.track.every((c) => c >= 200),
  `rgb(${s.track.join(',')})`
)
await page.locator('.ant-modal .ant-radio-button-wrapper', { hasText: '深色' }).click()
await page.waitForTimeout(300)
s = await scrollbarColors('.xk-settings-scroll', '04-dark-settings.png')
console.log(
  `深色设置弹窗采样: track=rgb(${s.track.join(',')}) thumb=${s.thumb ? `rgb(${s.thumb.join(',')})` : '未检出'}`
)
expectTrue(
  '深色主题设置弹窗轨道为深色（修复点：不再回退亮色原生滚动条）',
  s.track.every((c) => c <= 60),
  `rgb(${s.track.join(',')})`
)
expectTrue(
  '深色主题设置弹窗滑块深灰且与轨道可区分',
  s.thumb !== null &&
    s.thumb.every((c) => c <= 120) &&
    Math.max(...s.thumb.map((c, i) => Math.abs(c - s.track[i]))) >= 15,
  s.thumb ? `rgb(${s.thumb.join(',')})` : ''
)
await page.locator('.ant-modal-close').click()
await page.locator('.ant-modal').waitFor({ state: 'hidden', timeout: 5_000 })
await page.waitForTimeout(300)

// 3. 深色主题（home 内容区）：轨道深色（修复前为操作系统浅色原生滚动条
//    ~rgb(252,252,252)）——上一步已在弹窗内把应用切到深色
s = await scrollbarColors('.inner-div', '02-dark-scrollbar.png')
console.log(
  `深色采样: track=rgb(${s.track.join(',')}) thumb=${s.thumb ? `rgb(${s.thumb.join(',')})` : '未检出'}`
)
expectTrue(
  '深色主题滚动条轨道为深色（修复点：不再回退亮色原生滚动条）',
  s.track.every((c) => c <= 60),
  `rgb(${s.track.join(',')})`
)
expectTrue(
  '深色主题滑块深灰且与轨道可区分',
  s.thumb !== null &&
    s.thumb.every((c) => c <= 120) &&
    Math.max(...s.thumb.map((c, i) => Math.abs(c - s.track[i]))) >= 15,
  s.thumb ? `rgb(${s.thumb.join(',')})` : ''
)

// 4. 计算值随主题切换（样式确实落在元素上——两容器都验）
const computed = await page.evaluate(() => {
  const probe = (sel) => {
    document.documentElement.dataset.theme = 'light'
    const light = getComputedStyle(document.querySelector(sel)).scrollbarColor
    document.documentElement.dataset.theme = 'dark'
    const dark = getComputedStyle(document.querySelector(sel)).scrollbarColor
    return { light, dark }
  }
  return { inner: probe('.inner-div'), settings: probe('.xk-settings-scroll') }
})
for (const [name, c] of Object.entries(computed)) {
  expectTrue(
    `${name} scrollbar-color 计算值非 auto 且两主题不同`,
    c.light !== 'auto' && c.dark !== 'auto' && c.light !== c.dark,
    JSON.stringify(c)
  )
}

await page.screenshot({ path: path.join(SHOT_DIR, '05-dark-full.png') })
console.log('shot: 05-dark-full')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAIL`)
await app.close()
process.exit(failures === 0 ? 0 : 1)
