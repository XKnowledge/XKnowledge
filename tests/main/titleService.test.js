import { describe, it, expect } from 'vitest'
import { sep } from 'path'
import { computeTitles, composeWindowTitles } from '../../src/main/titleService'

const entry = (path, webContentsId) => ({ path, webContentsId })

describe('computeTitles：唯一文件名', () => {
  it('单一文件显示「文件名 — XKnowledge」（去 .xk 扩展名）', () => {
    const titles = computeTitles([entry('C:\\资料\\金融.xk', 2)])
    expect(titles.get(2).display).toBe('金融 — XKnowledge')
    expect(titles.get(2).taskbar).toBe('金融 — XKnowledge')
  })

  it('不同名文件互不影响，都显示纯文件名', () => {
    const titles = computeTitles([entry('C:\\资料\\金融.xk', 2), entry('C:\\下载\\中国通史.xk', 3)])
    expect(titles.get(2).display).toBe('金融 — XKnowledge')
    expect(titles.get(3).display).toBe('中国通史 — XKnowledge')
  })

  it('正斜杠路径同样正确切分（dev/测试路径形态）', () => {
    const titles = computeTitles([entry('C:/资料/金融.xk', 2)])
    expect(titles.get(2).display).toBe('金融 — XKnowledge')
  })

  it('空输入返回空 Map', () => {
    expect(computeTitles([]).size).toBe(0)
  })
})

describe('computeTitles：同名消歧', () => {
  it('两个同名文件各补 1 级父目录', () => {
    const titles = computeTitles([entry('C:\\资料\\金融.xk', 2), entry('C:\\下载\\金融.xk', 3)])
    expect(titles.get(2).display).toBe('金融 — 资料 — XKnowledge')
    expect(titles.get(3).display).toBe('金融 — 下载 — XKnowledge')
  })

  it('父目录也同名时补到 2 级', () => {
    const titles = computeTitles([entry('C:\\x\\a\\金融.xk', 2), entry('C:\\y\\a\\金融.xk', 3)])
    expect(titles.get(2).display).toBe(`金融 — ${['x', 'a'].join(sep)} — XKnowledge`)
    expect(titles.get(3).display).toBe(`金融 — ${['y', 'a'].join(sep)} — XKnowledge`)
  })

  it('三个同名混合深度：加深到全组展示名互不相同', () => {
    const titles = computeTitles([
      entry('C:\\p\\a\\金融.xk', 2),
      entry('C:\\q\\a\\金融.xk', 3),
      entry('C:\\a\\金融.xk', 4)
    ])
    // 返回值是对象，先投影回字符串再判互不相同
    expect(new Set([...titles.values()].map((t) => t.display)).size).toBe(3)
    expect(titles.get(2).display).toBe(`金融 — ${['p', 'a'].join(sep)} — XKnowledge`)
    expect(titles.get(3).display).toBe(`金融 — ${['q', 'a'].join(sep)} — XKnowledge`)
    // 浅路径跟随全组加深：1 级时三者展示名相同，2 级后含盘符可区分
    expect(titles.get(4).display).toBe(`金融 — ${['C:', 'a'].join(sep)} — XKnowledge`)
  })
})

describe('computeTitles：未保存圆点', () => {
  it('entry 带 dirty 时：标题条圆点在展示名后、任务栏圆点在整标题前', () => {
    const titles = computeTitles([{ path: 'C:\\资料\\金融.xk', webContentsId: 2, dirty: true }])
    expect(titles.get(2).display).toBe('金融 ● — XKnowledge')
    expect(titles.get(2).taskbar).toBe('● 金融 — XKnowledge')
  })

  it('entry 缺 dirty 字段时按干净处理（向后兼容）', () => {
    const titles = computeTitles([entry('C:\\资料\\金融.xk', 2)])
    expect(titles.get(2)).toEqual({
      display: '金融 — XKnowledge',
      taskbar: '金融 — XKnowledge'
    })
  })

  it('dirty 与同名目录链消歧组合：圆点跟在完整展示名（含目录链）之后', () => {
    const titles = computeTitles([
      { path: 'C:\\资料\\金融.xk', webContentsId: 2, dirty: true },
      entry('C:\\下载\\金融.xk', 3)
    ])
    expect(titles.get(2).display).toBe('金融 — 资料 ● — XKnowledge')
    expect(titles.get(2).taskbar).toBe('● 金融 — 资料 — XKnowledge')
    expect(titles.get(3).display).toBe('金融 — 下载 — XKnowledge')
    expect(titles.get(3).taskbar).toBe('金融 — 下载 — XKnowledge')
  })
})

describe('composeWindowTitles：纯函数', () => {
  it('dirty 时 display 圆点在展示名后、taskbar 圆点在标题前', () => {
    expect(composeWindowTitles('金融', true)).toEqual({
      display: '金融 ● — XKnowledge',
      taskbar: '● 金融 — XKnowledge'
    })
  })

  it('干净时两值相同且无圆点', () => {
    expect(composeWindowTitles('金融', false)).toEqual({
      display: '金融 — XKnowledge',
      taskbar: '金融 — XKnowledge'
    })
  })

  it('dirty 为 undefined 时按干净处理', () => {
    expect(composeWindowTitles('金融').display).toBe('金融 — XKnowledge')
  })
})
