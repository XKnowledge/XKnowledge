// 冒烟驱动：生产构建启动应用，双击首页示例卡进入图表页，验证视频导出/
// 录屏全链路状态机——环绕（orbit 锚点 + 菜单项态 + Esc 取消 + 跑满成功 toast）、
// 录屏（screen 锚点 + danger 菜单项 + 控制卡片本体不可拖/手柄拖动/暂停恢复/结束 + toast）、
// 两态互斥 disabled、渲染进程零错误。导出入口在左上角菜单「导出」子菜单
// （hover 两级展开）；录屏中画布上悬浮控制卡片（暂停/结束 + ⠿ 拖动手柄）。
// 录制中的旋转视觉与水印由截图人工复核（02b/02c 两帧对比）。
// 用法：node scripts/smoke-video-export.mjs   （需先 npm run build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.artifacts', 'smoke-shots')
fs.rmSync(SHOT_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })
// 视频落盘目录：主进程 saveVideoFile 见 XK_SMOKE_VIDEO_DIR 时跳过系统
// 保存框（模态框在无人值守环境挂死）直接写这里——冒烟借此硬断言产物
const VIDEO_DIR = path.join(APP_DIR, '.artifacts', 'smoke-video')
fs.rmSync(VIDEO_DIR, { recursive: true, force: true })
fs.mkdirSync(VIDEO_DIR, { recursive: true })
// 6.5 节单节点目标图：多节点力导向图节点屏上仅 ~20px 撒网踩不中
// （smoke-autosave 的结论），单节点 zoomToFit 后必居画布正中，中心探针
// 确定性命中
const SINGLE_NODE_TARGET = path.join(VIDEO_DIR, 'single-node.xk')
fs.writeFileSync(
  SINGLE_NODE_TARGET,
  JSON.stringify({
    version: 2,
    description: '',
    nodes: [{ name: '单点', des: '', symbolSize: 40, category: '冒烟' }],
    links: []
  }),
  'utf-8'
)

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

// ---- 录制只读锁定断言组 ----
// 黑名单菜单项（改图/换图/换呈现）禁用：hover 开菜单逐项查（zh-CN 文案
// 与 XkMenu 模板一致；「从大纲导入...」用前缀匹配防省略号形态差异）
const assertMenuReadonly = async (phase) => {
  await page.locator('.sider-menu-style .no-move').hover()
  const dropdown = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
  await dropdown.waitFor({ state: 'visible', timeout: 5_000 })
  for (const text of [
    '新建文件',
    '打开文件',
    '关闭文件',
    '撤销',
    '重做',
    '创建节点',
    '删除节点',
    '删除连接',
    '从大纲导入',
    '设置'
  ]) {
    const item = dropdown.locator('.ant-dropdown-menu-item', { hasText: text }).first()
    check(`readonly-menu-disabled(${phase}:${text})`, await isItemDisabled(item))
  }
  await page.mouse.move(640, 400)
  await page.waitForTimeout(400)
}
// 工具栏四按钮（建/删/删边/编辑栏）全禁
const assertToolbarDisabled = async (phase) => {
  const disabled = await page.evaluate(() =>
    [...document.querySelectorAll('[data-toolbar-action]')].every((b) => b.disabled)
  )
  check(`readonly-toolbar-disabled(${phase})`, disabled)
}
// 窗口 resizable 主进程侧断言（录制冻结 = false）。evaluate 沙箱无 require/
// 动态 import，但主进程是 CJS：process.mainModule.require 是可用旁路
const windowResizable = async () =>
  (await app.evaluate(() =>
    process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].isResizable()
  ))

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

// 1.1 开侧栏（「编辑栏」按钮——d175e0b 后工具栏 4 按钮，原 nth(2) 已指向
// 「删除连接」开侧栏失效，改显式锚点）：复位视图按钮在侧栏属性面板内
// （导出四项已收进菜单），默认收起时不可见
await page.locator('[data-toolbar-action="toggle_sider"]').click()
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
// 只读锁定：侧栏强制收起（开录前 1.1 开着的）+ 窗口尺寸冻结 + 菜单黑名单
check('orbit-sider-collapsed', !(await page.locator('.sider-style').isVisible()))
check('orbit-window-frozen', (await windowResizable()) === false)
await assertMenuReadonly('orbit')
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
check('esc-window-restored', (await windowResizable()) === true)

// 5. 再跑满一次环绕（默认 10s）：成功 toast + 恢复
await openExportMenu()
await exportItem.click()
await page.waitForTimeout(500)
check('orbit-again-anchor', (await recordingState()) === 'orbit')
await shot('02c-orbit-running')
await page.waitForTimeout(11_000)
check('orbit-done-restored', (await recordingState()) === '')
check('orbit-done-toast', await waitForToast('环绕视频已导出'))
check('orbit-done-window-restored', (await windowResizable()) === true)

// 6. 录屏：danger 菜单项 + screen 锚点 + 控制卡片（出现/拖动/暂停恢复）+ 结束
// 开录前先开侧栏（属性页场景，环绕路径第 3 节已验）：录屏路径的「强制
// 收起」断言需要开着的前置；表单页场景见 6.5 节
await page.locator('[data-toolbar-action="toggle_sider"]').click()
await page.waitForTimeout(300)
check('screen-pre-sider-open', await page.locator('.sider-style').isVisible())
await openExportMenu()
await recordItem.click()
await page.waitForTimeout(500)
check('screen-anchor', (await recordingState()) === 'screen')
check('screen-sider-forced-collapse', !(await page.locator('.sider-style').isVisible()))

// 6.1 控制卡片：录屏中出现（悬浮画布右下角，暂停/结束两 icon 按钮 + ⠿ 手柄）
const card = page.locator('[data-recording-card]')
await card.waitFor({ state: 'visible', timeout: 5_000 })
check('card-paused-initial', (await card.getAttribute('data-paused')) === 'false')
// 卡片本体（左缘 padding 区，避开按钮/手柄）按下拖动不位移——拖动只认手柄
const bodyBox = await card.boundingBox()
await page.mouse.move(bodyBox.x + 3, bodyBox.y + bodyBox.height / 2)
await page.mouse.down()
await page.mouse.move(bodyBox.x + 3 - 60, bodyBox.y + bodyBox.height / 2 - 20, { steps: 3 })
await page.mouse.up()
await page.waitForTimeout(200)
const bodyBoxAfter = await card.boundingBox()
check(
  'card-body-not-draggable',
  Math.abs(bodyBoxAfter.x - bodyBox.x) < 1 && Math.abs(bodyBoxAfter.y - bodyBox.y) < 1,
  `body ${bodyBox.x},${bodyBox.y} -> ${bodyBoxAfter.x},${bodyBoxAfter.y}`
)
// 手柄拖动：向左上位移 (-120, -40)（初始在右下角，向右/下会被父容器
// clamp 吃掉位移）；位移后宽高须不变（left/right 约束并存会把卡片拉宽）
const handle = page.locator('[data-record-drag]')
const hBox = await handle.boundingBox()
const box1 = await card.boundingBox()
await page.mouse.move(hBox.x + hBox.width / 2, hBox.y + hBox.height / 2)
await page.mouse.down()
await page.mouse.move(hBox.x + hBox.width / 2 - 120, hBox.y + hBox.height / 2 - 40, { steps: 5 })
await page.mouse.up()
await page.waitForTimeout(200)
const box2 = await card.boundingBox()
check(
  'card-draggable',
  Math.abs(box2.x - (box1.x - 120)) < 4 && Math.abs(box2.y - (box1.y - 40)) < 4,
  `${box1.x},${box1.y} -> ${box2.x},${box2.y}`
)
check(
  'card-drag-size-unchanged',
  Math.abs(box2.width - box1.width) < 1 && Math.abs(box2.height - box1.height) < 1,
  `${box1.width}x${box1.height} -> ${box2.width}x${box2.height}`
)

// 6.2 暂停 → 继续：data-paused 锚点翻转（icon 随之切换暂停/继续）
await page.locator('[data-record-pause]').click()
await page.waitForTimeout(200)
check('card-paused-on', (await card.getAttribute('data-paused')) === 'true')
await page.locator('[data-record-pause]').click()
await page.waitForTimeout(200)
check('card-paused-off', (await card.getAttribute('data-paused')) === 'false')

// 6.2.5 录屏只读锁定：画布双击不弹建点编辑器 + 工具栏四禁 + 窗口冻结
// （双击点在画布上半部空白区——该图节点经 zoomToFit 居中，上半部空白概率高）
await page.dblclick('.echarts-style', { position: { x: 640, y: 150 } })
await page.waitForTimeout(600)
check(
  'readonly-dblclick-no-editor',
  (await page.locator('[data-canvas-edit-mode]').count()) === 0
)
await assertToolbarDisabled('screen')
check('screen-window-frozen', (await windowResizable()) === false)

// 6.3 菜单 danger 态 + 互斥（导出视频 disabled）——只读态断言，停止走卡片
await openExportMenu()
check('screen-label-stop', (await labelOf(recordItem)) === '停止录屏')
check(
  'screen-danger-class',
  await recordItem.evaluate((el) => el.classList.contains('ant-dropdown-menu-item-danger'))
)
check('screen-export-disabled', await isItemDisabled(exportItem))
// 复位视图按钮随侧栏锁定收起而不可达（原「保持可用」断言已被只读锁定
// 取代：浏览手势照常可录，侧栏/修改入口全锁）
check('screen-reset-view-hidden', !(await page.locator('.sider-style').isVisible()))
await closeExportMenu()
await assertMenuReadonly('screen')
await page.waitForTimeout(800)

// 6.4 结束：卡片红色停止按钮 → 保存框（冒烟后门落盘）+ 卡片随录屏态消失
await page.locator('[data-record-stop]').click()
await page.waitForTimeout(1_000)
check('screen-stopped-restored', (await recordingState()) === '')
check('screen-stopped-window-restored', (await windowResizable()) === true)
const toolbarRestored = await page.evaluate(() =>
  [...document.querySelectorAll('[data-toolbar-action]')].every((b) => !b.disabled)
)
check('screen-stopped-toolbar-restored', toolbarRestored)
check('card-gone', (await card.count()) === 0)
check('screen-saved-toast', await waitForToast('录屏已保存'))
await openExportMenu()
check('screen-stopped-label', (await labelOf(recordItem)) === '导出录屏')
await closeExportMenu()

// 6.5 表单页场景的强制收起（回归锚点：collapseSiderForRecording 曾复用
// toggleSider——侧栏停在「当前节点」表单时被切成属性页而非收起）。35 节点
// 示例图节点屏上仅 ~20px 撒网踩不中，stub 打开对话框装载预创建单节点 .xk
// 开第二窗口（同 smoke-autosave 的窗口构造），中心点击确定性命中节点 →
// onGraphNodeClick 自动开侧栏 + 当前节点表单（attributeVisible=false），
// 再开录屏断言强制收起。录屏故意不停止：窗口随 app.close() 销毁不落盘，
// 第 7 节产物计数不受影响
await app.evaluate(`globalThis.__smokeTarget = ${JSON.stringify(SINGLE_NODE_TARGET)}`)
await app.evaluate(({ dialog }) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [globalThis.__smokeTarget] })
})
const page2Promise = app.waitForEvent('window', { timeout: 15_000 }).catch(() => {
  const pages = app.context().pages()
  return pages.find((p) => p !== page) || null
})
await page.evaluate(async () => {
  const res = await window.electronAPI.openFile()
  if (!res || res.canceled || res.alreadyOpen || !res.content) {
    throw new Error(`6.5 openFile 意外结果: ${JSON.stringify(res && Object.keys(res))}`)
  }
  await window.electronAPI.newChartWindow({ content: res.content, path: res.path })
})
const page2 = await page2Promise
if (!page2) throw new Error('6.5 图表窗口未创建')
page2.on('pageerror', (err) => errors.push(`pageerror(page2): ${err.message}`))
page2.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error(page2): ${msg.text()}`)
})
await page2.waitForSelector('.graph3d-container', { timeout: 15_000 })
// 新窗口在全新 userData 首次直达图表页会自动开启新手教程（bad2695 记录）：
// 遮罩拦点击、onBeforeStart 强开侧栏（属性页）会破坏 6.5 的前置——出现即
// 关闭（同真实用户跳过）；非首次环境 3 秒超时静默通过
const tourClose2 = page2.locator('.ant-tour-close')
try {
  await tourClose2.waitFor({ state: 'visible', timeout: 3_000 })
  await tourClose2.click()
  await page2.waitForTimeout(300)
} catch {
  /* 无教程 */
}
await page2.waitForTimeout(2_000) // 布局稳定 + zoomToFit
const formBox = await page2.locator('.graph3d-container').boundingBox()
// 中心点击重试：库层 hover 轮询未锁定节点时 click 被吞（实测首两次落空，
// smoke-autosave 的多探针重试同因），命中判定 = 侧栏开且停在当前节点表单
let nodePanelOpen = false
for (let i = 0; i < 4 && !nodePanelOpen; i++) {
  await page2.mouse.click(formBox.x + formBox.width / 2, formBox.y + formBox.height / 2)
  await page2.waitForTimeout(500)
  nodePanelOpen =
    (await page2.locator('.sider-style').isVisible()) &&
    !(await page2.locator('.attr-panel').isVisible())
}
check('form-pre-node-panel-open', nodePanelOpen, '多次中心点击未命中单节点')
await page2.locator('.sider-menu-style .no-move').hover()
const dropdown2 = page2.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
await dropdown2.waitFor({ state: 'visible', timeout: 5_000 })
await dropdown2.locator('.ant-dropdown-menu-submenu-title', { hasText: '导出' }).hover()
await page2.locator('[data-screen-record]').waitFor({ state: 'visible', timeout: 5_000 })
await page2.locator('[data-screen-record]').click()
await page2.waitForTimeout(500)
check(
  'form-recording-state',
  (await page2
    .locator('.graph3d-wrap')
    .getAttribute('data-video-recording')) === 'screen'
)
check('form-sider-forced-collapse', !(await page2.locator('.sider-style').isVisible()))

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
