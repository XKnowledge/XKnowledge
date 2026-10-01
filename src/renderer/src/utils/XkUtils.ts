export function jsonReactive(x) {
  return JSON.parse(JSON.stringify(x))
}

export function addHistory(xkContext, history) {
  /**
   * 追加一条历史记录：
   * 先截断当前位置之后废弃的redo分支，再追加并移动当前序号。
   * 如果不截断，undo之后做新操作会残留过期记录，再次undo/redo时
   * 会重复添加节点/边或重放与当前状态不符的操作。
   */
  const ctx = xkContext.value
  ctx.historyList.splice(ctx.historySequenceNumber + 1)
  ctx.historyList.push(history)
  ctx.historySequenceNumber = ctx.historyList.length - 1
}

export function resetNodeRef(node) {
  node.value = {
    name: '',
    des: '',
    symbolSize: 50,
    category: ''
  }
}

export function resetEdgeRef(edge) {
  edge.value = {
    source: '',
    target: '',
    name: '',
    des: ''
  }
}

/**
 * 创建节点/连接的共享数据操作：侧栏表单路径与画布直操路径共用同一套
 * 校验 + 历史 + 刷新，保证两条入口行为一致。返回 { ok: false, error }
 * 时数据未变动，错误展示方式（侧栏 errorMessage / message.error）由调用方决定。
 */
export function createNodeInChart(xkContext, node) {
  const ctx = xkContext.value
  if (!node.name?.trim()) return { ok: false, error: '节点名称不能为空' }
  if (!node.category?.trim()) return { ok: false, error: '请选择/创建节点所属类目' }
  const { nodes } = ctx.chartData
  if (nodes.some((n) => n.name === node.name)) return { ok: false, error: '不能创建同名节点' }

  const newNodeJson = jsonReactive({ ...node })
  nodes.push(newNodeJson)
  addHistory(xkContext, { act: 'createNode', data: newNodeJson })
  ctx.updateChart = !ctx.updateChart
  return { ok: true, data: newNodeJson }
}

export function createEdgeInChart(xkContext, edge) {
  const ctx = xkContext.value
  const { links } = ctx.chartData
  const isDuplicate = links.some(
    (l) =>
      (l.source === edge.source && l.target === edge.target) ||
      (l.source === edge.target && l.target === edge.source)
  )
  if (isDuplicate) return { ok: false, error: '两个节点间连接已存在' }

  const newEdgeJson = jsonReactive({ ...edge })
  links.push(newEdgeJson)
  addHistory(xkContext, { act: 'createEdge', data: newEdgeJson })
  ctx.updateChart = !ctx.updateChart
  return { ok: true, data: newEdgeJson }
}
