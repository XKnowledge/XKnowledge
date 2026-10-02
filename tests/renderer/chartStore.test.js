import { describe, it, expect } from 'vitest'
import { setPendingChart, takePendingChart } from '../../src/renderer/src/store/chartStore'

// 模块级单例：用例间共享 pending，首个用例先 take 清场保证起点干净
describe('chartStore：首页 → 图表页的窗口内图表传递', () => {
  it('初始无暂存，take 返回 null', () => {
    expect(takePendingChart()).toBeNull()
  })

  it('set 后 take 取回原值（打开文件/双击模板路径）', () => {
    const chart = { content: '{"nodes":[]}', path: 'C:/a.xk' }
    setPendingChart(chart)
    expect(takePendingChart()).toBe(chart)
  })

  it('取后即清：再次 take 返回 null（ChartView 挂载只装一次）', () => {
    setPendingChart({ content: '{}', path: '' })
    takePendingChart()
    expect(takePendingChart()).toBeNull()
  })

  it('重复 set 覆盖旧暂存（连续打开两个文件只留最后一个）', () => {
    setPendingChart({ content: 'a', path: 'a.xk' })
    setPendingChart({ content: 'b', path: 'b.xk' })
    expect(takePendingChart()).toEqual({ content: 'b', path: 'b.xk' })
    expect(takePendingChart()).toBeNull()
  })
})
