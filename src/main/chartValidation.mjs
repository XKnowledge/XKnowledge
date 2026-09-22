/**
 * 校验解析后的图谱数据（v2 纯数据格式）是否满足渲染端装载的最低要求。
 * 返回 null 表示通过；返回中文描述表示缺失项。
 * 渲染端（ChartView / XkGraph3D）会裸访问 nodes / links 数组，缺任何
 * 一项都会让图表页白屏，因此必须在主进程拦截。
 *
 * 独立成无 electron 依赖的纯模块（.mjs 后缀使纯 node 脚本——如示例
 * 清单生成——可直接 import；vite/vitest 均原生支持），fileService
 * 对外 re-export 保持既有 import 路径不变。
 */
export const validateChartStructure = (parsed) => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return '文件内容不是 JSON 对象'
  }
  if (parsed.version !== 2) {
    return '缺少版本标记（version 应为 2）'
  }
  if (!Array.isArray(parsed.nodes)) {
    return '缺少节点数据（nodes）'
  }
  if (parsed.nodes.some((node) => !node || typeof node !== 'object')) {
    return '节点数据包含无效项'
  }
  if (!Array.isArray(parsed.links)) {
    return '缺少连接数据（links）'
  }
  const names = new Set(parsed.nodes.map((node) => node.name))
  const dangling = parsed.links.some(
    (link) => !link || !names.has(link?.source) || !names.has(link?.target)
  )
  if (dangling) {
    return '存在引用不存在节点的连接'
  }
  return null
}
