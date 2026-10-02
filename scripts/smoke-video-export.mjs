// 冒烟驱动：生产构建启动应用，双击首页示例卡进入图表页，验证视频导出/
// 录屏全链路状态机——环绕（orbit 锚点 + 按钮态 + Esc 取消 + 跑满成功 toast）、
// 录屏（screen 锚点 + danger 按钮 + 停止 + toast）、两态互斥 disabled、
// 渲染进程零错误。录制中的旋转视觉与水印由截图人工复核（02b/02c 两帧对比）。
// 用法：node scripts/smoke-video-export.mjs   （需先 npm run build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.smoke-shots')
fs.rmSync(SHOT_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })
// 视频落盘目录：主进程 saveVideoFile 见 XK_SMOKE_VIDEO_DIR 时跳过系统
// 保存框（模态框在无人值守环境挂死）直接写这里——冒烟借此硬断言产物
const VIDEO_DIR = path.join(APP_DIR, '.smoke-video')
fs.rmSync(VIDEO_DIR, { recursive: true, force: true })
fs.mkdirSync(VIDEO_DIR, { recursive: true })

const electronBin = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!fs.existsSync(electronBin)) {
  console.error('FATAL: electron binary not found at', electronBin)
  process.exit(1)
}

const errors = []
let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${label}:`, ok ? 'ok' : `FAIL ${detail}`)
  if (!ok) failures++
}
const app = await electron.launch({
  executablePath: electronBin,
  args: [APP_DIR],
  env: { ...process.env, XK_SMOKE_VIDEO_DIR: VIDEO_DIR },
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

// toast 文本断言：antd message 容器整体 includes（多条堆叠互不干扰）
const waitForToast = async (text, timeout = 5000) => {
  try {
    await page.waitForFunction(
      (t) =>
        [...document.querySelectorAll('.ant-message-notice')].some((el) =>
          el.textContent.includes(t)
        ),
      text,
      { timeout }
    )
    return true
  } catch {
    return false
  }
}

const recordingState = () =>
  page.evaluate(() => document.querySelector('.graph3d-wrap')?.dataset.videoRecording ?? '')
const exportBtn = page.locator('[data-export-video]')
const recordBtn = page.locator('[data-screen-record]')
const resetBtn = page.locator('[data-reset-view]')
// 按钮文案断言统一去空白：antd 对恰好两个汉字的按钮（「录屏」）自动在
// 中间插空格排版，textContent 是「录 屏」；strip 后断言不受此特性干扰
const labelOf = async (btn) => (await btn.textContent()).replace(/\s+/g, '')

// 1. 首页双击示例卡进图表页
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(3_000) // 布局稳定 + 首次取景

// 1.1 开侧栏（「编辑栏」按钮，同 smoke-marquee 的 nth(2) 惯例）：视图按钮区
// 在侧栏内，默认收起时不可见
await page.locator('.no-move-button').nth(2).click()
await page.waitForTimeout(500)

// 2. 按钮存在 + 初始文案 + 无录制
check('buttons-present', (await exportBtn.count()) === 1 && (await recordBtn.count()) === 1)
check(
  'initial-labels',
  (await labelOf(exportBtn)) === '环绕录制' && (await labelOf(recordBtn)) === '导出录屏'
)
check('initial-no-recording', (await recordingState()) === '')

// 3. 环绕：点「导出视频」→ orbit 锚点 + 按钮态 + 互斥（录屏 disabled）
await exportBtn.click()
await page.waitForTimeout(500)
check('orbit-anchor', (await recordingState()) === 'orbit')
check('orbit-label-recording', (await labelOf(exportBtn)) === '录制中…')
check('orbit-export-disabled', await exportBtn.isDisabled())
check('orbit-screen-record-disabled', await recordBtn.isDisabled())
// 环绕录制中视角/布局入口须锁（复位视图飞相机+取景会毁掉录制）
check('orbit-reset-view-disabled', await resetBtn.isDisabled())
await shot('02a-orbit-start')
await page.waitForTimeout(2_000)
await shot('02b-orbit-mid') // 与 02c 对比人工复核旋转

// 4. Esc 取消：提前恢复 + 取消 toast
await page.keyboard.press('Escape')
await page.waitForTimeout(1_000)
check('esc-cancel-restored', (await recordingState()) === '')
check('esc-cancel-label', (await labelOf(exportBtn)) === '环绕录制')
check('esc-cancel-toast', await waitForToast('已取消环绕录制'))

// 5. 再跑满一次环绕（默认 10s）：成功 toast + 恢复
await exportBtn.click()
await page.waitForTimeout(500)
check('orbit-again-anchor', (await recordingState()) === 'orbit')
await shot('02c-orbit-running')
await page.waitForTimeout(11_000)
check('orbit-done-restored', (await recordingState()) === '')
check('orbit-done-toast', await waitForToast('环绕视频已导出'))

// 6. 录屏：danger 按钮 + screen 锚点 + 互斥（导出视频 disabled）
await recordBtn.click()
await page.waitForTimeout(500)
check('screen-anchor', (await recordingState()) === 'screen')
check('screen-label-stop', (await labelOf(recordBtn)) === '停止录屏')
check(
  'screen-danger-class',
  await recordBtn.evaluate((el) => el.classList.contains('ant-btn-dangerous'))
)
check('screen-export-disabled', await exportBtn.isDisabled())
// 录屏不锁用户操作：复位视图保持可用（录的正是用户操作）
check('screen-reset-view-enabled', !(await resetBtn.isDisabled()))
await page.waitForTimeout(800)
await recordBtn.click() // 停止
await page.waitForTimeout(1_000)
check('screen-stopped-restored', (await recordingState()) === '')
check('screen-stopped-label', (await labelOf(recordBtn)) === '导出录屏')
check('screen-saved-toast', await waitForToast('录屏已保存'))

await shot('03-final')

// 7. 产物硬断言：两次成功导出（环绕 + 录屏）各落一个非空视频文件
const videos = fs
  .readdirSync(VIDEO_DIR)
  .map((f) => {
    const st = fs.statSync(path.join(VIDEO_DIR, f))
    return { f, size: st.size }
  })
  .filter((v) => /\.(mp4|webm)$/.test(v.f))
console.log('video-files:', JSON.stringify(videos))
check(
  'video-files-saved',
  videos.length === 2 && videos.every((v) => v.size > 0),
  `got ${JSON.stringify(videos)}`
)

console.log('renderer-errors:', errors.length === 0 ? 'none (ok)' : JSON.stringify(errors, null, 2))
await app.close()

const ok = failures === 0 && errors.length === 0
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
