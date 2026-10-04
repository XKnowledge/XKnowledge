import { describe, it, expect } from 'vitest'
import { serializeGraphForViewer } from '../../src/shared/graphViewerData'

// 与 graphClipboard 序列化同哲学：白名单字段、刻意剥坐标与内部字段
//（动态成形——接收方打开时力导向重新布局，坐标跨文件无意义）
describe('serializeGraphForViewer', () => {
  const chart = {
    version: 2,
    description: '图简介',
    nodes: [
      { name: 'CANN', des: '架构', symbolSize: 70, category: '总体架构' },
      { name: '昇腾', des: '', symbolSize: 40, category: '芯片' }
    ],
    links: [
      { source: 'CANN', target: '昇腾', name: '驱动', des: '' },
      { source: '昇腾', target: 'CANN', name: '', des: '' }
    ]
  }

  it('节点白名单：只留 name/des/symbolSize/category，剥 x/y/z/__idx/vx 等', () => {
    const dirty = {
      nodes: [
        { name: 'a', des: '', symbolSize: 50, category: '', x: 1, y: 2, z: 3, __idx: 0, vx: 0.1 }
      ],
      links: [{ source: 'a', target: 'a', name: '', des: '' }]
    }
    const out = serializeGraphForViewer(dirty, 'T', 'zh-CN')
    expect(Object.keys(out.nodes[0]).sort()).toEqual(['category', 'des', 'name', 'symbolSize'])
  })

  it('边白名单：source/target/name/des；端点为对象（d3 反解形态）时归一为名字', () => {
    const dirty = {
      nodes: chart.nodes,
      links: [{ source: { name: 'CANN' }, target: '昇腾', name: '边', des: '' }]
    }
    const out = serializeGraphForViewer(dirty, 'T', 'zh-CN')
    expect(out.links[0]).toEqual({ source: 'CANN', target: '昇腾', name: '边', des: '' })
  })

  it('categories 自节点收集去重（保持出现顺序），name 缺省归一为空串', () => {
    const out = serializeGraphForViewer(chart, 'T', 'zh-CN')
    expect(out.categories).toEqual([{ name: '总体架构' }, { name: '芯片' }])
    const noCat = serializeGraphForViewer(
      { nodes: [{ name: 'a', symbolSize: 50 }], links: [] },
      'T',
      'zh-CN'
    )
    expect(noCat.categories).toEqual([{ name: '' }])
    expect(noCat.nodes[0]).toEqual({ name: 'a', des: '', symbolSize: 50, category: '' })
  })

  it('缺省字段填默认：des 空串、symbolSize 50（与表单建点默认对齐）', () => {
    const out = serializeGraphForViewer(
      { nodes: [{ name: 'a', category: 'c' }], links: [] },
      'T',
      'zh-CN'
    )
    expect(out.nodes[0]).toEqual({ name: 'a', des: '', symbolSize: 50, category: 'c' })
  })

  it('title 与 lang 透传；links 缺失容忍为空数组', () => {
    const out = serializeGraphForViewer({ nodes: chart.nodes }, '我的图谱', 'en-US')
    expect(out.title).toBe('我的图谱')
    expect(out.lang).toBe('en-US')
    expect(out.links).toEqual([])
  })

  it('0 节点返回 null（调用方以此拒绝导出）', () => {
    expect(serializeGraphForViewer({ nodes: [], links: [] }, 'T', 'zh-CN')).toBeNull()
    expect(serializeGraphForViewer(null, 'T', 'zh-CN')).toBeNull()
  })

  it('repulsion 随导出携带：正数原样带出（导出时滑杆值，viewer 复现布局尺度）', () => {
    expect(serializeGraphForViewer(chart, 'T', 'zh-CN', 250).repulsion).toBe(250)
    expect(serializeGraphForViewer(chart, 'T', 'zh-CN', 100).repulsion).toBe(100)
  })

  it('repulsion 未传/非正数/非数值省略键：旧版导出物语义（viewer 库默认斥力）', () => {
    for (const bad of [undefined, null, 0, -5, NaN, Infinity, '100']) {
      expect('repulsion' in serializeGraphForViewer(chart, 'T', 'zh-CN', bad)).toBe(false)
    }
  })
})
