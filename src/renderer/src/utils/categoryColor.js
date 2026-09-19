/**
 * 类目彩虹调色板（XMind 风格，色相带 × 深浅档）。
 * 颜色是展示层推导，不进 .xk 数据文件：同一类型集合永远得到同一分配
 * （保存重开、多窗口一致），与节点顺序无关。
 */
export const PALETTE = [
  '#E64A19', // 红
  '#C62828', // 深红
  '#FF9800', // 橙
  '#EF6C00', // 深橙
  '#FFC24B', // 黄
  '#B8860B', // 暗金
  '#9CCC65', // 浅黄绿
  '#558B2F', // 橄榄
  '#43A047', // 绿
  '#2E7D32', // 深绿
  '#26A69A', // 青
  '#00897B', // 深青
  '#1E88E5', // 蓝
  '#1565C0', // 深蓝
  '#5C6BC0', // 蓝紫
  '#8E5AC8', // 紫
  '#6A1B9A', // 深紫
  '#EC407A', // 粉
  '#8D6E63', // 棕
  '#78909C' // 灰
]

const hash = (str) => {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    // 31 进制多项式哈希；|0 保证 32 位整数运算
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * 按类型集合分配颜色：哈希取位 + 被占顺延（first-fit）。
 * 类型数 ≤ PALETTE 长度时零撞色；超过后从哈希位循环复用。
 * 返回 Map<归一化类型名, hex>；查询端统一 .get(String(cat ?? ''))——
 * Map.get 严格相等，undefined 不会被隐式字符串化，归一化必须两端一致。
 * 集合变化（加新类型）可能使顺延链重排、其他类型换色，属预期行为。
 * @param {Iterable<string|null|undefined>} categories
 * @returns {Map<string, string>}
 */
export const assignCategoryColors = (categories) => {
  const names = [...new Set([...(categories ?? [])].map((c) => String(c ?? '')))].sort()
  const result = new Map()
  const used = new Set()
  for (const name of names) {
    let i = hash(name) % PALETTE.length
    let tries = 0
    while (used.has(i) && tries < PALETTE.length) {
      i = (i + 1) % PALETTE.length
      tries++
    }
    used.add(i)
    result.set(name, PALETTE[i])
  }
  return result
}
