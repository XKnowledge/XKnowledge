// 冒烟驱动：生产构建启动应用，双击首页示例卡进入图表页，验证视频导出/
// 录屏全链路状态机——环绕（orbit 锚点 + 菜单项态 + Esc 取消 + 跑满成功 toast）、
// 录屏（screen 锚点 + danger 菜单项 + 控制卡片拖动/暂停恢复/结束 + toast）、
// 两态互斥 disabled、渲染进程零错误。导出入口在左上角菜单「导出」子菜单
// （hover 两级展开）；录屏中画布上悬浮可拖动控制卡片（暂停/结束）。
// 录制中的旋转视觉与水印由截图人工复核（02b/02c 两帧对比）。
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
// 导出入口已收进左上角菜单「导出」子菜单：data 锚点随按钮迁到菜单项（li）上，
// 复位视图按钮仍在侧栏属性面板
const exportItem = page.locator('[data-export-video]')
const recordItem = page.locator('[data-screen-record]')
const resetBtn = page.locator('[data-reset-view]')
// 菜单项文案断言统一去空白，防排版空格干扰
const labelOf = async (item) => (await item.textContent()).replace(/\s+/g, '')
// 菜单项禁用态：antd 渲染 class（li 非表单控件，isDisabled() 不适用）
const isItemDisabled = (item) =>
  item.evaluate((el) => el.classList.contains('ant-dropdown-menu-item-disabled'))

/** hover 开左上角菜单并展开「导出」子菜单（Windows 平台 trigger=hover，防
 *  隐藏实例同 smoke-outline-import）：点菜单项后整个下拉关闭，录制态断言
 *  需反复进出、每次重开 */
const openExportMenu = async () => {
  await page.locator('.sider-menu-style .no-move').hover()
  const dropdown = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
  await dropdown.waitFor({ state: 'visible', timeout: 5_000 })
  await dropdown.locator('.ant-dropdown-menu-submenu-title', { hasText: '导出' }).hover()
  await exportItem.waitFor({ state: 'visible', timeout: 5_000 })
}
/** 移出下拉区域让 hover 菜单自然关闭（不能按 Esc——环绕录制中 Esc 是取消
 *  录制语义），移到画布中心即可 */
const closeExportMenu = async () => {
  await page.mouse.move(640, 400)
  await page.waitForTimeout(400)
}

// 1. 首页双击示例卡进图表页
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.xk-example-card').first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(3_000) // 布局稳定 + 首次取景

// 1.1 开侧栏（「编辑栏」按钮，同 smoke-marquee 的 nth(2) 惯例）：复位视图
// 按钮在侧栏属性面板内（导出四项已收进菜单），默认收起时不可见
await page.locator('.no-move-button').nth(2).click()
await page.waitForTimeout(500)

// 2. 子菜单四项 + 锚点 + 初始文案 + 无录制
await openExportMenu()
check(
  'submenu-has-4-items',
  (await page.locator('.ant-dropdown-menu-submenu-popup .ant-dropdown-menu-item').count()) === 4
)
check('anchors-present', (await exportItem.count()) === 1 && (await recordItem.count()) === 1)
check(
  'initial-labels',
  (await labelOf(exportItem)) === '环绕录制' && (await labelOf(recordItem)) === '导出录屏'
)
check('initial-no-recording', (await recordingState()) === '')
await closeExportMenu()

// 3. 环绕：子菜单点「环绕录制」→ orbit 锚点 + 菜单项态 + 互斥（录屏 disabled）
await openExportMenu()
await exportItem.click()
await page.waitForTimeout(500)
check('orbit-anchor', (await recordingState()) === 'orbit')
await openExportMenu() // 点项后下拉整体关闭，断言态需重开
check('orbit-label-recording', (await labelOf(exportItem)) === '录制中…')
check('orbit-export-disabled', await isItemDisabled(exportItem))
check('orbit-screen-record-disabled', await isItemDisabled(recordItem))
// 环绕录制中视角/布局入口须锁（复位视图飞相机+取景会毁掉录制）
check('orbit-reset-view-disabled', await resetBtn.isDisabled())
await closeExportMenu()
await shot('02a-orbit-start')
await page.waitForTimeout(2_000)
await shot('02b-orbit-mid') // 与 02c 对比人工复核旋转

// 4. Esc 取消：提前恢复 + 取消 toast（菜单已关，Esc 直达环绕取消语义）
await page.keyboard.press('Escape')
await page.waitForTimeout(1_000)
check('esc-cancel-restored', (await recordingState()) === '')
await openExportMenu()
check('esc-cancel-label', (await labelOf(exportItem)) === '环绕录制')
await closeExportMenu()
check('esc-cancel-toast', await waitForToast('已取消环绕录制'))

// 5. 再跑满一次环绕（默认 10s）：成功 toast + 恢复
await openExportMenu()
await exportItem.click()
await page.waitForTimeout(500)
check('orbit-again-anchor', (await recordingState()) === 'orbit')
await shot('02c-orbit-running')
await page.waitForTimeout(11_000)
check('orbit-done-restored', (await recordingState()) === '')
check('orbit-done-toast', await waitForToast('环绕视频已导出'))

// 6. 录屏：danger 菜单项 + screen 锚点 + 控制卡片（出现/拖动/暂停恢复）+ 结束
await openExportMenu()
await recordItem.click()
await page.waitForTimeout(500)
check('screen-anchor', (await recordingState()) === 'screen')

// 6.1 控制卡片：录屏中出现（悬浮画布右下角，暂停/结束两 icon 按钮）
const card = page.locator('[data-recording-card]')
await card.waitFor({ state: 'visible', timeout: 5_000 })
check('card-paused-initial', (await card.getAttribute('data-paused')) === 'false')
// 拖动：卡片左缘 padding 区按下（避开按钮），向左上位移 (-120, -40)
// （初始在右下角，向右/下会被父容器 clamp 吃掉位移）
const box1 = await card.boundingBox()
await page.mouse.move(box1.x + 3, box1.y + box1.height / 2)
await page.mouse.down()
await page.mouse.move(box1.x + 3 - 120, box1.y + box1.height / 2 - 40, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(200)
const box2 = await card.boundingBox()
check(
  'card-draggable',
  Math.abs(box2.x - (box1.x - 120)) < 4 && Math.abs(box2.y - (box1.y - 40)) < 4,
  `${box1.x},${box1.y} -> ${box2.x},${box2.y}`
)

// 6.2 暂停 → 继续：data-paused 锚点翻转（icon 随之切换暂停/继续）
await page.locator('[data-record-pause]').click()
await page.waitForTimeout(200)
check('card-paused-on', (await card.getAttribute('data-paused')) === 'true')
await page.locator('[data-record-pause]').click()
await page.waitForTimeout(200)
check('card-paused-off', (await card.getAttribute('data-paused')) === 'false')

// 6.3 菜单 danger 态 + 互斥（导出视频 disabled）——只读态断言，停止走卡片
await openExportMenu()
check('screen-label-stop', (await labelOf(recordItem)) === '停止录屏')
check(
  'screen-danger-class',
  await recordItem.evaluate((el) => el.classList.contains('ant-dropdown-menu-item-danger'))
)
check('screen-export-disabled', await isItemDisabled(exportItem))
// 录屏不锁用户操作：复位视图保持可用（录的正是用户操作）
check('screen-reset-view-enabled', !(await resetBtn.isDisabled()))
await closeExportMenu()
await page.waitForTimeout(800)

// 6.4 结束：卡片红色停止按钮 → 保存框（冒烟后门落盘）+ 卡片随录屏态消失
await page.locator('[data-record-stop]').click()
await page.waitForTimeout(1_000)
check('screen-stopped-restored', (await recordingState()) === '')
check('card-gone', (await card.count()) === 0)
check('screen-saved-toast', await waitForToast('录屏已保存'))
await openExportMenu()
check('screen-stopped-label', (await labelOf(recordItem)) === '导出录屏')
await closeExportMenu()

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
