/**
 * 同一窗口内 首页 → 图表页 的图表数据传递。
 * 首页（打开文件/双击模板）set，ChartView 挂载时 take（取后即清）。
 * 跨窗口传递不经过这里（新窗口走主进程 take-pending-chart 通道）。
 */

/** 待装载图表（value 为 .xk 文件 JSON 文本） */
export interface PendingChart {
  value: string
  path: string
  /** 来源名（图库卡带入图表页标题） */
  name?: string
}

let pending: PendingChart | null = null

export const setPendingChart = (value: PendingChart): void => {
  pending = value
}

export const takePendingChart = (): PendingChart | null => {
  const value = pending
  pending = null
  return value
}
