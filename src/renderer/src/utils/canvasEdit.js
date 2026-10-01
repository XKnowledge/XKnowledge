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

/**
 * 双击建点落点深度：相机沿视线到「节点质心平面」的距离。
 * 不能用「相机-lookAt 距离」——库（3d-force-graph）装载取景会把相机拉近到
 * ∛N×170，而 cameraPosition() 的 lookAt 是 getter 合成的相机前方固定 1000
 * 单位点，按它取深度会把新点放到远处（实测与已有节点深度差 700+），
 * d3 center 力把混合深度的节点群沿深度方向弹开，一侧节点飞越相机被近裁面
 * 裁掉消失（建第二个点后第一个点从画面消失的根因）。取质心平面让新点与
 * 旧点同深度，力布局只在平面内调整。
 * @param {{x,y,z}} camPos 相机位置（cameraPosition() getter 的 x/y/z）
 * @param {{x,y,z}} lookAt 相机注视点（getter 合成值即可，只用于取视线方向）
 * @param {Array<{x,y,z}>} nodes 现有节点（非有限坐标自动忽略）
 * @returns {number} 沿视线的正距离；空图回退相机-lookAt 距离；质心在相机
 *   侧后（投影非正）时兜底 1，防 screen2GraphCoords 拿到非正距离
 */
export const focusPlaneDistance = (camPos, lookAt, nodes) => {
  const finite = (nodes ?? []).filter(
    (n) => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)
  )
  const look = lookAt ?? { x: 0, y: 0, z: 0 }
  const dl = Math.hypot(look.x - camPos.x, look.y - camPos.y, look.z - camPos.z) || 1
  if (!finite.length) return Math.max(dl, 1)
  const c = { x: 0, y: 0, z: 0 }
  for (const n of finite) {
    c.x += n.x
    c.y += n.y
    c.z += n.z
  }
  c.x /= finite.length
  c.y /= finite.length
  c.z /= finite.length
  const dir = {
    x: (look.x - camPos.x) / dl,
    y: (look.y - camPos.y) / dl,
    z: (look.z - camPos.z) / dl
  }
  const dist = (c.x - camPos.x) * dir.x + (c.y - camPos.y) * dir.y + (c.z - camPos.z) * dir.z
  return Math.max(dist, 1)
}
