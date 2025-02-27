export function jsonReactive(x) {
  return JSON.parse(JSON.stringify(x))
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
