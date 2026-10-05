/**
 * 历史操作对象：每个操作自带 undo/redo（把 chartData 变换到相邻历史状态）。
 * 同一操作的正反两份知识在同一个工厂里相邻成对，不再靠两份 act 分发
 * switch 人肉保持对称；历史栈（useDocument）存操作对象，不存形状约定。
 * 边界场景（多重边）在 vitest 下回归。
 *
 * 边的定位必须用「端点对 + 边名」三元组，不能只按端点对匹配：文件允许
 * 同一对节点间存在多条边（examples/中医基础理论.xk、地理.xk 自带此形态），
 * 按端点对 filter/findIndex 会连带误伤邻边（重做删除时整对删光、撤销
 * 修改时改错对象）。查找用 findLastIndex 从后向前：后创建/后恢复的边
 * 在数组尾部，撤销时优先命中最近变更的那条。
 */
import { toRaw } from 'vue'
import type { ChartData, GraphLink, GraphNode } from './graphData'

/** 历史条目 = 操作对象：负载经工厂闭包捕获，栈内不再有 any 形状约定 */
export interface HistoryOp {
  undo: (chart: ChartData) => void
  redo: (chart: ChartData) => void
}

/** 整批负载（粘贴/大纲导入/框选批量删除共用形状） */
export interface BatchPayload {
  nodes: GraphNode[]
  links: GraphLink[]
}

/** 三元组同键判断（与 graphData.linkKey 同语义：两端顺序敏感） */
const sameEdge = (l: GraphLink, edge: GraphLink): boolean =>
  l.source === edge.source && l.target === edge.target && l.name === edge.name

const findEdgeIndex = (links: GraphLink[], edge: GraphLink): number =>
  links.findLastIndex((l) => sameEdge(l, edge))

/** 删除一条与 edge 同键的边（不动其他同端点边）；找不到时无操作 */
const removeOneEdge = (chart: ChartData, edge: GraphLink): void => {
  const idx = findEdgeIndex(chart.links, edge)
  if (idx > -1) chart.links.splice(idx, 1)
}

/** 整批入图（节点 + 边原样 push 回） */
const pushBatch = (chart: ChartData, batch: BatchPayload): void => {
  chart.nodes.push(...batch.nodes)
  chart.links.push(...batch.links)
}

/**
 * 整批移除（多重边安全）：节点按名、边按对象引用——
 * - 节点按名而非引用：中途 deleteNode 再撤销会以副本对象恢复本批节点，
 *   名字仍可命中、引用则会漏
 * - 边按对象引用：操作对象捕获的就是 push 进 chartData 的同一批深拷贝
 *   产物，引用比对天然只命中本批；按三元组/端点对匹配会误删用户手工建
 *   的同端点边
 * - 引用本批节点的悬空边是既有数据，保留不动（与 createNode 撤销对齐）
 * chart 可能是响应式代理（useDocument 的 chartData 经深层 reactive 读出），
 * 代理与闭包捕获的 raw 对象身份不等——成员判定前必须 toRaw 归一，否则
 * 本批边全部漏删（悬空边残留）
 */
const removeBatch = (chart: ChartData, batch: BatchPayload): void => {
  const names = new Set(batch.nodes.map((n) => n.name))
  chart.nodes = chart.nodes.filter((n) => !names.has(n.name))
  const own = new Set(batch.links)
  chart.links = chart.links.filter((l) => !own.has(toRaw(l)))
}

/** 建点：undo 按名移除（引用本批的既有边保留），redo push 回 */
export const createNodeOp = (node: GraphNode): HistoryOp => ({
  undo: (chart) => {
    chart.nodes = chart.nodes.filter((n) => n.name !== node.name)
  },
  redo: (chart) => {
    chart.nodes.push(node)
  }
})

/**
 * 改节点（含改名）：替换目标节点，改名时同步改写引用旧名的边端点。
 * undo 按新名定位还原到 oldNode，redo 按旧名定位写到 newNode。
 */
export const changeNodeOp = (oldNode: GraphNode, newNode: GraphNode): HistoryOp => ({
  undo: (chart) => {
    const i = chart.nodes.findIndex((n) => n.name === newNode.name)
    if (i > -1) {
      chart.nodes[i] = oldNode
      if (newNode.name !== oldNode.name) {
        chart.links.forEach((l) => {
          if (l.source === newNode.name) l.source = oldNode.name
          if (l.target === newNode.name) l.target = oldNode.name
        })
      }
    }
  },
  redo: (chart) => {
    const i = chart.nodes.findIndex((n) => n.name === oldNode.name)
    if (i > -1) {
      chart.nodes[i] = newNode
      if (newNode.name !== oldNode.name) {
        chart.links.forEach((l) => {
          if (l.source === oldNode.name) l.source = newNode.name
          if (l.target === oldNode.name) l.target = newNode.name
        })
      }
    }
  }
})

/** 删点：undo 恢复节点与被连带删除的邻边，redo 按名再删（邻边按端点过滤） */
export const deleteNodeOp = (node: GraphNode, adjacentLinks: GraphLink[]): HistoryOp => ({
  undo: (chart) => {
    chart.nodes.push(node)
    chart.links.push(...adjacentLinks)
  },
  redo: (chart) => {
    chart.nodes = chart.nodes.filter((n) => n.name !== node.name)
    chart.links = chart.links.filter((l) => l.source !== node.name && l.target !== node.name)
  }
})

/** 建边：undo 按三元组移除本条（多重边安全），redo push 回 */
export const createEdgeOp = (edge: GraphLink): HistoryOp => ({
  undo: (chart) => removeOneEdge(chart, edge),
  redo: (chart) => {
    chart.links.push(edge)
  }
})

/** 改边：undo 按新键定位还原 oldEdge，redo 按旧键定位写到 newEdge */
export const changeEdgeOp = (oldEdge: GraphLink, newEdge: GraphLink): HistoryOp => ({
  undo: (chart) => {
    const i = findEdgeIndex(chart.links, newEdge)
    if (i > -1) chart.links[i] = oldEdge
  },
  redo: (chart) => {
    const i = findEdgeIndex(chart.links, oldEdge)
    if (i > -1) chart.links[i] = newEdge
  }
})

/** 删边：undo push 回，redo 按三元组只删本条 */
export const deleteEdgeOp = (edge: GraphLink): HistoryOp => ({
  undo: (chart) => {
    chart.links.push(edge)
  },
  redo: (chart) => removeOneEdge(chart, edge)
})

/**
 * 整批追加（粘贴与大纲导入同构）：一批节点/边被 push 进图——undo 按
 * removeBatch 语义移除本批，redo 原样加回
 */
export const appendBatchOp = (batch: BatchPayload): HistoryOp => ({
  undo: (chart) => removeBatch(chart, batch),
  redo: (chart) => pushBatch(chart, batch)
})

/**
 * 整批删除（框选批量删除）：undo 把整批 push 回（节点 + 直选边 + 删点
 * 连带边），redo 按 removeBatch 语义再删——undo push 回的正是 batch 持有
 * 的对象，引用比对只命中本批，多重边安全
 */
export const removeBatchOp = (batch: BatchPayload): HistoryOp => ({
  undo: (chart) => pushBatch(chart, batch),
  redo: (chart) => removeBatch(chart, batch)
})
