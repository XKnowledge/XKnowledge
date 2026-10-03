// 冒烟驱动：生产构建启动应用，双击首页示例卡进入图表页，点「导出 HTML」，
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
const SHOT_DIR = path.join(APP_DIR, '.smoke-shots')
fs.rmSync(SHOT_DIR, { recursive: true, force: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })
const HTML_DIR = path.join(APP_DIR, '.smoke-html')
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

// 2. 开侧栏（编辑栏按钮 nth(2)，同 smoke-video-export 惯例）→ 点导出 HTML
await page.locator('.no-move-button').nth(2).click()
await page.waitForTimeout(500)
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
const nodeCount = JSON.parse(
  html.match(/<script type="application\/json" id="xk-data">([\s\S]*?)<\/script>/)[1]
).nodes.length
check('html-node-count', nodeCount > 0, String(nodeCount))

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
//    落空）→ 搜索第一个节点并 flyTo（相机对准命中，屏幕中心即节点）→ 点中心。
//    3D 拾取按深度，中心附近可能被更近节点截获——断言「面板开或选中非空」
await vp.evaluate(() => {
  const v = window.__XK_VIEWER__
  v.graph.cooldownTicks(0) // 冻结布局（点击冒烟专用；正常使用不受影响）
  v.setState({ searchKeyword: 'CANN' })
  v.flyTo(v.getState().searchHits[0], 700)
})
await vp.waitForTimeout(1_200) // 相机飞行动画完成
await vp.mouse.click(640, 400) // 窗口 1280×800 中心 = flyTo 目标
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

// 10. 主题切换：body data-theme 翻转 + 背景色变化
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
