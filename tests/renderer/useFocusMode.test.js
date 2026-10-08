// useFocusMode 单测：聚焦模式状态机——开启路径的焦点选取三级回退
// （当前选中索引 → currentNode 表单 → 默认焦点「度数最高」）、关闭清焦点、
// focusNodeNames 邻域派生（模式/跳数/焦点缺位各分支）、焦点节点被删的
// watch 回退（默认焦点 / 全空 → ''，off 模式不触发）。邻域与默认焦点
// 的纯函数语义由 graphData.test 锁定，这里用「星形 + 尾巴」小图驱动状态机。
import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useFocusMode } from '../../src/renderer/src/composables/useFocusMode'

const node = (name, symbolSize = 50) => ({
  name,
  des: '',
  symbolSize,
  category: 'c1'
})
const link = (source, target, name = '') => ({ source, target, name, des: '' })

/**
 * A 为度数最高（3）：A-B、A-C、A-D，C-E 尾巴。
 * C 的 1 跳邻域 = {C,A,E}（B/D 在外），2 跳 = 全图。
 */
const makeChart = () =>
  ref({
    nodes: [node('A'), node('B'), node('C'), node('D'), node('E')],
    links: [link('A', 'B'), link('A', 'C'), link('A', 'D'), link('C', 'E')]
  })

const makeSetup = (chartData = makeChart()) => {
  const currentNodeDataIndex = ref(-1)
  const currentNode = ref(null)
  const syncCurrentNodeByName = vi.fn()
  const api = useFocusMode({ chartData, currentNodeDataIndex, currentNode, syncCurrentNodeByName })
  return { chartData, currentNodeDataIndex, currentNode, syncCurrentNodeByName, ...api }
}

describe('useFocusMode（聚焦状态机）', () => {
  it('初始态：off / 跳数 2 / 无焦点 / 邻域空', () => {
    const s = makeSetup()
    expect(s.focusMode.value).toBe('off')
    expect(s.focusHops.value).toBe(2)
    expect(s.focusNodeId.value).toBe('')
    expect(s.focusNodeNames.value).toEqual([])
  })

  it('开启：优先当前侧栏选中索引（index 有效 → 节点名）并同步选中', () => {
    const s = makeSetup()
    s.focusMode.value = 'focus'
    s.currentNodeDataIndex.value = 3 // D
    s.onFocusModeChange('focus')
    expect(s.focusNodeId.value).toBe('D')
    expect(s.syncCurrentNodeByName).toHaveBeenCalledWith('D')
  })

  it('开启：索引无效回退 currentNode 表单名', () => {
    const s = makeSetup()
    s.focusMode.value = 'focus'
    s.currentNode.value = node('E')
    s.onFocusModeChange('focus')
    expect(s.focusNodeId.value).toBe('E')
  })

  it('开启：两者皆无 → 默认焦点（度数最高 A）', () => {
    const s = makeSetup()
    s.onFocusModeChange('deep')
    expect(s.focusNodeId.value).toBe('A')
    expect(s.syncCurrentNodeByName).toHaveBeenCalledWith('A')
  })

  it('开启：空图无默认焦点 → 焦点空串、不同步选中', () => {
    const s = makeSetup(ref({ nodes: [], links: [] }))
    s.onFocusModeChange('focus')
    expect(s.focusNodeId.value).toBe('')
    expect(s.syncCurrentNodeByName).not.toHaveBeenCalled()
  })

  it('关闭：清焦点（去色立即消失的语义）', () => {
    const s = makeSetup()
    s.currentNodeDataIndex.value = 0
    s.onFocusModeChange('focus')
    expect(s.focusNodeId.value).toBe('A')
    s.onFocusModeChange('off')
    expect(s.focusNodeId.value).toBe('')
  })

  it('focusNodeNames：焦点 C 一跳 = {C,A,E}，B/D 在邻域外', () => {
    const s = makeSetup()
    s.focusMode.value = 'focus'
    s.focusNodeId.value = 'C'
    s.focusHops.value = 1
    expect([...s.focusNodeNames.value].sort()).toEqual(['A', 'C', 'E'])
  })

  it('focusNodeNames：跳数拉大到 2 → 全图入邻域（A 桥接 B/D）', () => {
    const s = makeSetup()
    s.focusMode.value = 'focus'
    s.focusNodeId.value = 'C'
    s.focusHops.value = 2
    expect([...s.focusNodeNames.value].sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('focusNodeNames：deep 与 focus 同邻域派生；off 或焦点缺位恒空', () => {
    const s = makeSetup()
    s.focusMode.value = 'deep'
    s.focusNodeId.value = 'C'
    s.focusHops.value = 1
    expect([...s.focusNodeNames.value].sort()).toEqual(['A', 'C', 'E'])
    s.focusMode.value = 'off'
    expect(s.focusNodeNames.value).toEqual([])
    s.focusMode.value = 'focus'
    s.focusNodeId.value = '不存在'
    expect(s.focusNodeNames.value).toEqual([])
  })

  it('焦点节点被删：回退默认焦点并同步选中', async () => {
    const s = makeSetup()
    s.focusMode.value = 'focus'
    s.focusNodeId.value = 'C'
    // 删 C（连带 A-C、C-E）：剩 A-B、A-D → 度数 A:2 最高
    s.chartData.value = {
      nodes: [node('A'), node('B'), node('D')],
      links: [link('A', 'B'), link('A', 'D')]
    }
    await nextTick()
    expect(s.focusNodeId.value).toBe('A')
    expect(s.syncCurrentNodeByName).toHaveBeenCalledWith('A')
  })

  it('焦点节点被改名（原地替换数组元素，引用不变）：同样回退，不再静默失效（审计 #12）', async () => {
    const s = makeSetup()
    s.focusMode.value = 'focus'
    s.focusNodeId.value = 'C'
    // 模拟 useDocument.changeNode 的改名路径：nodes[index] = newNode + 邻边端点改写
    const chart = s.chartData.value
    chart.nodes[2] = node('C2')
    chart.links.forEach((l) => {
      if (l.source === 'C') l.source = 'C2'
      if (l.target === 'C') l.target = 'C2'
    })
    await nextTick()
    expect(s.focusNodeId.value).toBe('A') // 回退默认焦点（度数最高）
    expect(s.syncCurrentNodeByName).toHaveBeenCalledWith('A')
    expect(s.focusNodeNames.value.length).toBeGreaterThan(0) // 不再空集（空集=聚焦静默失效）
  })

  it('焦点删后全图删空：焦点为空串（邻域空 = 全图恢复）', async () => {
    const s = makeSetup()
    s.focusMode.value = 'focus'
    s.focusNodeId.value = 'C'
    s.chartData.value = { nodes: [], links: [] }
    await nextTick()
    expect(s.focusNodeId.value).toBe('')
    expect(s.syncCurrentNodeByName).not.toHaveBeenCalled()
  })

  it('off 模式下节点删除不触发回退（探照灯关闭时 watch 静默）', async () => {
    const s = makeSetup()
    s.focusMode.value = 'off'
    s.focusNodeId.value = 'C' // 直接置位模拟残留
    s.chartData.value = { nodes: [node('A')], links: [] }
    await nextTick()
    expect(s.focusNodeId.value).toBe('C')
    expect(s.syncCurrentNodeByName).not.toHaveBeenCalled()
  })
})
