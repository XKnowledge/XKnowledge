/**
 * undo/redo 的数据补偿操作：按历史条目把 chartData 变换到相邻历史状态。
 * 从 ChartView 抽出为纯数据变换，边界场景（多重边）可在 vitest 下回归。
 *
 * 边的定位必须用「端点对 + 边名」三元组，不能只按端点对匹配：文件允许
 * 同一对节点间存在多条边（examples/中医基础理论.xk、地理.xk 自带此形态），
 * 按端点对 filter/findIndex 会连带误伤邻边（重做删除时整对删光、撤销
 * 修改时改错对象）。查找用 findLastIndex 从后向前：后创建/后恢复的边
 * 在数组尾部，撤销时优先命中最近变更的那条。
 */

/** 三元组同键判断（与 isSameLink 一致：两端顺序敏感） */
const sameEdge = (l, edge) =>
  l.source === edge.source && l.target === edge.target && l.name === edge.name

const findEdgeIndex = (links, edge) => links.findLastIndex((l) => sameEdge(l, edge))

/** 删除一条与 edge 同键的边（不动其他同端点边）；找不到时无操作 */
const removeOneEdge = (chartData, edge) => {
  const idx = findEdgeIndex(chartData.links, edge)
  if (idx > -1) chartData.links.splice(idx, 1)
}

/**
 * 撤销 currentHistory 记录的操作，直接修改 chartData。
 * 返回是否执行了已知操作（未知 act 返回 false，调用方据此跳过刷新）。
 */
export const applyUndo = (chartData, currentHistory) => {
  const actionHandlers = {
    createNode: () => {
      chartData.nodes = chartData.nodes.filter((node) => node.name !== currentHistory.data.name)
    },

    changeNode: () => {
      const nodeIndex = chartData.nodes.findIndex((node) => node.name === currentHistory.new.name)

      if (nodeIndex > -1) {
        // 还原节点数据
        chartData.nodes[nodeIndex] = currentHistory.old

        // 更新关联的边
        if (currentHistory.new.name !== currentHistory.old.name) {
          chartData.links.forEach((link) => {
            if (link.source === currentHistory.new.name) link.source = currentHistory.old.name
            if (link.target === currentHistory.new.name) link.target = currentHistory.old.name
          })
        }
      }
    },

    deleteNode: () => {
      chartData.nodes.push(currentHistory.data)
      chartData.links.push(...currentHistory.links)
    },

    createEdge: () => removeOneEdge(chartData, currentHistory.data),

    changeEdge: () => {
      const edgeIndex = findEdgeIndex(chartData.links, currentHistory.new)

      if (edgeIndex > -1) {
        chartData.links[edgeIndex] = currentHistory.old
      }
    },

    deleteEdge: () => {
      chartData.links.push(currentHistory.data)
    }
  }

  const handler = actionHandlers[currentHistory.act]
  if (!handler) return false
  handler()
  return true
}

/**
 * 重做 currentHistory 记录的操作（applyUndo 的逆变换），直接修改 chartData。
 * 返回是否执行了已知操作。
 */
export const applyRedo = (chartData, currentHistory) => {
  const actionHandlers = {
    createNode: () => {
      chartData.nodes.push(currentHistory.data)
    },

    changeNode: () => {
      const nodes = chartData.nodes
      const nodeIndex = nodes.findIndex((n) => n.name === currentHistory.old.name)

      if (nodeIndex > -1) {
        nodes[nodeIndex] = currentHistory.new

        // 更新关联边名称
        if (currentHistory.new.name !== currentHistory.old.name) {
          chartData.links.forEach((link) => {
            if (link.source === currentHistory.old.name) link.source = currentHistory.new.name
            if (link.target === currentHistory.old.name) link.target = currentHistory.new.name
          })
        }
      }
    },

    deleteNode: () => {
      chartData.nodes = chartData.nodes.filter((n) => n.name !== currentHistory.data.name)
      chartData.links = chartData.links.filter(
        (l) => l.source !== currentHistory.data.name && l.target !== currentHistory.data.name
      )
    },

    createEdge: () => {
      chartData.links.push(currentHistory.data)
    },

    changeEdge: () => {
      const edgeIndex = findEdgeIndex(chartData.links, currentHistory.old)

      if (edgeIndex > -1) {
        chartData.links[edgeIndex] = currentHistory.new
      }
    },

    deleteEdge: () => removeOneEdge(chartData, currentHistory.data)
  }

  const handler = actionHandlers[currentHistory.act]
  if (!handler) return false
  handler()
  return true
}
