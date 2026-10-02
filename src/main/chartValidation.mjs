/**
 * 校验解析后的图谱数据（v2 纯数据格式）是否满足渲染端装载的最低要求。
 * 返回 null 表示通过；返回稳定错误码（错误码即 shared/locales 字典
 * error.validation.<code> 的键）表示缺失项，翻译由调用方（fileService 经
 * i18nMain）完成——本模块保持无 electron/vue 依赖的纯模块，
 * 纯 node 脚本（示例清单生成）可直接 import。
 * 渲染端（ChartView / XkGraph3D）会裸访问 nodes / links 数组，缺任何
 * 一项都会让图表页白屏，因此必须在主进程拦截。
 *
 * 独立成无 electron 依赖的纯模块（.mjs 后缀使纯 node 脚本——如示例
 * 清单生成——可直接 import；vite/vitest 均原生支持），fileService
 * 对外 re-export 保持既有 import 路径不变。
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
  if (parsed.nodes.some((node) => !node || typeof node !== 'object')) {
    return 'invalid_node_item'
  }
  if (!Array.isArray(parsed.links)) {
    return 'missing_links'
  }
  const names = new Set(parsed.nodes.map((node) => node.name))
  const dangling = parsed.links.some(
    (link) => !link || !names.has(link?.source) || !names.has(link?.target)
  )
  if (dangling) {
    return 'dangling_edge'
  }
  return null
}
