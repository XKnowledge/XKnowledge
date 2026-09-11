/**
 * 同一窗口内 首页 → 图表页 的图表数据传递。
 * 首页（打开文件/双击模板）set，ChartView 挂载时 take（取后即清）。
 * 跨窗口传递不经过这里（新窗口走主进程 take-pending-chart 通道）。
 */
let pending = null

export const setPendingChart = (value) => {
  pending = value
}

export const takePendingChart = () => {
  const value = pending
  pending = null
  return value
}
