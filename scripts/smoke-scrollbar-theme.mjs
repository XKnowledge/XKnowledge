// 冒烟驱动：首页滚动条跟随主题（bug5 回归）——深色主题下滚动条不再是
// 跟随操作系统的亮色原生滚动条。根因：Electron 44（Chromium 152）滚动条
// 统一化后 ::-webkit-scrollbar 伪元素样式被忽略（样式表里有但渲染不生效，
// 回退为 Windows 浅色原生滚动条）；修复改用标准属性 scrollbar-color
// （thumb/track 双值，跟随 theme.css 主题变量）。
// 断言（像素级——本 bug 的教训是「样式存在」≠「渲染生效」，必须验产物）：
//   1. 浅色主题：滚动条轨道浅色、滑块可见且浅灰
//   2. 深色主题：滚动条轨道深色（≤60 通道值）、滑块深灰且与轨道可区分
//   3. .inner-div 的 scrollbar-color 计算值非 auto 且按主题切换
// 截图存 .smoke-shots-scrollbar-theme/ 供人工目检。
// 用法：node scripts/smoke-scrollbar-theme.mjs   （需先 yarn build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.smoke-shots-scrollbar-theme')
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
 * 截取 .inner-div 右缘滚动条区域并在页面内 canvas 解码采样：
 * 取滚动条条带中心列的逐行颜色，按出现频次得出轨道色（占比最高）与
 * 滑块色（与轨道不同的最长连续色段——scrollTop 置顶时滑块在顶部短条）。
 */
const scrollbarColors = async (shotName) => {
  const dpr = await page.evaluate(() => window.devicePixelRatio)
  const box = await page.locator('.inner-div').boundingBox()
  const clip = { x: box.x + box.width - 30, y: box.y, width: 30, height: Math.min(600, box.height) }
  const shotPath = path.join(SHOT_DIR, shotName)
  await page.evaluate(() => {
    // 滚到中部让比例滑块落在采样区间（15%-95%）内；置顶时滑块在顶部 ~4% 内
    const el = document.querySelector('.inner-div')
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
  })
  await page.waitForTimeout(200)
  await page.screenshot({ path: shotPath, clip })
  const b64 = fs.readFileSync(shotPath).toString('base64')
  return page.evaluate(
    async ({ b64, dpr }) => {
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
    { b64, dpr }
  )
}

// 1. 浅色主题：轨道浅、滑块浅灰可辨
await switchTheme('浅色')
let s = await scrollbarColors('01-light-scrollbar.png')
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

// 2. 深色主题：轨道深色（修复前为操作系统浅色原生滚动条 ~rgb(252,252,252)）
await switchTheme('深色')
s = await scrollbarColors('02-dark-scrollbar.png')
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

// 3. 计算值随主题切换（样式确实落在元素上）
const computed = await page.evaluate(() => {
  document.documentElement.dataset.theme = 'light'
  const light = getComputedStyle(document.querySelector('.inner-div')).scrollbarColor
  document.documentElement.dataset.theme = 'dark'
  const dark = getComputedStyle(document.querySelector('.inner-div')).scrollbarColor
  return { light, dark }
})
expectTrue(
  'scrollbar-color 计算值非 auto 且两主题不同',
  computed.light !== 'auto' && computed.dark !== 'auto' && computed.light !== computed.dark,
  JSON.stringify(computed)
)

await page.screenshot({ path: path.join(SHOT_DIR, '03-dark-full.png') })
console.log('shot: 03-dark-full')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAIL`)
await app.close()
process.exit(failures === 0 ? 0 : 1)
