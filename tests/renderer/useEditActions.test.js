// useEditActions 单测：编辑动作的 UI 编排层——撤销/重做/三路删除的
// 「意图成功才复位面板」、复制三路分发（框选 → 直选边 → 最后点击节点，
// collectCopySelection 真实驱动 + 白名单序列化落剪贴板）、粘贴的剪贴板
// 解析与空批次分支、大纲导入的对话框收起、画布直操建点/建边的录制守卫
// 与错误播报/落点回填。文档域语义由 useDocument.test 锁定，这里用桩 doc
// 只锁编排：调用顺序、参数透传、message 播报与 afterEdit/close 复位时机。
// node 环境：antd message 模块级 mock；window.electronAPI 桩注入
//（useChartFile.test 同款惯例）；locale 钉 zh-CN 使播报断言确定。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import { useEditActions } from '../../src/renderer/src/composables/useEditActions'
import { i18n } from '../../src/renderer/src/i18n.js'
import { zhCN } from '../../src/shared/locales/zh-CN.js'
import { serializeGraphSelection } from '../../src/shared/graphClipboard.js'

vi.mock('ant-design-vue', () => ({
  message: { error: vi.fn(), info: vi.fn(), success: vi.fn() }
}))

/** 按路径取 zh 文案并做命名插值（与 t 的插值语义一致，钉死断言） */
const zh = (path, params = {}) => {
  let s = path.split('.').reduce((acc, k) => acc[k], zhCN)
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

const node = (name, extra = {}) => ({
  name,
  des: '',
  symbolSize: 50,
  category: 'c1',
  ...extra
})
const link = (source, target, name = '') => ({ source, target, name, des: '' })

/** 桩文档：编排层只关心意图返回值与 chartData 读取 */
const makeDoc = (chart = null, overrides = {}) => ({
  chartData: ref(chart),
  undo: vi.fn(() => true),
  redo: vi.fn(() => true),
  deleteNodeAt: vi.fn(() => true),
  deleteEdgeAt: vi.fn(() => true),
  deleteSelection: vi.fn(() => ({ nodes: 2, links: 3 })),
  paste: vi.fn(() => ({ nodes: [node('X')], links: [link('X', 'Y')], skippedCount: 0 })),
  importOutline: vi.fn(() => true),
  createNode: vi.fn(() => ({ ok: true, data: node('N1') })),
  createEdge: vi.fn(() => ({ ok: true, data: link('A', 'B') })),
  ...overrides
})

const makeSetup = (doc = makeDoc(), overrides = {}) => {
  const currentNodeDataIndex = ref(-1)
  const currentEdgeDataIndex = ref(-1)
  const selectionNodeNames = ref([])
  const selectionLinkIndexes = ref([])
  const graph3dRef = ref(null)
  const afterEdit = vi.fn()
  const closeOutlineImport = vi.fn()
  const actions = useEditActions({
    document: doc,
    currentNodeDataIndex,
    currentEdgeDataIndex,
    selectionNodeNames,
    selectionLinkIndexes,
    graph3dRef,
    afterEdit,
    closeOutlineImport,
    ...overrides
  })
  return {
    actions,
    currentNodeDataIndex,
    currentEdgeDataIndex,
    selectionNodeNames,
    selectionLinkIndexes,
    graph3dRef,
    afterEdit,
    closeOutlineImport
  }
}

/** A-B(e1)、B-C(e2)、A-C(e3)：框选/直选边/单点三路分发各有区分度 */
const makeChart = () => ({
  nodes: [node('A'), node('B'), node('C', { category: 'c2' })],
  links: [link('A', 'B', 'e1'), link('B', 'C', 'e2'), link('A', 'C', 'e3')]
})

const mockElectronAPI = (overrides = {}) => {
  const handlers = {
    writeGraphClipboard: vi.fn().mockResolvedValue(undefined),
    readGraphClipboard: vi.fn().mockResolvedValue({ text: '' }),
    ...overrides
  }
  globalThis.window = { electronAPI: handlers }
  return handlers
}

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh-CN' // 播报文案断言钉中文
})

afterEach(() => {
  delete globalThis.window
})

describe('undo / redo：意图成功才复位面板', () => {
  it('undo 成功 → afterEdit；失败 → 面板不动', () => {
    const s = makeSetup(makeDoc(null, { undo: vi.fn(() => false) }))
    s.actions.undo()
    expect(s.afterEdit).not.toHaveBeenCalled()
    const s2 = makeSetup()
    s2.actions.undo()
    expect(s2.afterEdit).toHaveBeenCalledTimes(1)
  })

  it('redo 同语义', () => {
    const s = makeSetup(makeDoc(null, { redo: vi.fn(() => false) }))
    s.actions.redo()
    expect(s.afterEdit).not.toHaveBeenCalled()
  })
})

describe('三路删除', () => {
  it('deleteNode：透传侧栏索引，成功才复位', () => {
    const doc = makeDoc()
    const s = makeSetup(doc)
    s.currentNodeDataIndex.value = 1
    s.actions.deleteNode()
    expect(doc.deleteNodeAt).toHaveBeenCalledWith(1)
    expect(s.afterEdit).toHaveBeenCalledTimes(1)
  })

  it('deleteNode 失败（索引无效等）→ 面板不动', () => {
    const doc = makeDoc(null, { deleteNodeAt: vi.fn(() => false) })
    const s = makeSetup(doc)
    s.actions.deleteNode()
    expect(s.afterEdit).not.toHaveBeenCalled()
  })

  it('deleteEdge：透传边索引，成功才复位', () => {
    const doc = makeDoc()
    const s = makeSetup(doc)
    s.currentEdgeDataIndex.value = 2
    s.actions.deleteEdge()
    expect(doc.deleteEdgeAt).toHaveBeenCalledWith(2)
    expect(s.afterEdit).toHaveBeenCalledTimes(1)
  })

  it('deleteSelection：整批一条历史后复位并播报计数', () => {
    const doc = makeDoc()
    const s = makeSetup(doc)
    s.selectionNodeNames.value = ['A', 'B']
    s.selectionLinkIndexes.value = [1]
    s.actions.deleteSelection()
    expect(doc.deleteSelection).toHaveBeenCalledWith(['A', 'B'], [1])
    expect(s.afterEdit).toHaveBeenCalledTimes(1)
    expect(message.info).toHaveBeenCalledWith(zh('chart.deletedSummary', { nodes: 2, edges: 3 }))
  })

  it('deleteSelection 空选集（返回 null）→ 不复位不播报', () => {
    const doc = makeDoc(null, { deleteSelection: vi.fn(() => null) })
    const s = makeSetup(doc)
    s.actions.deleteSelection()
    expect(s.afterEdit).not.toHaveBeenCalled()
    expect(message.info).not.toHaveBeenCalled()
  })
})

describe('copySelection：三路分发（collectCopySelection 真实驱动）', () => {
  it('框选集优先：选中节点集内的互连边保留、跨界边排除', async () => {
    const api = mockElectronAPI()
    const s = makeSetup(makeDoc(makeChart()))
    s.selectionNodeNames.value = ['A', 'B'] // 框住 A/B 没框住连线：e1 仍在子图
    await s.actions.copySelection()
    const sent = JSON.parse(api.writeGraphClipboard.mock.calls[0][0])
    expect(sent.nodes.map((n) => n.name).sort()).toEqual(['A', 'B'])
    expect(sent.links.map((l) => l.name)).toEqual(['e1'])
    expect(message.info).toHaveBeenCalledWith(zh('chart.copiedSummary', { nodes: 2, edges: 1 }))
  })

  it('框选 + 直选边：边端点并入节点集（自洽子图）', async () => {
    const api = mockElectronAPI()
    const s = makeSetup(makeDoc(makeChart()))
    s.selectionNodeNames.value = ['A']
    s.selectionLinkIndexes.value = [2] // 直选 A-C：C 一并入选
    await s.actions.copySelection()
    const sent = JSON.parse(api.writeGraphClipboard.mock.calls[0][0])
    expect(sent.nodes.map((n) => n.name).sort()).toEqual(['A', 'C'])
    expect(sent.links.map((l) => l.name)).toEqual(['e3'])
  })

  it('无框选时直选边：该边 + 两端节点', async () => {
    const api = mockElectronAPI()
    const s = makeSetup(makeDoc(makeChart()))
    s.currentEdgeDataIndex.value = 1 // B-C
    await s.actions.copySelection()
    const sent = JSON.parse(api.writeGraphClipboard.mock.calls[0][0])
    expect(sent.nodes.map((n) => n.name).sort()).toEqual(['B', 'C'])
    expect(sent.links).toEqual([{ source: 'B', target: 'C', name: 'e2', des: '' }])
  })

  it('无选中回退最后点击节点：单点无边（要子图用框选）', async () => {
    const api = mockElectronAPI()
    const s = makeSetup(makeDoc(makeChart()))
    s.currentNodeDataIndex.value = 0
    await s.actions.copySelection()
    const sent = JSON.parse(api.writeGraphClipboard.mock.calls[0][0])
    expect(sent.nodes.map((n) => n.name)).toEqual(['A'])
    expect(sent.links).toEqual([])
  })

  it('序列化白名单：力布局坐标与 d3 内部字段不落剪贴板', async () => {
    const api = mockElectronAPI()
    const chart = makeChart()
    chart.nodes[0].x = 10
    chart.nodes[0].y = -3
    chart.nodes[0].z = 88
    chart.nodes[0].vx = 0.1
    const s = makeSetup(makeDoc(chart))
    s.selectionNodeNames.value = ['A']
    await s.actions.copySelection()
    const sent = JSON.parse(api.writeGraphClipboard.mock.calls[0][0])
    expect(sent.nodes[0]).toEqual(node('A'))
  })

  it('无任何选中 / chartData 为 null：不碰剪贴板不播报', async () => {
    const api = mockElectronAPI()
    const s = makeSetup(makeDoc(makeChart()))
    await s.actions.copySelection()
    expect(api.writeGraphClipboard).not.toHaveBeenCalled()
    expect(message.info).not.toHaveBeenCalled()

    const s2 = makeSetup(makeDoc(null))
    s2.selectionNodeNames.value = ['A']
    await s2.actions.copySelection()
    expect(api.writeGraphClipboard).not.toHaveBeenCalled()
  })
})

describe('pasteSelection：剪贴板解析与批次播报', () => {
  const validText = serializeGraphSelection([node('P'), node('Q')], [link('P', 'Q', 'pq')])

  it('非本应用剪贴板内容：提示后中止，不进文档域', async () => {
    mockElectronAPI({ readGraphClipboard: vi.fn().mockResolvedValue({ text: '普通文本' }) })
    const doc = makeDoc(makeChart())
    const s = makeSetup(doc)
    await s.actions.pasteSelection()
    expect(message.info).toHaveBeenCalledWith(zh('chart.clipboardEmpty'))
    expect(doc.paste).not.toHaveBeenCalled()
    expect(s.afterEdit).not.toHaveBeenCalled()
  })

  it('有效批次入图：复位面板并播报计数', async () => {
    mockElectronAPI({ readGraphClipboard: vi.fn().mockResolvedValue({ text: validText }) })
    const doc = makeDoc(makeChart(), {
      paste: vi.fn(() => ({
        nodes: [node('P'), node('Q')],
        links: [link('P', 'Q', 'pq')],
        skippedCount: 0
      }))
    })
    const s = makeSetup(doc)
    await s.actions.pasteSelection()
    expect(doc.paste).toHaveBeenCalledWith([node('P'), node('Q')], [link('P', 'Q', 'pq')])
    expect(s.afterEdit).toHaveBeenCalledTimes(1)
    expect(message.info).toHaveBeenCalledWith(zh('chart.pastedSummary', { nodes: 2, edges: 1 }))
  })

  it('有跳过（同名合并）：播报 skipped 变体', async () => {
    mockElectronAPI({ readGraphClipboard: vi.fn().mockResolvedValue({ text: validText }) })
    const doc = makeDoc(makeChart(), {
      paste: vi.fn(() => ({ nodes: [node('P')], links: [], skippedCount: 1 }))
    })
    const s = makeSetup(doc)
    await s.actions.pasteSelection()
    expect(message.info).toHaveBeenCalledWith(
      zh('chart.pastedSummarySkipped', { nodes: 1, edges: 0, skipped: 1 })
    )
  })

  it('空批次（节点均已存在且无新边）：提示后不动面板', async () => {
    mockElectronAPI({ readGraphClipboard: vi.fn().mockResolvedValue({ text: validText }) })
    const doc = makeDoc(makeChart(), {
      paste: vi.fn(() => ({ nodes: [], links: [], skippedCount: 2 }))
    })
    const s = makeSetup(doc)
    await s.actions.pasteSelection()
    expect(message.info).toHaveBeenCalledWith(zh('chart.pasteNothing'))
    expect(s.afterEdit).not.toHaveBeenCalled()
  })

  it('chartData 为 null：读剪贴板都不发生（最前置的短路）', async () => {
    const api = mockElectronAPI()
    const s = makeSetup(makeDoc(null))
    await s.actions.pasteSelection()
    expect(api.readGraphClipboard).not.toHaveBeenCalled()
  })
})

describe('onOutlineImport：追加合并完成才收起对话框', () => {
  it('有内容入图 → 关闭对话框', () => {
    const s = makeSetup()
    s.actions.onOutlineImport({ nodes: [node('X')], links: [] })
    expect(s.closeOutlineImport).toHaveBeenCalledTimes(1)
    expect(message.info).not.toHaveBeenCalled()
  })

  it('无内容 → 提示且对话框保持打开', () => {
    const doc = makeDoc(null, { importOutline: vi.fn(() => false) })
    const s = makeSetup(doc)
    s.actions.onOutlineImport({ nodes: [], links: [] })
    expect(message.info).toHaveBeenCalledWith(zh('outline.nothingToImport'))
    expect(s.closeOutlineImport).not.toHaveBeenCalled()
  })
})

describe('画布直操建点（onCanvasCreateNode）', () => {
  const payload = { name: 'N1', category: 'c1', symbolSize: undefined, des: undefined }

  it('录制期间只读：不进文档域（组件守卫之外的双保险）', () => {
    const doc = makeDoc()
    const s = makeSetup(doc, { isRecording: () => true })
    s.actions.onCanvasCreateNode({ ...payload, world: {} })
    expect(doc.createNode).not.toHaveBeenCalled()
  })

  it('校验失败（ok:false）→ 全局 message.error，不回填落点', () => {
    const doc = makeDoc(null, {
      createNode: vi.fn(() => ({ ok: false, error: '重名' }))
    })
    const notify = vi.fn()
    const s = makeSetup(doc)
    s.graph3dRef.value = { notifyNodeDropPos: notify }
    s.actions.onCanvasCreateNode({ ...payload, world: {} })
    expect(message.error).toHaveBeenCalledWith('重名')
    expect(notify).not.toHaveBeenCalled()
  })

  it('成功且带 world → 回填落点坐标（notifyNodeDropPos）', () => {
    const doc = makeDoc()
    const notify = vi.fn()
    const s = makeSetup(doc)
    s.graph3dRef.value = { notifyNodeDropPos: notify }
    const world = { x: 1, y: 2, z: 3 }
    s.actions.onCanvasCreateNode({ ...payload, world })
    expect(doc.createNode).toHaveBeenCalledWith(node('N1')) // 缺省补齐 des ''/symbolSize 50
    expect(notify).toHaveBeenCalledWith('N1', world)
    expect(message.error).not.toHaveBeenCalled()
  })

  it('成功但无 world（表单路径等）→ 不回填', () => {
    const doc = makeDoc()
    const notify = vi.fn()
    const s = makeSetup(doc)
    s.graph3dRef.value = { notifyNodeDropPos: notify }
    s.actions.onCanvasCreateNode(payload)
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('画布直操建边（onCanvasCreateEdge）', () => {
  it('录制期间只读：不进文档域', () => {
    const doc = makeDoc()
    const s = makeSetup(doc, { isRecording: () => true })
    s.actions.onCanvasCreateEdge({ source: 'A', target: 'B', name: 'e' })
    expect(doc.createEdge).not.toHaveBeenCalled()
  })

  it('成功入图：无播报', () => {
    const doc = makeDoc()
    const s = makeSetup(doc)
    s.actions.onCanvasCreateEdge({ source: 'A', target: 'B', name: 'e9' })
    expect(doc.createEdge).toHaveBeenCalledWith({ source: 'A', target: 'B', name: 'e9', des: '' })
    expect(message.error).not.toHaveBeenCalled()
  })

  it('失败（端点对重复等）→ 全局 message.error', () => {
    const doc = makeDoc(null, {
      createEdge: vi.fn(() => ({ ok: false, error: '已存在' }))
    })
    const s = makeSetup(doc)
    s.actions.onCanvasCreateEdge({ source: 'A', target: 'B', name: '' })
    expect(message.error).toHaveBeenCalledWith('已存在')
  })
})
