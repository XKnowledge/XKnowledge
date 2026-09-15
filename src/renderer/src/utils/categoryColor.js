/**
 * 类目固定调色板：按类目名做稳定字符串哈希取模分配，
 * 同名类目永远同色（保存重开、多窗口一致），不依赖插入顺序。
 */
export const PALETTE = [
  '#5b8ff9',
  '#5ad8a6',
  '#5d7092',
  '#f6bd16',
  '#e8684a',
  '#6dc8ec',
  '#9270ca',
  '#ff9d4d',
  '#269a99',
  '#ff99c3',
  '#a9abb1',
  '#7262fd'
]

const hash = (str) => {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    // 31 进制多项式哈希；|0 保证 32 位整数运算
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export const categoryColor = (name) => PALETTE[hash(String(name ?? '')) % PALETTE.length]
