/**
 * 首页图库搜索过滤：对 listExamples 产出的卡片元数据做子串匹配。
 * 匹配范围 = 标题 + 描述 + 分类名，任意命中即保留（如搜「具与」命中「玩具与桌游」）。
 * 纯函数、大小写不敏感；空/纯空白关键字返回全量（视为未输入）。
 */

/** 拼出一张卡片参与匹配的全文；字段可能缺失（description 可为空串），统一兜底 */
const searchableText = (ex) =>
  [ex.title, ex.description, ...(ex.categories ?? [])]
    .map((s) => String(s ?? '').toLowerCase())
    .join(' ')

/**
 * @param {Array<{title:string, description:string, categories:string[]}>} examples
 * @param {string} keyword 用户原始输入
 * @returns {Array} 命中的原数组元素引用（不复制，卡片渲染直接复用）
 */
export const filterExamples = (examples, keyword) => {
  const kw = String(keyword ?? '').trim().toLowerCase()
  if (!kw) return examples
  return examples.filter((ex) => searchableText(ex).includes(kw))
}
