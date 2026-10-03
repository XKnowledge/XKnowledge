// graphClipboard 单测：序列化白名单/坐标剥离/默认值补齐 + 解析严格校验
// （坏 JSON、外部 JSON、标记不符、数组缺失、骨架键空串）。纯模块无环境依赖。
import { describe, it, expect } from 'vitest'
import { serializeGraphSelection, parseGraphSelection } from '../../src/shared/graphClipboard'

describe('serializeGraphSelection', () => {
  it('带 app/type/version 标记，白名单字段保留', () => {
    const s = JSON.parse(
      serializeGraphSelection(
        [{ name: '阴阳', des: '对立统一', symbolSize: 60, category: '基础' }],
        [{ source: '阴阳', target: '五行', name: '化生', des: '' }]
      )
    )
    expect(s.app).toBe('xknowledge')
    expect(s.type).toBe('graph-selection')
    expect(s.version).toBe(1)
    expect(s.nodes).toEqual([{ name: '阴阳', des: '对立统一', symbolSize: 60, category: '基础' }])
    expect(s.links).toEqual([{ source: '阴阳', target: '五行', name: '化生', des: '' }])
  })

  it('剥离力布局坐标与 d3 内部速度字段', () => {
    const s = JSON.parse(
      serializeGraphSelection(
        [{ name: 'A', x: 10.5, y: -3, z: 88, vx: 0.1, vy: 0.2, vz: 0.3, index: 7 }],
        [{ source: 'A', target: 'B', index: 3 }]
      )
    )
    expect(s.nodes[0]).toEqual({ name: 'A', des: '', symbolSize: 50, category: '' })
    expect(s.links[0]).toEqual({ source: 'A', target: 'B', name: '', des: '' })
  })

  it('缺字段填默认值（des/category/name 空、symbolSize 50）', () => {
    const s = JSON.parse(serializeGraphSelection([{ name: 'A' }], [{ source: 'A', target: 'B' }]))
    expect(s.nodes[0]).toEqual({ name: 'A', des: '', symbolSize: 50, category: '' })
    expect(s.links[0]).toEqual({ source: 'A', target: 'B', name: '', des: '' })
  })
})

describe('parseGraphSelection', () => {
  it('serialize 往返：解析得白名单结构', () => {
    const text = serializeGraphSelection(
      [{ name: 'A', category: 'c', extra: 'x' }],
      [{ source: 'A', target: 'B', name: 'n' }]
    )
    expect(parseGraphSelection(text)).toEqual({
      nodes: [{ name: 'A', des: '', symbolSize: 50, category: 'c' }],
      links: [{ source: 'A', target: 'B', name: 'n', des: '' }]
    })
  })

  it('拒绝：非 JSON 文本', () => {
    expect(parseGraphSelection('普通文本')).toBeNull()
  })

  it('拒绝：JSON 但无本应用标记（外部复制的 JSON）', () => {
    expect(parseGraphSelection('{"nodes":[],"links":[]}')).toBeNull()
  })

  it('拒绝：app 或 type 不符', () => {
    const ok = serializeGraphSelection([], [])
    expect(parseGraphSelection(ok.replace('xknowledge', 'other'))).toBeNull()
    expect(parseGraphSelection(ok.replace('graph-selection', 'other'))).toBeNull()
  })

  it('拒绝：nodes/links 非数组', () => {
    expect(
      parseGraphSelection(
        '{"app":"xknowledge","type":"graph-selection","version":1,"nodes":{},"links":[]}'
      )
    ).toBeNull()
  })

  it('拒绝：节点 name 或边 source/target 空串', () => {
    const mk = (nodes, links) =>
      JSON.stringify({ app: 'xknowledge', type: 'graph-selection', version: 1, nodes, links })
    expect(parseGraphSelection(mk([{ name: '' }], []))).toBeNull()
    expect(parseGraphSelection(mk([{ name: 'A' }], [{ source: '', target: 'B' }]))).toBeNull()
    expect(parseGraphSelection(mk([{ name: 'A' }], [{ source: 'A', target: '' }]))).toBeNull()
  })

  it('空串/非字符串入参返回 null', () => {
    expect(parseGraphSelection('')).toBeNull()
    expect(parseGraphSelection(null)).toBeNull()
    expect(parseGraphSelection(undefined)).toBeNull()
  })
})
