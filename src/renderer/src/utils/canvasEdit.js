/**
 * 画布直操编辑的纯工具：位置钳制与投影拾取。手势层在 XkGraph3D 里
 * 依赖 graph 实例（graph2ScreenCoords），这里只放可单测的纯计算。
 */

/** 就地编辑器的估计占位（宽 440 / 高 90）：贴边时翻回容器内，留 8px 边距。
 *  宽取建点态估算值 ~438px（8 padding + 150 名称 + 6 gap + 130 类目 + 6 gap
 *  + ~128 大小档 radio 三钮 + 8 padding + 2 border）上取整；连边态单框更窄，
 *  按宽态钳制即可 */
const EDITOR_W = 440
const EDITOR_H = 90
const EDGE_MARGIN = 8

export const clampEditorPos = (containerW, containerH, x, y) => ({
  x: Math.min(Math.max(x, EDGE_MARGIN), Math.max(containerW - EDITOR_W, EDGE_MARGIN)),
  y: Math.min(Math.max(y, EDGE_MARGIN), Math.max(containerH - EDITOR_H, EDGE_MARGIN))
})

/**
 * 从节点屏幕投影里找命中项：距离 < threshold 像素内最近者胜。
 * projected: [{ name, x, y }]（调用方用 graph2ScreenCoords 预投影）。
 * 命中阈值取固定像素（非节点投影半径）：手势语义是「拖到节点上」，
 * 对准球心总能命中，避免按世界半径换算投影半径的复杂度。
 */
export const pickNearestNode = (projected, cx, cy, threshold = 16) => {
  let best = null
  let bestD = threshold
  for (const p of projected) {
    const d = Math.hypot(p.x - cx, p.y - cy)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}
