/**
 * 首页图库排序：卡片按标题拼音 A→Z 升序。
 * locale 显式 'zh-CN'（CLDR 拼音 collation，Electron/Node 内置全量 ICU），
 * 不随系统语言漂移；汉字整体排在拉丁字母标题之前，多音字取 ICU 常用音。
 * 标题拼音相同回退 fileName，保证顺序确定。拷贝后排序，不改入参引用。
 */

/**
 * @param {Array<{title:string, fileName:string}>} examples listExamples 产出的卡片元数据
 * @returns {Array} 排序后的新数组（元素仍为原对象引用，渲染直接复用）
 */
export const sortExamples = (examples) =>
  [...examples].sort(
    (a, b) =>
      String(a.title ?? '').localeCompare(String(b.title ?? ''), 'zh-CN') ||
      String(a.fileName ?? '').localeCompare(String(b.fileName ?? ''), 'zh-CN')
  )
