import { describe, it, expect } from 'vitest'
import { sortExamples } from '../../src/renderer/src/utils/sortExamples'

/** 与 exampleService.listExamples 产出的卡片元数据同构的最小工厂（乱序给入） */
const card = (fileName, title) => ({ fileName, title, description: '', categories: [] })

describe('sortExamples：首页图库拼音排序', () => {
  it('中文标题按拼音 A→Z 升序', () => {
    const out = sortExamples([
      card('中国通史.xk', '中国通史'),
      card('数学知识体系.xk', '数学知识体系'),
      card('博弈论.xk', '博弈论'),
      card('材料科学.xk', '材料科学'),
      card('金融.xk', '金融'),
      card('天文学.xk', '天文学'),
      card('物理力学与电磁.xk', '物理力学与电磁')
    ])
    expect(out.map((e) => e.title)).toEqual([
      '博弈论',
      '材料科学',
      '金融',
      '数学知识体系',
      '天文学',
      '物理力学与电磁',
      '中国通史'
    ])
  })

  it('多音字按 ICU 常用音排：「重庆」chóng 归 c 位', () => {
    const out = sortExamples([card('a.xk', '大理'), card('b.xk', '重庆'), card('c.xk', '博弈论')])
    expect(out.map((e) => e.title)).toEqual(['博弈论', '重庆', '大理'])
  })

  it('拉丁字母标题排在全部汉字之后（zh collation 行为）', () => {
    const out = sortExamples([
      card('a.xk', 'Star Wars'),
      card('b.xk', '中国通史'),
      card('c.xk', '茶')
    ])
    expect(out.map((e) => e.title)).toEqual(['茶', '中国通史', 'Star Wars'])
  })

  it('不修改入参数组：返回新数组、原序保持', () => {
    const input = [card('b.xk', '数学'), card('a.xk', '博弈论')]
    const out = sortExamples(input)
    expect(out).not.toBe(input)
    expect(input.map((e) => e.title)).toEqual(['数学', '博弈论'])
    expect(out.map((e) => e.title)).toEqual(['博弈论', '数学'])
  })

  it('标题相同回退 fileName，保证稳定序', () => {
    const out = sortExamples([card('z后.xk', '茶'), card('a先.xk', '茶')])
    expect(out.map((e) => e.fileName)).toEqual(['a先.xk', 'z后.xk'])
  })

  it('空数组返回空数组', () => {
    expect(sortExamples([])).toEqual([])
  })
})
