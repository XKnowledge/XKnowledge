/**
 * 校验解析后的图谱数据（v2 纯数据格式）是否满足装载的最低要求。
 * 返回 null 表示通过；返回稳定错误码（错误码即 shared/locales 字典
 * error.validation.<code> 的键）表示缺失项，翻译由调用方完成——本模块
 * 保持无 electron/vue 依赖的纯模块，纯 node 脚本（示例清单生成）可直接
 * import（.mjs 后缀即为此；vite/vitest 均原生支持）。
 *
 * .xk 格式合法性的唯一出处：主进程读盘（fileService）、渲染端装载兜底
 * （ChartView）、示例清单生成（exampleManifest）三方 import 同一份——
 * 格式演进时只改这里。渲染端会裸访问 nodes / links 数组，缺任何一项都会
 * 白屏，因此主进程读盘时必须先过这道校验。
 */
export const validateChartStructure = (parsed) => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'not_json_object'
  }
  if (parsed.version !== 2) {
    return 'no_version'
  }
  if (!Array.isArray(parsed.nodes)) {
    return 'missing_nodes'
  }
  // name 是节点主键（撤销/重做按名定位，序列化器缺失即废数据）：缺失/
  // 空串/非字符串与重名都拒——无名节点 redo 按名过滤会全删、同名节点
  // 互相覆盖，UI 建不出这种数据，只有外部/手工编辑的文件会带上
  const names = new Set()
  for (const node of parsed.nodes) {
    if (!node || typeof node !== 'object') {
      return 'invalid_node_item'
    }
    if (typeof node.name !== 'string' || !node.name || names.has(node.name)) {
      return 'invalid_node_item'
    }
    names.add(node.name)
  }
  if (!Array.isArray(parsed.links)) {
    return 'missing_links'
  }
  const dangling = parsed.links.some(
    (link) => !link || !names.has(link?.source) || !names.has(link?.target)
  )
  if (dangling) {
    return 'dangling_edge'
  }
  return null
}
