/**
 * 画布直操编辑的纯工具：位置钳制、投影拾取与框选几何。手势层在 XkGraph3D 里
 * 依赖 graph 实例（graph2ScreenCoords），这里只放可单测的纯计算。
 */

/** 就地编辑器的估计占位（宽 342 / 高 100）：贴边时翻回容器内，留 8px 边距。
 *  宽取建点态估算值 ~336px（8 padding + 150 名称 + 6 gap + 162 类目 + 8 padding
 *  + 2 border，行1 定宽；行2 档位+弹性数框、行3 描述 318px 均不超行1）；高按
 *  三行输入（~78px）上取整留余量。描述文本域可拖角拉伸、超出估算时钳制兜
 *  不住——本值只为初定位贴边兜底，不追手改尺寸。连边态单框更窄更矮，按建
 *  点态钳制即可 */
const EDITOR_W = 342
const EDITOR_H = 100
const EDGE_MARGIN = 8

export const clampEditorPos = (
  containerW: number,
  containerH: number,
  x: number,
  y: number
): { x: number; y: number } => ({
  x: Math.min(Math.max(x, EDGE_MARGIN), Math.max(containerW - EDITOR_W, EDGE_MARGIN)),
  y: Math.min(Math.max(y, EDGE_MARGIN), Math.max(containerH - EDITOR_H, EDGE_MARGIN))
})

/** 节点屏幕投影点（调用方用 graph2ScreenCoords 预投影） */
export interface ProjectedPoint {
  name: string
  x: number
  y: number
}

/**
 * 从节点屏幕投影里找命中项：距离 < threshold 像素内最近者胜。
 * 命中阈值取固定像素（非节点投影半径）：手势语义是「拖到节点上」，
 * 对准球心总能命中，避免按世界半径换算投影半径的复杂度。
 */
export const pickNearestNode = (
  projected: ProjectedPoint[],
  cx: number,
  cy: number,
  threshold = 16
): ProjectedPoint | null => {
  let best: ProjectedPoint | null = null
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
 * Shift+拖框选的矩形几何（纯计算，手势层在 XkGraph3D 依赖 graph 实例）。
 * 三个函数配套：buildMarqueeRect 归一化拖拽矩形，pointInRect 判节点投影，
 * segmentIntersectsRect 判边（两端点屏幕投影线段与矩形相交即选中）。
 */

/** 拖拽归一化矩形（非负宽高，任意拖拽方向都成立） */
export interface MarqueeRect {
  x: number
  y: number
  w: number
  h: number
}

/** 拖拽起止点归一化为非负宽高的矩形（任意拖拽方向都成立） */
export const buildMarqueeRect = (x1: number, y1: number, x2: number, y2: number): MarqueeRect => ({
  x: Math.min(x1, x2),
  y: Math.min(y1, y2),
  w: Math.abs(x2 - x1),
  h: Math.abs(y2 - y1)
})

/** 点是否在矩形内（边界含入：贴框线拖拽的节点算选中） */
export const pointInRect = (px: number, py: number, rect: MarqueeRect): boolean =>
  px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h

/** 线段 (x1,y1)-(x2,y2) 与线段 (ax,ay)-(bx,by) 是否相交（端点相触也算） */
const segmentsIntersect = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): boolean => {
  const d = (x2 - x1) * (by - ay) - (y2 - y1) * (bx - ax)
  if (d === 0) return false // 平行/共线：交叠判定复杂，框选按不相交处理（保守）
  const t = ((ax - x1) * (by - ay) - (ay - y1) * (bx - ax)) / d
  const u = ((ax - x1) * (y2 - y1) - (ay - y1) * (x2 - x1)) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

/**
 * 线段与轴对齐矩形是否相交：任一端点在矩形内直接命中，否则逐条测矩形
 * 四边。两端都在框外但线段穿过框（斜穿/贯穿）同样命中——边的语义是
 * 「被框住」，与节点「球心在框内」一致地取几何相交。
 */
export const segmentIntersectsRect = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: MarqueeRect
): boolean => {
  if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true
  const { x, y, w, h } = rect
  return (
    segmentsIntersect(x1, y1, x2, y2, x, y, x + w, y) || // 上边
    segmentsIntersect(x1, y1, x2, y2, x, y + h, x + w, y + h) || // 下边
    segmentsIntersect(x1, y1, x2, y2, x, y, x, y + h) || // 左边
    segmentsIntersect(x1, y1, x2, y2, x + w, y, x + w, y + h) // 右边
  )
}

/** 三维坐标（相机位置/注视点/节点质心） */
interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * 双击建点落点深度：相机沿视线到「节点质心平面」的距离。
 * 不能用「相机-lookAt 距离」——库（3d-force-graph）装载取景会把相机拉近到
 * ∛N×170，而 cameraPosition() 的 lookAt 是 getter 合成的相机前方固定 1000
 * 单位点，按它取深度会把新点放到远处（实测与已有节点深度差 700+），
 * d3 center 力把混合深度的节点群沿深度方向弹开，一侧节点飞越相机被近裁面
 * 裁掉消失（建第二个点后第一个点从画面消失的根因）。取质心平面让新点与
 * 旧点同深度，力布局只在平面内调整。
 * @param camPos 相机位置（cameraPosition() getter 的 x/y/z）
 * @param lookAt 相机注视点（getter 合成值即可，只用于取视线方向）
 * @param nodes 现有节点（非有限坐标自动忽略）
 * @returns 沿视线的正距离；空图回退相机-lookAt 距离；质心在相机
 *   侧后（投影非正）时兜底 1，防 screen2GraphCoords 拿到非正距离
 */
export const focusPlaneDistance = (
  camPos: Vec3,
  lookAt: Vec3 | null | undefined,
  nodes: Vec3[] | null
): number => {
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
