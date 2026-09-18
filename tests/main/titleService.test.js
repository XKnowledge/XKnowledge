import { describe, it, expect } from 'vitest'
import { sep } from 'path'
import { computeTitles } from '../../src/main/titleService'

const entry = (path, webContentsId) => ({ path, webContentsId })

describe('computeTitles：唯一文件名', () => {
  it('单一文件显示「文件名 — XKnowledge」（去 .xk 扩展名）', () => {
    const titles = computeTitles([entry('C:\\资料\\金融.xk', 2)])
    expect(titles.get(2)).toBe('金融 — XKnowledge')
  })

  it('不同名文件互不影响，都显示纯文件名', () => {
    const titles = computeTitles([
      entry('C:\\资料\\金融.xk', 2),
      entry('C:\\下载\\中国通史.xk', 3)
    ])
    expect(titles.get(2)).toBe('金融 — XKnowledge')
    expect(titles.get(3)).toBe('中国通史 — XKnowledge')
  })

  it('正斜杠路径同样正确切分（dev/测试路径形态）', () => {
    const titles = computeTitles([entry('C:/资料/金融.xk', 2)])
    expect(titles.get(2)).toBe('金融 — XKnowledge')
  })

  it('空输入返回空 Map', () => {
    expect(computeTitles([]).size).toBe(0)
  })
})

describe('computeTitles：同名消歧', () => {
  it('两个同名文件各补 1 级父目录', () => {
    const titles = computeTitles([
      entry('C:\\资料\\金融.xk', 2),
      entry('C:\\下载\\金融.xk', 3)
    ])
    expect(titles.get(2)).toBe('金融 — 资料 — XKnowledge')
    expect(titles.get(3)).toBe('金融 — 下载 — XKnowledge')
  })

  it('父目录也同名时补到 2 级', () => {
    const titles = computeTitles([
      entry('C:\\x\\a\\金融.xk', 2),
      entry('C:\\y\\a\\金融.xk', 3)
    ])
    expect(titles.get(2)).toBe(`金融 — ${['x', 'a'].join(sep)} — XKnowledge`)
    expect(titles.get(3)).toBe(`金融 — ${['y', 'a'].join(sep)} — XKnowledge`)
  })

  it('三个同名混合深度：加深到全组展示名互不相同', () => {
    const titles = computeTitles([
      entry('C:\\p\\a\\金融.xk', 2),
      entry('C:\\q\\a\\金融.xk', 3),
      entry('C:\\a\\金融.xk', 4)
    ])
    expect(new Set(titles.values()).size).toBe(3)
    expect(titles.get(2)).toBe(`金融 — ${['p', 'a'].join(sep)} — XKnowledge`)
    expect(titles.get(3)).toBe(`金融 — ${['q', 'a'].join(sep)} — XKnowledge`)
    // 浅路径跟随全组加深：1 级时三者展示名相同，2 级后含盘符可区分
    expect(titles.get(4)).toBe(`金融 — ${['C:', 'a'].join(sep)} — XKnowledge`)
  })
})
