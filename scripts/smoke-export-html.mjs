// 冒烟驱动：生产构建启动应用，双击首页示例卡进入图表页，经左上角菜单
// 「导出 → 导出 HTML」触发导出，
// 产物经 XK_SMOKE_HTML_DIR 后门落盘（模态保存框在无人值守环境会挂死）。
// 随后经主进程开新 BrowserWindow 以 file:// 加载导出产物——真实浏览器
// 环境验证 viewer：canvas 渲染、搜索步进、点击详情、聚焦灰化/隐藏、
// 图例显隐、主题切换、水印、数据完整。主窗口与 viewer 窗口零错误。
// 用法：node scripts/smoke-export-html.mjs   （需先 npm run build）
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOT_DIR = path.join(APP_DIR, '.artifacts', 'smoke-shots')
fs.rmSync(SHOT_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })
const HTML_DIR = path.join(APP_DIR, '.artifacts', 'smoke-html')
fs.rmSync(HTML_DIR, { recursive: true, force: true })
fs.mkdirSync(HTML_DIR, { recursive: true })

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
  env: { ...process.env, XK_SMOKE_HTML_DIR: HTML_DIR },
  timeout: 30_000
})
const page = await app.firstWindow()
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
})

// 1. 首页双击「CANN知识体系」示例卡进图表页（类目多、结构丰富；
//    按文本定位——图库排序下 first() 不确定是哪张图）
await page.waitForSelector('.xk-example-card', { timeout: 15_000 })
await page.locator('.xk-example-card', { hasText: 'CANN知识体系' }).first().dblclick()
await page.waitForSelector('.graph3d-container', { timeout: 15_000 })
await page.waitForTimeout(2_000)

// 2. 左上角菜单 →「导出」→「导出 HTML」：hover 触发器展开下拉（Windows 平台
//    trigger=hover，防隐藏实例同 smoke-outline-import），再 hover「导出」子菜单
//    标题展开二级（antd 子菜单弹出层 .ant-dropdown-menu-submenu-popup），
//    点锚点项；保存框经 XK_SMOKE_HTML_DIR 后门跳过
await page.locator('.sider-menu-style .no-move').hover()
const dropdown = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
await dropdown.waitFor({ state: 'visible', timeout: 5_000 })
await dropdown.locator('.ant-dropdown-menu-submenu-title', { hasText: '导出' }).hover()
await page.locator('[data-export-html]').waitFor({ state: 'visible', timeout: 5_000 })
await page.locator('[data-export-html]').click()

// 3. 产物落盘 + 静态断言
await page.waitForTimeout(1_500)
const htmlFiles = fs.readdirSync(HTML_DIR).filter((f) => f.endsWith('.html'))
check('html-saved', htmlFiles.length === 1, JSON.stringify(htmlFiles))
const htmlPath = path.join(HTML_DIR, htmlFiles[0])
const html = fs.readFileSync(htmlPath, 'utf-8')
check('html-has-canvas-div', html.includes('id="graph3d"'))
check('html-data-script', html.includes('application/json" id="xk-data"'))
check(
  'html-no-placeholder-left',
  !html.includes('"__XK_DATA__"') && !html.includes('<title>__XK_TITLE__')
)
check('html-has-bundle', html.includes('By XKnowledge')) // 水印文案在 bundle 内联字符串里
const exportData = JSON.parse(
  html.match(/<script type="application\/json" id="xk-data">([\s\S]*?)<\/script>/)[1]
)
const nodeCount = exportData.nodes.length
check('html-node-count', nodeCount > 0, String(nodeCount))
// 斥力随导出携带：冒烟不触碰滑杆，导出时为默认 100
check('html-repulsion-carried', exportData.repulsion === 100, String(exportData.repulsion))

// 4. 主进程开新 BrowserWindow 加载导出产物（file:// + WebGL 真实环境）
const winPromise = app.waitForEvent('window', { timeout: 20_000 })
await app.evaluate(({ BrowserWindow }, p) => {
  const w = new BrowserWindow({ width: 1280, height: 800, show: true })
  w.loadFile(p)
}, htmlPath)
const vp = await winPromise
vp.on('pageerror', (err) => errors.push(`viewer-pageerror: ${err.message}`))
vp.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`viewer-console: ${msg.text()}`)
})

// 5. viewer 基础渲染
await vp.waitForSelector('#graph3d canvas', { timeout: 20_000 })
await vp.waitForTimeout(4_000) // 力模拟聚合一段 + 首帧取景
check('viewer-canvas', (await vp.locator('#graph3d canvas').count()) === 1)
const viewerTitle = await vp.locator('[data-testid="xk-title"]').textContent()
check('viewer-title', viewerTitle === 'CANN知识体系', String(viewerTitle))
check('viewer-count', /节点/.test(await vp.locator('[data-testid="xk-count"]').textContent()))
check(
  'viewer-watermark',
  (await vp.locator('[data-testid="xk-watermark"]').textContent()) === 'By XKnowledge'
)
const viewerNodes = await vp.evaluate(() => window.__XK_VIEWER__.graph.graphData().nodes.length)
check('viewer-graph-nodes', viewerNodes === nodeCount, `${viewerNodes} vs ${nodeCount}`)
// 斥力复现：viewer 以编辑器同映射（charge 强度 = -repulsion/10）应用导出值；
// d3 的 strength() 返回访问器函数（常量场景调用即得值），两种形态都兜住
const chargeStrength = await vp.evaluate(() => {
  const s = window.__XK_VIEWER__.graph.d3Force('charge').strength()
  return typeof s === 'function' ? s(null) : s
})
check('viewer-charge-from-export', chargeStrength === -10, String(chargeStrength))
// 底部导航提示跟随导出语言（导出环境为中文）：不再是库内置英文
check(
  'viewer-nav-lang',
  (await vp.locator('.scene-nav-info').textContent()).includes('旋转')
)
await vp.screenshot({ path: path.join(SHOT_DIR, 'viewer-01-open.png') })

// 6. 搜索：命中计数 + Enter 步进（active 变化经 viewer 状态断言）
await vp.fill('[data-testid="xk-search-input"]', 'CANN')
await vp.waitForTimeout(600)
const searchCount1 = await vp.locator('[data-testid="xk-search-count"]').textContent()
check('viewer-search-hits', /\d/.test(searchCount1), searchCount1)
const activeAfterInput = await vp.evaluate(() => window.__XK_VIEWER__.getState().searchActive)
check('viewer-search-active-first', !!activeAfterInput, String(activeAfterInput))
await vp.press('[data-testid="xk-search-input"]', 'Enter')
await vp.waitForTimeout(300)
const activeAfterEnter = await vp.evaluate(() => window.__XK_VIEWER__.getState().searchActive)
check(
  'viewer-search-step',
  !!activeAfterEnter && activeAfterEnter !== activeAfterInput,
  `${activeAfterInput} -> ${activeAfterEnter}`
)
await vp.screenshot({ path: path.join(SHOT_DIR, 'viewer-02-search.png') })
await vp.fill('[data-testid="xk-search-input"]', '')
await vp.waitForTimeout(300)

// 7. 点击节点 → 详情面板：冻结力模拟（cooldownTicks(0)，防漂移导致投影点
//    落空）→ 搜索第一个节点并 flyTo（相机对准命中）→ 投影矩阵换算球心屏幕
//    坐标 → 先悬停再点击。悬停必不可少：three-render-objects 的 click 判定
//    读 hoverObj（渲染循环按 pointerPos 做 raycast 的缓存值），冻结态下
//    move→down→up 瞬时完成时 hoverObj 尚未更新、点击会被当成背景点击
await vp.evaluate(() => {
  const v = window.__XK_VIEWER__
  v.graph.cooldownTicks(0) // 冻结布局（点击冒烟专用；正常使用不受影响）
  v.setState({ searchKeyword: 'CANN' })
  v.flyTo(v.getState().searchHits[0], 700)
})
await vp.waitForTimeout(1_200) // 相机飞行动画完成
// 直接点 searchActive 的屏幕投影：BrowserWindow 1280×800 含原生标题栏，
// 视口实际 ~1266×763，固定点 (640,400) 距投影球心 ~19px 处于球投影边缘、
// 命中与否看深度上有没有更近节点，天然 flaky——投影矩阵换算点球心
const projInfo = await vp.evaluate(() => {
  const v = window.__XK_VIEWER__
  const g = v.graph
  const st = v.getState()
  const n = g.graphData().nodes.find((x) => x.name === st.searchActive)
  const cam = g.camera()
  const mul = (m, vec) => [
    m[0] * vec[0] + m[4] * vec[1] + m[8] * vec[2] + m[12] * vec[3],
    m[1] * vec[0] + m[5] * vec[1] + m[9] * vec[2] + m[13] * vec[3],
    m[2] * vec[0] + m[6] * vec[1] + m[10] * vec[2] + m[14] * vec[3],
    m[3] * vec[0] + m[7] * vec[1] + m[11] * vec[2] + m[15] * vec[3]
  ]
  const eye = mul(cam.matrixWorldInverse.elements, [n.x, n.y, n.z, 1])
  const clip = mul(cam.projectionMatrix.elements, eye)
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    px: Math.round(((clip[0] / clip[3] + 1) / 2) * vw),
    py: Math.round(((1 - clip[1] / clip[3]) / 2) * vh)
  }
})
await vp.mouse.move(projInfo.px, projInfo.py) // 悬停：pointermove 唤醒渲染帧更新 hoverObj
await vp.waitForTimeout(600)
await vp.mouse.click(projInfo.px, projInfo.py)
await vp.waitForTimeout(600)
const panelOpen = await vp.evaluate(
  () => document.querySelector('[data-testid="xk-panel"]').dataset.open
)
const selected = await vp.evaluate(() => window.__XK_VIEWER__.getState().selected)
check('viewer-node-click-selects', !!selected, String(selected))
check('viewer-panel-or-selected', panelOpen === '1' || !!selected, `${panelOpen}/${selected}`)
await vp.screenshot({ path: path.join(SHOT_DIR, 'viewer-03-panel.png') })
await vp.evaluate(() => window.__XK_VIEWER__.setState({ searchKeyword: '' }))
await vp.waitForTimeout(300)

// 8. 聚焦：灰化 → 状态机生效 + 邻域外材质色采样（观测点）；隐藏 → 可见节点减少
await vp.selectOption('[data-testid="xk-focus-mode"]', 'focus')
await vp.waitForTimeout(800)
const dimInfo = await vp.evaluate(() => {
  const st = window.__XK_VIEWER__.getState()
  return { focus: st.focusName, mode: st.focusMode }
})
check('viewer-focus-on', !!dimInfo.focus && dimInfo.mode === 'focus', JSON.stringify(dimInfo))
const dimColorSeen = await vp.evaluate(() => {
  // 统计材质色已是 dim 灰（#c4c9cc）的节点数：邻域外节点被增量重着色
  const nodes = window.__XK_VIEWER__.graph.graphData().nodes
  return nodes.filter((n) => n.__threeObj?.material?.color?.getHexString() === 'c4c9cc').length
})
console.log('viewer-focus-dim-nodes:', dimColorSeen)
await vp.screenshot({ path: path.join(SHOT_DIR, 'viewer-04-focus-dim.png') })
await vp.selectOption('[data-testid="xk-focus-mode"]', 'deep')
await vp.waitForTimeout(800)
const visibleCount = await vp.evaluate(() => {
  const nodes = window.__XK_VIEWER__.graph.graphData().nodes
  return nodes.filter((n) => n.__threeObj && n.__threeObj.visible).length
})
check('viewer-focus-deep-hides', visibleCount < nodeCount, `${visibleCount}/${nodeCount}`)
await vp.screenshot({ path: path.join(SHOT_DIR, 'viewer-05-focus-deep.png') })
await vp.selectOption('[data-testid="xk-focus-mode"]', 'off')
await vp.waitForTimeout(500)

// 9. 图例：隐藏第一个类目 → 可见节点减少；再点恢复
const chipCount = await vp.locator('[data-testid="xk-chip"]').count()
check('viewer-legend-chips', chipCount > 0, String(chipCount))
if (chipCount > 0) {
  await vp.locator('[data-testid="xk-chip"]').first().click()
  await vp.waitForTimeout(800)
  const afterHide = await vp.evaluate(() => {
    const nodes = window.__XK_VIEWER__.graph.graphData().nodes
    return nodes.filter((n) => n.__threeObj && n.__threeObj.visible).length
  })
  check('viewer-legend-hides', afterHide < nodeCount, `${afterHide}/${nodeCount}`)
  await vp.locator('[data-testid="xk-chip"]').first().click()
  await vp.waitForTimeout(500)
}

// 10. 视图卡片展开/收起：收起后控件不可见，再点恢复
await vp.click('[data-testid="xk-ctrl-toggle"]')
await vp.waitForTimeout(200)
const ctrlHidden = await vp.evaluate(
  () => document.querySelector('.xk-ctrl-body').offsetParent === null
)
check('viewer-ctrl-collapse', ctrlHidden, String(ctrlHidden))
await vp.click('[data-testid="xk-ctrl-toggle"]')
await vp.waitForTimeout(200)
const ctrlShown = await vp.evaluate(
  () => document.querySelector('.xk-ctrl-body').offsetParent !== null
)
check('viewer-ctrl-expand', ctrlShown, String(ctrlShown))

// 11. 主题切换：body data-theme 翻转 + 背景色变化
const bgBefore = await vp.evaluate(() => getComputedStyle(document.body).backgroundColor)
await vp.click('[data-testid="xk-theme-btn"]')
await vp.waitForTimeout(800)
const themeAfter = await vp.evaluate(() => document.body.dataset.theme)
const bgAfter = await vp.evaluate(() => getComputedStyle(document.body).backgroundColor)
check('viewer-theme-toggle', bgBefore !== bgAfter, `${bgBefore} -> ${bgAfter} (${themeAfter})`)
await vp.screenshot({ path: path.join(SHOT_DIR, 'viewer-06-theme.png') })

console.log('renderer-errors:', errors.length === 0 ? 'none (ok)' : JSON.stringify(errors, null, 2))
await app.close()

const ok = failures === 0 && errors.length === 0
console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
process.exit(ok ? 0 : 1)
