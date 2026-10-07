// viewer.js 单测（导出查看器 3D 核心）：mock 3d-force-graph 为链式记录
// 假图、three-spritetext 为纯对象假 sprite、ResizeObserver 为桩——状态机
// 与组合色/可见性/标签 accessor 全部可离线驱动。语义单源的对端（编辑器）
// 由 graphData.test/categoryColor.test 锁纯函数，这里锁 viewer 的接线：
// 构图参数（大小图力模拟、斥力映射、初始尺寸）、图实例吃拷贝、nodeLabel
// 双语分隔、点击/背景点击的选中与焦点移动、setState 各 patch 的最小化
// 应用（搜索命中、类目隐藏 ∪ 深度聚焦隐藏、组合色优先级、主题全量
// refresh、小节点标签阈值）、flyTo 的无坐标防御与相机参数、dispose。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SCENE_COLORS } from '../../src/renderer/src/utils/graphData'
import { assignCategoryColors } from '../../src/renderer/src/utils/categoryColor'

const { FakeGraph, FakeSpriteText, FakeResizeObserver } = vi.hoisted(() => {
  /** 链式记录假图：accessor/handler 全量捕获供测试驱动 */
  class FakeGraph {
    constructor(container) {
      this.container = container
      this.handlers = {}
      this.accessors = {}
      this.bgColor = null
      this.refreshCount = 0
      this.cameraCalls = []
      this.zoomToFitCalls = []
      this.alphaDecay = null
      this.cooldown = null
      this.chargeStrength = null
      this.strengthCalled = false
      this.rendererSize = null
      this.sizes = [0, 0]
      this._data = null
    }
    d3AlphaDecay(v) {
      this.alphaDecay = v
      return this
    }
    cooldownTime(v) {
      this.cooldown = v
      return this
    }
    d3Force(name) {
      if (name !== 'charge') return null
      const self = this
      return {
        strength(v) {
          self.chargeStrength = v
          self.strengthCalled = true
          return this
        }
      }
    }
    width(v) {
      this.sizes[0] = v
      return this
    }
    height(v) {
      this.sizes[1] = v
      return this
    }
    renderer() {
      const self = this
      return { setSize: (w, h) => (self.rendererSize = [w, h]) }
    }
    graphData(d) {
      if (d === undefined) return this._data
      this._data = d
      return this
    }
    nodeId() {
      return this
    }
    backgroundColor(c) {
      this.bgColor = c
      return this
    }
    nodeVal(fn) {
      this.accessors.nodeVal = fn
      return this
    }
    nodeRelSize() {
      return this
    }
    linkWidth() {
      return this
    }
    nodeLabel(fn) {
      this.accessors.nodeLabel = fn
      return this
    }
    linkLabel(fn) {
      this.accessors.linkLabel = fn
      return this
    }
    onNodeClick(fn) {
      this.handlers.onNodeClick = fn
      return this
    }
    onBackgroundClick(fn) {
      this.handlers.onBackgroundClick = fn
      return this
    }
    nodeVisibility(fn) {
      this.accessors.nodeVisibility = fn
      return this
    }
    linkVisibility(fn) {
      this.accessors.linkVisibility = fn
      return this
    }
    nodeColor(fn) {
      this.accessors.nodeColor = fn
      return this
    }
    linkColor(fn) {
      this.accessors.linkColor = fn
      return this
    }
    nodeThreeObjectExtend() {
      return this
    }
    nodeThreeObject(fn) {
      this.accessors.nodeThreeObject = fn
      return this
    }
    refresh() {
      this.refreshCount++
    }
    cameraPosition(...args) {
      this.cameraCalls.push(args)
    }
    zoomToFit(ms, pad) {
      this.zoomToFitCalls.push([ms, pad])
    }
  }
  class FakeSpriteText {
    constructor(text) {
      this.text = text
      this.textHeight = 0
      this.color = ''
      this.position = { set: (x, y, z) => (this.pos = [x, y, z]) }
    }
  }
  class FakeResizeObserver {
    constructor(cb) {
      this.cb = cb
      this.disconnected = false
      FakeResizeObserver.instances.push(this)
    }
    observe() {}
    disconnect() {
      this.disconnected = true
    }
  }
  FakeResizeObserver.instances = []
  return { FakeGraph, FakeSpriteText, FakeResizeObserver }
})

vi.mock('3d-force-graph', () => ({ default: FakeGraph }))
vi.mock('three-spritetext', () => ({ default: FakeSpriteText }))

import { createViewer } from '../../src/viewer/viewer.js'

/**
 * A(50)/B(30)/C(40) 连通 + D(50) 孤点；类目「基础/进阶」。
 * A 度数 2 为默认焦点；D 在 A 的 1 跳邻域外。
 * sizes [30,40,50,50] → 关闭小标签开关时阈值 50：B/C 无标签，A/D 有。
 */
const makeData = () => ({
  version: 1,
  title: '测试图',
  lang: 'zh-CN',
  repulsion: 60,
  categories: [{ name: '基础' }, { name: '进阶' }],
  nodes: [
    { name: 'A', des: '甲', symbolSize: 50, category: '基础' },
    { name: 'B', des: '', symbolSize: 30, category: '基础' },
    { name: 'C', des: '丙', symbolSize: 40, category: '进阶' },
    { name: 'D', des: '', symbolSize: 50, category: '进阶' }
  ],
  links: [
    { source: 'A', target: 'B', name: 'e1', des: '' },
    { source: 'A', target: 'C', name: '', des: '' }
  ]
})

const container = () => ({ clientWidth: 800, clientHeight: 600 })

beforeEach(() => {
  FakeResizeObserver.instances.length = 0
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createViewer 构图', () => {
  it('小图：常温力模拟（alphaDecay 0.0228 / cooldown 15000）+ 容器初始尺寸', () => {
    const { graph } = createViewer(container(), makeData())
    expect(graph.alphaDecay).toBe(0.0228)
    expect(graph.cooldown).toBe(15000)
    expect(graph.sizes).toEqual([800, 600])
    expect(graph.rendererSize).toEqual([800, 600])
  })

  it('大图（>2000 节点）：加速收敛（alphaDecay 0.05 / cooldown 10000）', () => {
    const data = makeData()
    data.nodes = Array.from({ length: 2001 }, (_, i) => ({
      name: `n${i}`,
      des: '',
      symbolSize: 50,
      category: '基础'
    }))
    data.links = []
    const { graph } = createViewer(container(), data)
    expect(graph.alphaDecay).toBe(0.05)
    expect(graph.cooldown).toBe(10000)
  })

  it('斥力随导出携带：charge 强度 = -repulsion/10', () => {
    const { graph } = createViewer(container(), makeData())
    expect(graph.chargeStrength).toBe(-6)
  })

  it('旧版导出物（无 repulsion/非正数）：不动库默认斥力', () => {
    const noRep = makeData()
    delete noRep.repulsion
    const { graph } = createViewer(container(), noRep)
    expect(graph.strengthCalled).toBe(false)

    const badRep = makeData()
    badRep.repulsion = -5
    const { graph: g2 } = createViewer(container(), badRep)
    expect(g2.strengthCalled).toBe(false)
  })

  it('图实例吃拷贝：datum 与源数据脱钩（库会挂 d3 坐标与 __threeObj）', () => {
    const data = makeData()
    const { graph } = createViewer(container(), data)
    expect(graph.graphData().nodes[0]).not.toBe(data.nodes[0])
    expect(graph.graphData().nodes[0].name).toBe('A')
    expect(graph.graphData().links[0]).not.toBe(data.links[0])
  })

  it('nodeVal：半径与 symbolSize 线性成正比（val = size³/2500）', () => {
    const { graph } = createViewer(container(), makeData())
    expect(graph.accessors.nodeVal({ symbolSize: 50 })).toBe(50)
    expect(graph.accessors.nodeVal({})).toBe(50) // 缺省 50 同公式
    expect(graph.accessors.nodeVal({ symbolSize: 10 })).toBe(0.4)
  })

  it('nodeLabel：有 des 拼接分隔符、无 des 只显名；分隔符可注入（viewer i18n）', () => {
    const { graph } = createViewer(container(), makeData())
    expect(graph.accessors.nodeLabel({ name: 'A', des: '甲' })).toBe('A: 甲')
    expect(graph.accessors.nodeLabel({ name: 'B', des: '' })).toBe('B')

    const { graph: g2 } = createViewer(container(), makeData(), { nodeLabelSep: '：' })
    expect(g2.accessors.nodeLabel({ name: 'A', des: '甲' })).toBe('A：甲')
  })

  it('linkLabel：有边名显名，无边名空串（悬停无噪音）', () => {
    const { graph } = createViewer(container(), makeData())
    expect(graph.accessors.linkLabel({ name: 'e1' })).toBe('e1')
    expect(graph.accessors.linkLabel({ name: '' })).toBe('')
  })
})

describe('点击语义（编辑器同款）', () => {
  it('节点点击：选中恒更新，回调透传 datum', () => {
    const onNodeClick = vi.fn()
    const { graph, getState } = createViewer(container(), makeData(), { onNodeClick })
    const datum = { name: 'A' }
    graph.handlers.onNodeClick(datum)
    expect(getState().selected).toBe('A')
    expect(onNodeClick).toHaveBeenCalledWith(datum)
  })

  it('聚焦开启时点击移焦点（探照语义）：selected 与 focusName 同步', () => {
    const { graph, setState, getState } = createViewer(container(), makeData())
    setState({ focusMode: 'focus', focusName: 'A' })
    graph.handlers.onNodeClick({ name: 'D' })
    expect(getState().selected).toBe('D')
    expect(getState().focusName).toBe('D')
  })

  it('背景点击：清选中（有选中才清，无选中不触发重着色链）', () => {
    const { graph, setState, getState } = createViewer(container(), makeData())
    setState({ selected: 'A' })
    graph.handlers.onBackgroundClick()
    expect(getState().selected).toBe(null)
  })
})

describe('setState：搜索（searchGraphNodes 真实驱动）', () => {
  it('关键词命中 name/des，searchActive 落首个命中', () => {
    const { setState, getState } = createViewer(container(), makeData())
    setState({ searchKeyword: '甲' }) // 命中 A 的 des
    expect(getState().searchHits).toEqual(['A'])
    expect(getState().searchActive).toBe('A')
    setState({ searchKeyword: 'A' })
    expect(getState().searchHits).toEqual(['A']) // 只有 A 名含 a
  })

  it('隐藏类目的节点不进命中集', () => {
    const { setState, getState } = createViewer(container(), makeData())
    setState({ hiddenCategories: new Set(['进阶']) })
    setState({ searchKeyword: 'a' })
    expect(getState().searchHits).toEqual(['A']) // C（进阶）即便名含 c 也不在
  })

  it('hiddenCategories 与 searchKeyword 同 patch 时一并重算', () => {
    const { setState, getState } = createViewer(container(), makeData())
    setState({ searchKeyword: 'a', hiddenCategories: new Set(['基础']) })
    // A/B 均为基础类目被隐藏，无命中
    expect(getState().searchHits).toEqual([])
    expect(getState().searchActive).toBe(null)
  })
})

describe('setState：可见性（类目隐藏 ∪ 深度聚焦隐藏，搜索命中豁免）', () => {
  it('类目隐藏：该类目节点与至少一端在隐藏类目的边都不可见', () => {
    const { graph, setState } = createViewer(container(), makeData())
    setState({ hiddenCategories: new Set(['基础']) })
    const nv = graph.accessors.nodeVisibility
    expect(nv({ name: 'A', category: '基础' })).toBe(false)
    expect(nv({ name: 'C', category: '进阶' })).toBe(true)
    const lv = graph.accessors.linkVisibility
    expect(lv({ source: 'A', target: 'B' })).toBe(false) // 两端均隐藏
    expect(lv({ source: 'A', target: 'C' })).toBe(false) // 一端隐藏即隐藏
  })

  it('deep 聚焦：邻域外隐藏，搜索命中豁免', () => {
    const { graph, setState } = createViewer(container(), makeData())
    setState({ searchKeyword: 'D' }) // D 在搜索命中集
    setState({ focusMode: 'deep', focusName: 'A', focusHops: 1 }) // 邻域 {A,B,C}
    const nv = graph.accessors.nodeVisibility
    expect(nv({ name: 'D', category: '进阶' })).toBe(true) // 搜索豁免
    setState({ searchKeyword: '' })
    expect(graph.accessors.nodeVisibility({ name: 'D', category: '进阶' })).toBe(false)
    expect(graph.accessors.nodeVisibility({ name: 'B', category: '基础' })).toBe(true)
    // deep 的边：任一端邻域外即隐藏
    expect(graph.accessors.linkVisibility({ source: 'A', target: 'D' })).toBe(false)
  })

  it('focus（灰化）不动可见性：邻域外仍可见（只退色）', () => {
    const { graph, setState } = createViewer(container(), makeData())
    setState({ focusMode: 'focus', focusName: 'A', focusHops: 1 })
    expect(graph.accessors.nodeVisibility({ name: 'D', category: '进阶' })).toBe(true)
  })
})

describe('setState：组合色（优先级：选中 > 搜索当前项 > 命中 > 聚焦外灰 > 类目色）', () => {
  it('无任何状态：类目色（与图例同一 assignCategoryColors 分配）', () => {
    const data = makeData()
    const { graph } = createViewer(container(), data)
    const catColors = assignCategoryColors(data.categories.map((c) => c.name))
    expect(graph.accessors.nodeColor({ name: 'A', category: '基础' })).toBe(catColors.get('基础'))
    expect(graph.accessors.nodeColor({ name: 'C', category: '进阶' })).toBe(catColors.get('进阶'))
  })

  it('选中最高优先；其次搜索当前项/命中色', () => {
    const { graph, setState } = createViewer(container(), makeData())
    setState({ searchKeyword: '甲' }) // 命中 A
    expect(graph.accessors.nodeColor({ name: 'A', category: '基础' })).toBe(
      SCENE_COLORS.light.active
    )
    setState({ selected: 'D' })
    expect(graph.accessors.nodeColor({ name: 'D', category: '进阶' })).toBe(SCENE_COLORS.light.hl)
    // 非当前项的命中节点用命中色
    setState({ selected: null, searchActive: 'B' })
    expect(graph.accessors.nodeColor({ name: 'A', category: '基础' })).toBe(SCENE_COLORS.light.hit)
  })

  it('聚焦邻域外退灰（节点与两端不全在邻域的边）', () => {
    const { graph, setState } = createViewer(container(), makeData())
    setState({ focusMode: 'focus', focusName: 'A', focusHops: 1 }) // 邻域 {A,B,C}
    expect(graph.accessors.nodeColor({ name: 'D', category: '进阶' })).toBe(SCENE_COLORS.light.dim)
    expect(graph.accessors.nodeColor({ name: 'B', category: '基础' })).not.toBe(
      SCENE_COLORS.light.dim
    )
    expect(graph.accessors.linkColor({ source: 'A', target: 'D' })).toBe(SCENE_COLORS.light.dim)
    expect(graph.accessors.linkColor({ source: 'A', target: 'B' })).toBe(SCENE_COLORS.light.link)
  })

  it('主题切换：背景换场景色 + 全量 refresh（低频操作不走增量）', () => {
    const { graph, setState } = createViewer(container(), makeData())
    const before = graph.refreshCount
    setState({ theme: 'dark' })
    expect(graph.bgColor).toBe(SCENE_COLORS.dark.bg)
    expect(graph.refreshCount).toBe(before + 1)
  })
})

describe('setState：标签（阈值语义单源 labelThreshold）', () => {
  it('默认（小图开关关）：小于阈值的节点无标签，达标节点挂 sprite（label 色）', () => {
    const { graph } = createViewer(container(), makeData())
    const nto = graph.accessors.nodeThreeObject
    expect(nto({ name: 'B', symbolSize: 30 })).toBe(null)
    expect(nto({ name: 'C', symbolSize: 40 })).toBe(null)
    const sprite = nto({ name: 'A', symbolSize: 50 })
    expect(sprite).toBeInstanceOf(FakeSpriteText)
    expect(sprite.text).toBe('A')
    expect(sprite.textHeight).toBe(5)
    expect(sprite.pos).toEqual([0, 7, 0])
    expect(sprite.color).toBe(SCENE_COLORS.light.label)
  })

  it('主题切换重建标签时聚焦 dim 重算（全量 refresh 是标签退灰的唯一入口）', () => {
    const { graph, setState } = createViewer(container(), makeData())
    setState({ focusMode: 'focus', focusName: 'A', focusHops: 1 }) // 邻域 {A,B,C}
    setState({ theme: 'dark' }) // applyTheme → applyLabels 以当前聚焦态重建
    const sprite = graph.accessors.nodeThreeObject({ name: 'D', symbolSize: 50 })
    expect(sprite.color).toBe(SCENE_COLORS.dark.dim)
    const inside = graph.accessors.nodeThreeObject({ name: 'B', symbolSize: 30 })
    expect(inside).toBe(null) // 阈值语义不受主题影响
  })

  it('showSmallLabels 开：全显（阈值 -Infinity，B 也挂标签）', () => {
    const { graph, setState } = createViewer(container(), makeData())
    setState({ showSmallLabels: true })
    expect(graph.accessors.nodeThreeObject({ name: 'B', symbolSize: 30 })).not.toBe(null)
  })
})

describe('工具出口', () => {
  it('degreeOf：数据侧统计（与场景对象无关）', () => {
    const { degreeOf } = createViewer(container(), makeData())
    expect(degreeOf('A')).toBe(2)
    expect(degreeOf('D')).toBe(0)
    expect(degreeOf('不存在')).toBe(0)
  })

  it('defaultFocusName：度数最高（编辑器同规则）', () => {
    const { defaultFocusName } = createViewer(container(), makeData())
    expect(defaultFocusName()).toBe('A')
  })

  it('flyTo：无坐标（动态成形未跑完）不动作；有坐标按 45° 偏移飞', () => {
    const { graph, flyTo } = createViewer(container(), makeData())
    flyTo('A')
    expect(graph.cameraCalls.length).toBe(0)

    const g = graph.graphData().nodes.find((n) => n.name === 'A')
    g.x = 30
    g.y = -30
    g.z = 60
    flyTo('A')
    expect(graph.cameraCalls.length).toBe(1)
    const [pos, lookAt, ms] = graph.cameraCalls[0]
    expect(lookAt).toEqual({ x: 30, y: -30, z: 60 })
    const fac = Math.sqrt((120 * 120) / 3)
    expect(pos).toEqual({ x: 30 + fac, y: -30 + fac, z: 60 + fac })
    expect(ms).toBe(600)
  })

  it('flyTo 目标不存在：不动作', () => {
    const { graph, flyTo } = createViewer(container(), makeData())
    flyTo('不存在')
    expect(graph.cameraCalls.length).toBe(0)
  })

  it('zoomToFit：(600ms, 80px 边距)', () => {
    const { graph, zoomToFit } = createViewer(container(), makeData())
    zoomToFit()
    expect(graph.zoomToFitCalls).toEqual([[600, 80]])
  })

  it('dispose：断开 ResizeObserver', () => {
    const { dispose } = createViewer(container(), makeData())
    expect(FakeResizeObserver.instances.length).toBe(1)
    dispose()
    expect(FakeResizeObserver.instances[0].disconnected).toBe(true)
  })
})
