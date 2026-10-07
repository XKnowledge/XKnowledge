// viewer/index.js 单测（导出查看器入口 boot）：mock 三个子模块
//（styles/viewer/ui）+ 手写 document 桩，锁定——坏数据（非 JSON / nodes
// 空）只写错误文案不建图；好数据按序 注入样式 → 建 viewer → 建 UI →
// 接线 onNodeClick→showNode（可变引用，先 viewer 后 UI 也不丢点击）；
// 语言跟随导出 data.lang（nodeLabelSep / html lang / createUi lang）；
// window.__XK_VIEWER__ 暴露实例；readyState loading 时延迟到
// DOMContentLoaded。pickViewerLang 语义由 viewer/i18n.test 锁定。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  injectStyles: vi.fn(),
  createViewer: vi.fn(),
  createUi: vi.fn()
}))

vi.mock('../../src/viewer/styles.js', () => ({ injectStyles: mocks.injectStyles }))
vi.mock('../../src/viewer/viewer.js', () => ({ createViewer: mocks.createViewer }))
vi.mock('../../src/viewer/ui.js', () => ({ createUi: mocks.createUi }))

const makeDoc = ({ dataText = '{}', readyState = 'complete' } = {}) => {
  const listeners = {}
  const dataEl = { textContent: dataText }
  const graphEl = { id: 'graph3d' }
  return {
    readyState,
    body: { textContent: '' },
    documentElement: { lang: '' },
    getElementById: (id) => (id === 'xk-data' ? dataEl : id === 'graph3d' ? graphEl : null),
    addEventListener: (type, fn) => {
      listeners[type] = fn
    },
    fireDomContentLoaded: () => listeners.DOMContentLoaded?.(),
    els: { dataEl, graphEl }
  }
}

const validData = () => ({
  version: 1,
  title: 'T',
  lang: 'en',
  categories: [{ name: 'c' }],
  nodes: [{ name: 'A', des: '', symbolSize: 50, category: 'c' }],
  links: []
})

/** 每个用例独立模块图：boot 是 import 副作用，resetModules 后重放 */
const boot = async (doc) => {
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', {})
  await import('../../src/viewer/index.js')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('boot：坏数据分支', () => {
  it('非 JSON：body 写错误文案，不建图不注入样式', async () => {
    const doc = makeDoc({ dataText: '不是 JSON' })
    await boot(doc)
    expect(doc.body.textContent).toBe('Invalid XKnowledge viewer data.')
    expect(mocks.createViewer).not.toHaveBeenCalled()
    expect(mocks.injectStyles).not.toHaveBeenCalled()
    expect(globalThis.window.__XK_VIEWER__).toBeUndefined()
  })

  it('nodes 为空数组：同坏数据分支（viewer 拒载空图）', async () => {
    const doc = makeDoc({ dataText: JSON.stringify({ nodes: [], links: [] }) })
    await boot(doc)
    expect(doc.body.textContent).toBe('Invalid XKnowledge viewer data.')
    expect(mocks.createViewer).not.toHaveBeenCalled()
  })

  it('nodes 缺失（旧版/被改坏）：同坏数据分支', async () => {
    const doc = makeDoc({ dataText: JSON.stringify({ title: 'x' }) })
    await boot(doc)
    expect(doc.body.textContent).toBe('Invalid XKnowledge viewer data.')
  })
})

describe('boot：好数据装配', () => {
  it('按序 注入样式 → 建 viewer（容器/数据/回调）→ 建 UI → 暴露实例', async () => {
    const viewer = { mark: 'viewer' }
    const showNode = vi.fn()
    mocks.createViewer.mockReturnValue(viewer)
    mocks.createUi.mockReturnValue({ showNode })
    const doc = makeDoc({ dataText: JSON.stringify(validData()) })
    await boot(doc)

    expect(mocks.injectStyles).toHaveBeenCalledTimes(1)
    expect(mocks.createViewer).toHaveBeenCalledTimes(1)
    expect(mocks.createUi).toHaveBeenCalledTimes(1)

    const [container, data, handlers] = mocks.createViewer.mock.calls[0]
    expect(container).toBe(doc.els.graphEl)
    expect(data).toEqual(validData())
    expect(typeof handlers.onNodeClick).toBe('function')

    // UI 在 viewer 之后创建，节点点击经可变引用接线——boot 后点击即达 showNode
    handlers.onNodeClick({ name: 'A' })
    expect(showNode).toHaveBeenCalledWith('A')

    expect(mocks.createUi).toHaveBeenCalledWith(doc.body, data, viewer, { lang: 'en' })
    expect(doc.documentElement.lang).toBe('en')
    expect(handlers.nodeLabelSep).toBe(': ') // en 分隔符
    expect(globalThis.window.__XK_VIEWER__).toBe(viewer)
  })

  it('zh 导出：html lang=zh、nodeLabelSep 全角冒号、UI lang=zh', async () => {
    const data = { ...validData(), lang: 'zh-CN' }
    mocks.createViewer.mockReturnValue({})
    mocks.createUi.mockReturnValue({ showNode: vi.fn() })
    const doc = makeDoc({ dataText: JSON.stringify(data) })
    await boot(doc)
    const [, , handlers] = mocks.createViewer.mock.calls[0]
    expect(handlers.nodeLabelSep).toBe('：')
    expect(doc.documentElement.lang).toBe('zh')
    expect(mocks.createUi.mock.calls[0][3]).toEqual({ lang: 'zh' })
  })
})

describe('boot：DOMContentLoaded 延迟', () => {
  it('readyState=loading：import 时不动，事件到来才装配', async () => {
    const viewer = {}
    mocks.createViewer.mockReturnValue(viewer)
    mocks.createUi.mockReturnValue({ showNode: vi.fn() })
    const doc = makeDoc({ dataText: JSON.stringify(validData()), readyState: 'loading' })
    await boot(doc)
    expect(mocks.createViewer).not.toHaveBeenCalled()

    doc.fireDomContentLoaded()
    expect(mocks.createViewer).toHaveBeenCalledTimes(1)
    expect(mocks.createUi).toHaveBeenCalledTimes(1)
    expect(globalThis.window.__XK_VIEWER__).toBe(viewer)
  })
})
