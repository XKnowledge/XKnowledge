// src/viewer/ui.js
// DOM UI：头部（标题/计数/搜索/主题）、图例、详情面板、底部工具条、水印。
// 全 DOM API 创建、文案一律 textContent（无 innerHTML 拼接，图谱名/描述是
// 用户数据，天然防 XSS）。水印视觉对齐 PNG 导出（By XKnowledge、底部 5%、
// 粗体、字号 h×0.022 的 CSS 等价 max(18px, 2.2vh)）。
import { assignCategoryColors } from '../renderer/src/utils/categoryColor.js'
import { VIEWER_I18N } from './i18n.js'

/**
 * @param {HTMLElement} root 挂载根（body）
 * @param {object} data serializeGraphForViewer 产物
 * @param {object} viewer createViewer 实例
 * @returns {{ els, showNode }} showNode 供 index.js 接进 viewer 的 onNodeClick
 */
export const createUi = (root, data, viewer, { lang = 'zh' } = {}) => {
  const L = lang === 'en' ? VIEWER_I18N.en : VIEWER_I18N.zh

  const div = (cls, parent = root, tag = 'div') => {
    const el = document.createElement(tag)
    if (cls) el.className = cls
    parent.appendChild(el)
    return el
  }

  // ---- 头部：标题 + 计数 + 搜索 + 主题 ----
  const head = div('xk-head')
  const title = div('xk-title', head)
  title.textContent = data.title || 'XKnowledge'
  title.setAttribute('data-testid', 'xk-title')
  const count = div('xk-count', head)
  count.textContent = `${data.nodes.length} ${L.nodes} · ${data.links.length} ${L.links}`
  count.setAttribute('data-testid', 'xk-count')
  const search = div('xk-search', head)
  const input = document.createElement('input')
  input.type = 'search'
  input.placeholder = L.searchPlaceholder
  input.setAttribute('data-testid', 'xk-search-input')
  search.appendChild(input)
  const searchCount = div('xk-search-count', search)
  searchCount.setAttribute('data-testid', 'xk-search-count')
  const themeBtn = document.createElement('button')
  themeBtn.className = 'xk-btn'
  themeBtn.textContent = '☾'
  themeBtn.setAttribute('data-testid', 'xk-theme-btn')
  search.appendChild(themeBtn)

  // ---- 图例：类目色与 viewer 单源（同一 assignCategoryColors 分配）----
  const catColors = assignCategoryColors(data.categories.map((c) => c.name))
  const legend = div('xk-legend')
  legend.setAttribute('data-testid', 'xk-legend')
  for (const c of data.categories) {
    const chip = document.createElement('button')
    chip.className = 'xk-chip'
    chip.setAttribute('data-testid', 'xk-chip')
    const dot = document.createElement('span')
    dot.className = 'dot'
    dot.style.background = catColors.get(c.name) || '#999'
    const label = document.createElement('span')
    label.textContent = c.name
    chip.appendChild(dot)
    chip.appendChild(label)
    chip.addEventListener('click', () => {
      const hidden = new Set(viewer.getState().hiddenCategories)
      if (hidden.has(c.name)) hidden.delete(c.name)
      else hidden.add(c.name)
      chip.dataset.off = hidden.has(c.name) ? '1' : ''
      viewer.setState({ hiddenCategories: hidden })
    })
    legend.appendChild(chip)
  }

  // ---- 右侧栏：视图卡片（可展开/收起）+ 详情面板 ----
  // 对齐软件观感：图例在左上角卡片，视图控件归右侧一张卡片；详情面板挂在
  // 同一右侧栏里（卡片收起时面板自动上移，不重叠）
  const side = div('xk-side')
  const ctrl = div('xk-ctrl', side)
  ctrl.setAttribute('data-testid', 'xk-ctrl')
  const ctrlHead = div('xk-ctrl-head', ctrl)
  const ctrlTitle = document.createElement('span')
  ctrlTitle.textContent = L.view
  const ctrlToggle = document.createElement('button')
  ctrlToggle.className = 'xk-ctrl-toggle'
  ctrlToggle.textContent = '‹'
  ctrlToggle.setAttribute('data-testid', 'xk-ctrl-toggle')
  ctrlToggle.setAttribute('aria-expanded', 'true')
  ctrlHead.appendChild(ctrlTitle)
  ctrlHead.appendChild(ctrlToggle)
  const ctrlBody = div('xk-ctrl-body', ctrl)
  ctrlHead.addEventListener('click', () => {
    const collapsed = ctrl.dataset.collapsed === '1'
    ctrl.dataset.collapsed = collapsed ? '' : '1'
    ctrlToggle.textContent = collapsed ? '‹' : '›'
    ctrlToggle.setAttribute('aria-expanded', collapsed ? 'true' : 'false')
  })

  // ---- 详情面板（点节点滑出；边不选中——边只有悬停提示）----
  const panel = div('xk-panel', side)
  panel.setAttribute('data-testid', 'xk-panel')
  const panelName = document.createElement('h3')
  panel.appendChild(panelName)
  const panelCat = div('cat', panel)
  const panelDes = div('des', panel)
  const panelDeg = div('deg', panel)
  const showNode = (name) => {
    const n = data.nodes.find((x) => x.name === name)
    if (!n) {
      panel.dataset.open = ''
      return
    }
    panelName.textContent = n.name
    panelCat.textContent = `${L.category}：${n.category}`
    panelDes.textContent = n.des || ''
    panelDeg.textContent = `${viewer.degreeOf(n.name)} ${L.neighbors}`
    panel.dataset.open = '1'
  }

  // ---- 视图卡片内容：标签开关 / 聚焦三态+跳数 / 复位 ----
  const labelsBox = document.createElement('label')
  const labelsCb = document.createElement('input')
  labelsCb.type = 'checkbox'
  labelsCb.setAttribute('data-testid', 'xk-labels-toggle')
  const labelsText = document.createElement('span')
  labelsText.textContent = L.labels
  labelsBox.appendChild(labelsCb)
  labelsBox.appendChild(labelsText)
  labelsBox.addEventListener('change', () => viewer.setState({ showSmallLabels: labelsCb.checked }))

  const focusLabel = document.createElement('span')
  focusLabel.textContent = `${L.focus}：`
  const focusSel = document.createElement('select')
  focusSel.setAttribute('data-testid', 'xk-focus-mode')
  for (const [val, text] of [
    ['off', L.focusOff],
    ['focus', L.focusDim],
    ['deep', L.focusDeep]
  ]) {
    const opt = document.createElement('option')
    opt.value = val
    opt.textContent = text
    focusSel.appendChild(opt)
  }
  const hopsSel = document.createElement('select')
  hopsSel.setAttribute('data-testid', 'xk-focus-hops')
  for (const h of [1, 2, 3]) {
    const opt = document.createElement('option')
    opt.value = String(h)
    opt.textContent = `${h} ${L.hops}`
    hopsSel.appendChild(opt)
  }
  focusSel.addEventListener('change', () => {
    // 开启聚焦且无焦点：默认焦点=选中 → 度数最高（编辑器同规则）
    const patch = { focusMode: focusSel.value }
    if (focusSel.value !== 'off' && !viewer.getState().focusName) {
      patch.focusName = viewer.getState().selected || viewer.defaultFocusName()
    }
    viewer.setState(patch)
  })
  hopsSel.addEventListener('change', () => viewer.setState({ focusHops: Number(hopsSel.value) }))

  const resetBtn = document.createElement('button')
  resetBtn.className = 'xk-btn'
  resetBtn.textContent = L.reset
  resetBtn.setAttribute('data-testid', 'xk-reset-btn')
  resetBtn.addEventListener('click', () => viewer.zoomToFit())

  ctrlBody.appendChild(labelsBox)
  const focusRow = div('xk-ctrl-row', ctrlBody)
  focusRow.appendChild(focusLabel)
  focusRow.appendChild(focusSel)
  focusRow.appendChild(hopsSel)
  ctrlBody.appendChild(resetBtn)

  // ---- 水印（对齐 PNG：By XKnowledge）----
  const watermark = div('xk-watermark')
  watermark.setAttribute('data-testid', 'xk-watermark')
  watermark.textContent = 'By XKnowledge'

  // 底部导航提示：three-render-objects 硬编码英文且无配置项，覆盖为
  // viewer 语言（编辑器 navInfo 同模式；类名随库版本锁定 ^1.80）。
  // viewer 只读，只提示漫游操作（无建点/连线/框选）
  const navInfo = document.querySelector('.scene-nav-info')
  if (navInfo) navInfo.textContent = L.navHint

  // ---- 搜索：命中计数 + Enter 步进（循环）----
  let hitIndex = 0
  const refreshSearch = () => {
    const { searchHits } = viewer.getState()
    if (!input.value) {
      searchCount.textContent = ''
      return
    }
    searchCount.textContent = searchHits.length
      ? `${searchHits.length} · ${hitIndex + 1}`
      : L.searchNoHit
    if (searchHits.length) viewer.flyTo(searchHits[hitIndex])
  }
  input.addEventListener('input', () => {
    hitIndex = 0
    viewer.setState({ searchKeyword: input.value })
    refreshSearch()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    const { searchHits } = viewer.getState()
    if (!searchHits.length) return
    hitIndex = (hitIndex + 1) % searchHits.length
    viewer.setState({ searchActive: searchHits[hitIndex] })
    refreshSearch()
  })

  // ---- 主题：初始跟随系统，按钮循环切换（viewer 全量 refresh 走新场景色）----
  const applyTheme = (theme) => {
    document.body.dataset.theme = theme
    viewer.setState({ theme })
  }
  applyTheme(
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  )
  themeBtn.addEventListener('click', () => {
    applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark')
  })

  return {
    els: { input, searchCount, themeBtn, panel, legend, watermark },
    showNode
  }
}
