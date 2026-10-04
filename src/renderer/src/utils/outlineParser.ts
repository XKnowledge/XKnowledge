/**
 * 大纲文本 → 图谱结构的纯规则解析（future-features F1：非 AI 的本地数据入口）。
 * 支持 ATX 标题层级、缩进列表（-/*+/数字.，2 空格或 1 tab 一档）、[[双链]]、
 * 段落文本→描述。父 = 栈内最近的更浅者；相邻深度 1 根节点成链（后根挂前根）。
 * 规则见同目录测试与 user-guide「从大纲导入」章节。
 */
import type { GraphNode, GraphLink } from './graphData'

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/
const WIKI_RE = /\[\[([^\]]+)\]\]/g

/** 结构行解析：返回 { depth, title } 或 null（非结构行） */
const parseLine = (line: string, baseDepth: number): { depth: number; title: string } | null => {
  const h = line.match(HEADING_RE)
  if (h) return { depth: h[1].length, title: h[2] }
  const l = line.match(LIST_RE)
  if (l) {
    const indent = l[1].replace(/\t/g, '  ').length
    return { depth: baseDepth + 1 + Math.floor(indent / 2), title: l[3] }
  }
  return null
}

/** 提取双链目标 + 剥离标记后的显示文本 */
const splitWiki = (text: string): { refs: string[]; display: string } => {
  const refs: string[] = []
  const display = text.replace(WIKI_RE, (_, name) => {
    refs.push(name.trim())
    return name.trim()
  })
  return { refs, display: display.trim() }
}

export const parseOutline = (
  text: string | null | undefined
): { nodes: GraphNode[]; links: GraphLink[] } => {
  const nodes = new Map<string, GraphNode>() // name → node
  const links: GraphLink[] = []
  const seenPair = new Set<string>()
  const stack: Array<{ depth: number; name: string }> = []

  const ensureNode = (name: string, category: string, symbolSize: number): GraphNode => {
    if (!nodes.has(name)) {
      nodes.set(name, { name, des: '', category, symbolSize })
    }
    return nodes.get(name)!
  }

  const addLink = (source: string, target: string): void => {
    if (!source || !target || source === target) return
    const key = source < target ? `${source}\u0000${target}` : `${target}\u0000${source}`
    if (seenPair.has(key)) return
    seenPair.add(key)
    links.push({ source, target, name: '', des: '' })
  }

  let baseDepth = 0 // 最近标题的深度（列表项挂靠基准）
  let currentRoot: string | null = null // 最近的深度 1 节点（非根节点的所属一级祖先）
  let current: GraphNode | null = null // 最近的结构行节点（段落归属）

  for (const raw of String(text ?? '').split(/\r\n|\r|\n/)) {
    if (!raw.trim()) continue // 空行跳过：段落归属跨空行延续（标准 markdown
    // 标题与正文常隔空行），段落只在遇到下一个结构行时结束
    const struct = parseLine(raw, baseDepth)
    if (!struct) {
      // 段落行 → 最近节点的 des（[[双链]] 同样剥离标记并连边，规则与结构行一致）
      if (current) {
        const { refs, display } = splitWiki(raw.trim())
        current.des = current.des ? `${current.des} ${display}` : display
        for (const ref of refs) {
          ensureNode(ref, '未分类', 50)
          addLink(current.name, ref)
        }
      }
      continue
    }
    if (raw.match(HEADING_RE)) baseDepth = struct.depth

    const { refs, display } = splitWiki(struct.title)
    if (!display) continue

    // 弹栈到父级：父 = 栈内最近的更浅者（深度跳级安全）
    while (stack.length && stack[stack.length - 1].depth >= struct.depth) stack.pop()
    let parent = stack.length ? stack[stack.length - 1].name : null
    // 根链：新的深度 1 节点无更浅父级时，挂到前一个根（多根大纲连成一片）
    const isRoot = struct.depth === 1
    if (!parent && isRoot && currentRoot) parent = currentRoot
    if (isRoot) currentRoot = display

    const node = ensureNode(display, isRoot ? display : (currentRoot ?? '未分类'), isRoot ? 70 : 50)
    if (parent) addLink(parent, node.name)
    stack.push({ depth: struct.depth, name: node.name })

    for (const ref of refs) {
      ensureNode(ref, '未分类', 50)
      addLink(node.name, ref)
    }

    current = node
  }

  return { nodes: [...nodes.values()], links }
}
