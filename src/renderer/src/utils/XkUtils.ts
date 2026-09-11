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
    'name': '',
    'des': '',
    'symbolSize': 50,
    'category': ''
  }
}

export function resetEdgeRef(edge) {
  edge.value = {
    'source': '',
    'target': '',
    'name': '',
    'des': ''
  }
}
