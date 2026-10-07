// viewer/ui.js 单测（导出查看器 DOM UI）：手写极简 DOM 桩（仓库零新依赖
// 惯例——createElement/appendChild/parent 链/testid 遍历/事件捕获，无真实
// 排版）+ viewer 桩（state + setState 记录）。锁定：头部（标题回落/计数/
// 双语）、图例 chip 与 viewer 隐藏类目的单源接线、详情面板 showNode、
// 视图卡片折叠态、标签/聚焦/跳数/复位控件 patch、搜索命中计数与 Enter
// 循环步进、主题初始跟随系统与按钮循环、底部导航提示覆写、水印。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createUi } from '../../src/viewer/ui.js'
import { assignCategoryColors } from '../../src/renderer/src/utils/categoryColor'

// ---- 极简 DOM 桩 ----
const makeEl = (tag = 'div') => {
  const el = {
    tagName: tag,
    children: [],
    parent: null,
    className: '',
    textContent: '',
    value: '',
    checked: false,
    type: '',
    placeholder: '',
    style: {},
    dataset: {},
    attrs: {},
    listeners: {},
    setAttribute(key, v) {
      el.attrs[key] = String(v)
    },
    getAttribute: (key) => el.attrs[key],
    appendChild(child) {
      child.parent = el
      el.children.push(child)
      return child
    },
    addEventListener(type, fn) {
      ;(el.listeners[type] ??= []).push(fn)
    },
    fire(type, ev = {}) {
      for (const fn of el.listeners[type] ?? []) fn(ev)
    }
  }
  return el
}

const makeDoc = (navInfoEl = null) => ({
  body: makeEl('body'),
  createElement: makeEl,
  querySelector: (sel) => (sel === '.scene-nav-info' ? navInfoEl : null)
})

/** 按 data-testid 深度优先遍历 */
const findByTestId = (root, id) => {
  if (root.attrs['data-testid'] === id) return root
  for (const child of root.children) {
    const hit = findByTestId(child, id)
    if (hit) return hit
  }
  return null
}

/** 收集图例里的全部 chip */
const collectChips = (root) => {
  const out = []
  const walk = (el) => {
    if (el.attrs['data-testid'] === 'xk-chip') {
      out.push(el)
      return
    }
    for (const c of el.children) walk(c)
  }
  walk(root)
  return out
}

const makeViewer = (state = {}) => {
  const viewer = {
    state: {
      hiddenCategories: new Set(),
      searchHits: [],
      searchActive: null,
      selected: null,
      focusName: '',
      focusMode: 'off',
      ...state
    },
    patches: [],
    setState(patch) {
      viewer.patches.push(patch)
      Object.assign(viewer.state, patch)
    },
    getState: () => viewer.state,
    zoomToFit: vi.fn(),
    flyTo: vi.fn(),
    degreeOf: vi.fn(() => 2),
    defaultFocusName: vi.fn(() => 'A')
  }
  return viewer
}

const makeData = () => ({
  title: '测试图',
  nodes: [
    { name: 'A', category: '基础', des: '甲', symbolSize: 50 },
    { name: 'B', category: '进阶', des: '', symbolSize: 30 },
    { name: 'C', category: '基础', des: '丙', symbolSize: 40 }
  ],
  links: [
    { source: 'A', target: 'B', name: 'e1', des: '' },
    { source: 'A', target: 'C', name: '', des: '' }
  ],
  categories: [{ name: '基础' }, { name: '进阶' }]
})

let doc
beforeEach(() => {
  doc = makeDoc()
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { matchMedia: vi.fn(() => ({ matches: false })) })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const mount = (opts = {}) => {
  const viewer = makeViewer(opts.viewerState)
  const data = { ...makeData(), ...opts.data }
  const ui = createUi(doc.body, data, viewer, { lang: 'zh', ...opts })
  return { ui, viewer, root: doc.body }
}

describe('头部：标题 / 计数 / 搜索框', () => {
  it('标题回落 XKnowledge（导出无标题时）；计数为「n 节点 · m 连接」', () => {
    const { root } = mount({ data: { title: '' } })
    expect(findByTestId(root, 'xk-title').textContent).toBe('XKnowledge')
    expect(findByTestId(root, 'xk-count').textContent).toBe('3 节点 · 2 连接')
  })

  it('en 语言：计数与搜索占位符切英文', () => {
    const { root } = mount({ lang: 'en' })
    expect(findByTestId(root, 'xk-count').textContent).toBe('3 nodes · 2 links')
    expect(findByTestId(root, 'xk-search-input').placeholder).toBe('Search nodes…')
  })
})

describe('图例：类目色与 viewer 隐藏态单源接线', () => {
  it('每类目一个 chip，色点用同一 assignCategoryColors 分配，初始不动 viewer', () => {
    const { root, viewer } = mount()
    const chips = collectChips(root)
    expect(chips.length).toBe(2)
    const catColors = assignCategoryColors(['基础', '进阶'])
    const dots = chips.map((c) => c.children.find((ch) => ch.className === 'dot'))
    const labels = chips.map((c) => c.children.find((ch) => ch.className !== 'dot'))
    expect(dots.map((d) => d.style.background)).toEqual([
      catColors.get('基础'),
      catColors.get('进阶')
    ])
    expect(labels.map((l) => l.textContent)).toEqual(['基础', '进阶'])
    // 构造期只应用初始主题（跟随系统），不动可见性/聚焦
    expect(viewer.patches).toEqual([{ theme: 'light' }])
  })

  it('点击 chip：隐藏类目进 Set、chip 标 off；再点还原', () => {
    const { root, viewer } = mount()
    const chip = collectChips(root)[0]
    chip.fire('click')
    expect(viewer.state.hiddenCategories.has('基础')).toBe(true)
    expect(chip.dataset.off).toBe('1')
    chip.fire('click')
    expect(viewer.state.hiddenCategories.has('基础')).toBe(false)
    expect(chip.dataset.off).toBe('')
  })
})

describe('详情面板：showNode', () => {
  it('命中节点：名称/类目/描述/连接数填充并滑出', () => {
    const { ui, root } = mount()
    ui.showNode('A')
    const panel = findByTestId(root, 'xk-panel')
    expect(panel.dataset.open).toBe('1')
    expect(panel.children[0].textContent).toBe('A') // h3 名称
    expect(panel.children[1].textContent).toBe('类目：基础')
    expect(panel.children[2].textContent).toBe('甲')
    expect(panel.children[3].textContent).toBe('2 个连接')
  })

  it('未知节点：面板收起不炸', () => {
    const { ui, root } = mount()
    ui.showNode('不存在')
    expect(findByTestId(root, 'xk-panel').dataset.open).toBe('')
  })
})

describe('视图卡片：折叠 / 标签 / 聚焦 / 跳数 / 复位', () => {
  it('点击卡片头折叠：collapsed 标记 + 箭头与 aria 翻转，再点还原', () => {
    const { root } = mount()
    const toggle = findByTestId(root, 'xk-ctrl-toggle')
    const ctrl = toggle.parent.parent // toggle → xk-ctrl-head → xk-ctrl
    toggle.parent.fire('click')
    expect(ctrl.dataset.collapsed).toBe('1')
    expect(toggle.textContent).toBe('›')
    expect(toggle.attrs['aria-expanded']).toBe('false')
    toggle.parent.fire('click')
    expect(ctrl.dataset.collapsed).toBe('')
    expect(toggle.textContent).toBe('‹')
    expect(toggle.attrs['aria-expanded']).toBe('true')
  })

  it('标签开关：checkbox change 冒泡到 label → setState({showSmallLabels})', () => {
    const { root, viewer } = mount()
    const cb = findByTestId(root, 'xk-labels-toggle')
    cb.checked = true
    cb.parent.fire('change') // 监听在 <label> 上（真实 DOM 由 checkbox 冒泡）
    expect(viewer.patches).toContainEqual({ showSmallLabels: true })
  })

  it('聚焦下拉：开启且无焦点 → patch 补焦点（无选中时用默认焦点）；off 只带模式', () => {
    const { root, viewer } = mount()
    const sel = findByTestId(root, 'xk-focus-mode')
    sel.value = 'focus'
    sel.fire('change')
    expect(viewer.patches).toContainEqual({ focusMode: 'focus', focusName: 'A' })
    sel.value = 'off'
    sel.fire('change')
    expect(viewer.patches).toContainEqual({ focusMode: 'off' })
  })

  it('聚焦下拉：当前选中优先于默认焦点', () => {
    const { root, viewer } = mount({ viewerState: { selected: 'B' } })
    const sel = findByTestId(root, 'xk-focus-mode')
    sel.value = 'deep'
    sel.fire('change')
    expect(viewer.patches).toContainEqual({ focusMode: 'deep', focusName: 'B' })
  })

  it('聚焦下拉：已有焦点时切模式不重选（换强度不换探照位置）', () => {
    const { root, viewer } = mount({ viewerState: { focusName: 'C' } })
    const sel = findByTestId(root, 'xk-focus-mode')
    sel.value = 'deep'
    sel.fire('change')
    expect(viewer.patches).toContainEqual({ focusMode: 'deep' })
  })

  it('跳数下拉：值转数字进 patch', () => {
    const { root, viewer } = mount()
    const sel = findByTestId(root, 'xk-focus-hops')
    sel.value = '3'
    sel.fire('change')
    expect(viewer.patches).toContainEqual({ focusHops: 3 })
  })

  it('复位按钮：调 zoomToFit', () => {
    const { root, viewer } = mount()
    findByTestId(root, 'xk-reset-btn').fire('click')
    expect(viewer.zoomToFit).toHaveBeenCalledTimes(1)
  })
})

describe('搜索：命中计数 + Enter 循环步进', () => {
  it('输入即搜：计数「n · 当前序号」并飞向当前项', () => {
    const { root, viewer } = mount()
    const input = findByTestId(root, 'xk-search-input')
    viewer.state.searchHits = ['A', 'B']
    input.value = 'A'
    input.fire('input')
    expect(viewer.state.searchKeyword).toBe('A')
    expect(findByTestId(root, 'xk-search-count').textContent).toBe('2 · 1')
    expect(viewer.flyTo).toHaveBeenCalledWith('A')
  })

  it('Enter 步进循环（末尾回绕），searchActive 跟随', () => {
    const { root, viewer } = mount()
    const input = findByTestId(root, 'xk-search-input')
    viewer.state.searchHits = ['A', 'B']
    input.value = 'A'
    input.fire('input')
    input.fire('keydown', { key: 'Enter' })
    expect(viewer.state.searchActive).toBe('B')
    expect(findByTestId(root, 'xk-search-count').textContent).toBe('2 · 2')
    expect(viewer.flyTo).toHaveBeenLastCalledWith('B')
    input.fire('keydown', { key: 'Enter' })
    expect(viewer.state.searchActive).toBe('A') // 循环回绕
    expect(findByTestId(root, 'xk-search-count').textContent).toBe('2 · 1')
  })

  it('非 Enter 键不步进；无命中显示「无匹配」且不飞', () => {
    const { root, viewer } = mount()
    const input = findByTestId(root, 'xk-search-input')
    viewer.state.searchHits = []
    input.value = 'zzz'
    input.fire('input')
    expect(findByTestId(root, 'xk-search-count').textContent).toBe('无匹配')
    input.fire('keydown', { key: 'Enter' })
    input.fire('keydown', { key: 'a' })
    expect(viewer.flyTo).not.toHaveBeenCalled()
  })

  it('清空输入：计数清空', () => {
    const { root, viewer } = mount()
    const input = findByTestId(root, 'xk-search-input')
    viewer.state.searchHits = ['A']
    input.value = 'A'
    input.fire('input')
    input.value = ''
    input.fire('input')
    expect(findByTestId(root, 'xk-search-count').textContent).toBe('')
  })
})

describe('主题：初始跟随系统，按钮循环切换', () => {
  it('系统深色 → 初始 dark；按钮切换 light ↔ dark', () => {
    vi.stubGlobal('window', { matchMedia: vi.fn(() => ({ matches: true })) })
    const { root, viewer } = mount()
    expect(doc.body.dataset.theme).toBe('dark')
    expect(viewer.state.theme).toBe('dark')
    findByTestId(root, 'xk-theme-btn').fire('click')
    expect(doc.body.dataset.theme).toBe('light')
    expect(viewer.state.theme).toBe('light')
    findByTestId(root, 'xk-theme-btn').fire('click')
    expect(doc.body.dataset.theme).toBe('dark')
  })

  it('无 matchMedia（老环境）→ 初始 light 不炸', () => {
    vi.stubGlobal('window', {})
    const { viewer } = mount()
    expect(viewer.state.theme).toBe('light')
  })
})

describe('底部导航提示与水印', () => {
  it('覆盖 three-render-objects 硬编码英文为 viewer 语言', () => {
    const navInfo = makeEl('div')
    navInfo.className = 'scene-nav-info'
    doc = makeDoc(navInfo)
    vi.stubGlobal('document', doc)
    mount()
    expect(navInfo.textContent).toBe('左键：旋转　右键：平移　滚轮：缩放　拖节点：移动')
  })

  it('navInfo 不存在：不炸（库版本变化防御）', () => {
    expect(() => mount()).not.toThrow()
  })

  it('水印：By XKnowledge', () => {
    const { root } = mount()
    expect(findByTestId(root, 'xk-watermark').textContent).toBe('By XKnowledge')
  })
})
