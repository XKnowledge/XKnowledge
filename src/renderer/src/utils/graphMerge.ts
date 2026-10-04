/**
 * 图选区收集与合并的纯工具：复制的三路分发收集（collectCopySelection）与
 * 大纲导入/粘贴共用的合并批量（mergeGraphBatch）。输入是 chartData 快照
 * 与选中态，输出纯数据，不碰 xkContext/reactive——vitest 直测（项目惯例：
 * .vue 交互逻辑抽 utils 单测，组件层由冒烟覆盖）。
 */
import type { GraphNode, GraphLink } from './graphData'

/**
 * 复制对象收集（与 Delete 同款三路分发，子图自洽——边端点必在节点集内，
 * 粘贴到空图也不丢边）：
 * 1. 框选集非空：节点 = 选中节点 ∪ 直选边端点，边 = 两端都在节点集内的
 *    所有边（含直选边与选中节点间互连边——框住两个球没框住中间连线时
 *    互连边仍在子图里，与 Delete 删节点连带删邻边对称：删是相关即删、
 *    复制是相关即留）
 * 2. 否则直选边：该边 + 两端节点（多重边只带选中的那条）
 * 3. 否则最后点击节点：节点本身（要子图用框选）
 * 无任何选中返回 null。
 */
export const collectCopySelection = (
  nodes: GraphNode[],
  links: GraphLink[],
  selNodeNames: string[] | null | undefined,
  selLinkIndexes: number[] | null | undefined,
  edgeIndex: number,
  nodeIndex: number
): { nodes: GraphNode[]; links: GraphLink[] } | null => {
  if (selNodeNames?.length || selLinkIndexes?.length) {
    const names = new Set(selNodeNames)
    for (const i of selLinkIndexes ?? []) {
      const l = links[i]
      if (l) {
        names.add(l.source)
        names.add(l.target)
      }
    }
    return {
      nodes: nodes.filter((n) => names.has(n.name)),
      links: links.filter((l) => names.has(l.source) && names.has(l.target))
    }
  }
  if (edgeIndex > -1 && links[edgeIndex]) {
    const l = links[edgeIndex]
    return {
      nodes: nodes.filter((n) => n.name === l.source || n.name === l.target),
      links: [l]
    }
  }
  if (nodeIndex > -1 && nodes[nodeIndex]) {
    return { nodes: [nodes[nodeIndex]], links: [] }
  }
  return null
}

/**
 * 合并批量（大纲导入与粘贴共用——语义同一份代码，修一处两处受益）：
 * 同名节点跳过并合并（引用它的边仍可接上），边须两端都在「现有 ∪ 新增」
 * 并集内且与现有边无向端点对不重复。返回 { nodes, links, skippedCount }
 * ——元素是 incoming 的对象引用，调用方负责 jsonReactive 后再 push
 * （history.data 须持有 push 进 chartData 的同一批对象）。
 */
export const mergeGraphBatch = (
  existingNodes: GraphNode[],
  existingLinks: GraphLink[],
  incomingNodes: GraphNode[],
  incomingLinks: GraphLink[]
): { nodes: GraphNode[]; links: GraphLink[]; skippedCount: number } => {
  const existing = new Set(existingNodes.map((n) => n.name))
  const nodes = incomingNodes.filter((n) => !existing.has(n.name))
  const nameSet = new Set([...existing, ...nodes.map((n) => n.name)])
  const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)
  const existingPairs = new Set(existingLinks.map((l) => pairKey(l.source, l.target)))
  const links = incomingLinks.filter(
    (l) =>
      nameSet.has(l.source) &&
      nameSet.has(l.target) &&
      !existingPairs.has(pairKey(l.source, l.target))
  )
  return { nodes, links, skippedCount: incomingNodes.length - nodes.length }
}
