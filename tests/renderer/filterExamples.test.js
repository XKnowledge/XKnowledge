import { describe, it, expect } from 'vitest'
import { filterExamples } from '../../src/renderer/src/utils/filterExamples'

/** 与 exampleService.listExamples 产出的卡片元数据同构的最小样本 */
const examples = [
  {
    fileName: '玩具与桌游.xk',
    title: '玩具与桌游',
    description: '桌游机制、模型与收藏体系',
    categories: ['桌游', '模型']
  },
  {
    fileName: 'geology.xk',
    title: '地质学',
    description: '矿物、岩石与地史演化的知识图谱',
    categories: ['地球科学']
  },
  {
    fileName: 'tea.xk',
    title: '茶',
    description: '六大茶类与产区风土',
    categories: ['饮品']
  },
  {
    fileName: 'star_wars.xk',
    title: 'Star Wars',
    description: '银河帝国与原力的谱系',
    categories: ['流行文化']
  }
]

describe('filterExamples：首页图库搜索过滤', () => {
  it('空关键字返回全量（含纯空白，视为未输入）', () => {
    expect(filterExamples(examples, '')).toEqual(examples)
    expect(filterExamples(examples, '   ')).toEqual(examples)
    expect(filterExamples(examples, null)).toEqual(examples)
  })

  it('部分子串即可命中：搜「具与」出「玩具与桌游」', () => {
    const hit = filterExamples(examples, '具与')
    expect(hit).toHaveLength(1)
    expect(hit[0].title).toBe('玩具与桌游')
  })

  it('匹配范围覆盖标题、描述、分类', () => {
    // 描述命中
    expect(filterExamples(examples, '风土').map((e) => e.title)).toContain('茶')
    // 分类命中
    expect(filterExamples(examples, '地球').map((e) => e.title)).toContain('地质学')
  })

  it('大小写不敏感，且自动 trim 首尾空白', () => {
    expect(filterExamples(examples, ' STAR ').map((e) => e.title)).toContain('Star Wars')
  })

  it('无命中返回空数组', () => {
    expect(filterExamples(examples, '量子色动力学')).toEqual([])
  })

  it('返回的是原数组元素的引用，不复制卡片数据', () => {
    const hit = filterExamples(examples, '桌游')
    expect(hit[0]).toBe(examples[0])
  })
})
