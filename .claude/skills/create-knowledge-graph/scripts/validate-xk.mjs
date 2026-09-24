#!/usr/bin/env node
/**
 * .xk 知识图谱校验脚本 —— create-knowledge-graph 技能配套。
 *
 * 用法：node validate-xk.mjs <file.xk> [file2.xk ...] [--fix]
 *   --fix：JSON 可解析时把文件归一为紧凑单行（与应用保存行为一致：无缩进、
 *          无尾换行、无 BOM），内容不变；已紧凑则不重写（不触碰 mtime）。
 *
 * 检查分两级：
 *   FAIL —— 打不开、渲染错乱或违反全库约定的问题，退出码 1；
 *   WARN —— 不影响打开但偏离质量基准，提醒斟酌。
 *
 * 面向「创作完成的图谱」，比应用打开时的最低校验（src/main/chartValidation.mjs）
 * 更严：空图谱、缺 title/description 在此算 FAIL。零依赖，Node ≥ 16。
 */
import fs from 'node:fs'

const args = process.argv.slice(2)
const fix = args.includes('--fix')
const files = args.filter((a) => a !== '--fix')

if (files.length === 0) {
  console.error('用法: node validate-xk.mjs <file.xk> [file2.xk ...] [--fix]')
  console.error('退出码：全部通过 0；任何 FAIL 或读取/解析失败 1')
  process.exit(1)
}

let anyFail = false
for (const file of files) {
  const r = checkFile(file, fix)
  anyFail = anyFail || r.fails.length > 0
  console.log(`\n■ ${file}`)
  for (const n of r.notes) console.log(`  ${n}`)
  for (const f of r.fails) console.log(`  ✗ FAIL  ${f}`)
  for (const w of r.warns) console.log(`  ⚠ WARN  ${w}`)
  if (r.fails.length === 0) {
    console.log(
      `  ✓ 全部通过 · 节点 ${r.stats.nodes} · 连接 ${r.stats.links} · 类目 ${r.stats.categories} · 连通分量 ${r.stats.components}`
    )
  }
}
process.exit(anyFail ? 1 : 0)

/* ---------- 单文件检查 ---------- */

function checkFile(file, fix) {
  const fails = []
  const warns = []
  const notes = []
  const stats = { nodes: 0, links: 0, categories: 0, components: 0 }

  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    fails.push(`文件不可读：${err.message}`)
    return { fails, warns, notes, stats }
  }

  let body = raw
  if (body.charCodeAt(0) === 0xfeff) {
    if (fix) notes.push('检测到 BOM，已随 --fix 剥离')
    else fails.push('文件带 UTF-8 BOM，JSON.parse 会失败（--fix 可剥离）')
    body = body.slice(1)
  }

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch (err) {
    fails.push(`JSON 解析失败：${err.message}`)
    return { fails, warns, notes, stats }
  }

  // --fix：归一为紧凑单行（键序保持原文件顺序），内容相同不重写
  if (fix) {
    const compact = JSON.stringify(parsed)
    if (compact !== body) {
      fs.writeFileSync(file, compact, 'utf8')
      notes.push(`已归一为紧凑单行（${body.length} → ${compact.length} 字节）`)
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fails.push('顶层不是 JSON 对象')
    return { fails, warns, notes, stats }
  }
  if (parsed.version !== 2) fails.push(`version 应为 2，实际为 ${JSON.stringify(parsed.version)}`)
  if (!Array.isArray(parsed.nodes)) {
    fails.push('缺少节点数组 nodes')
    return { fails, warns, notes, stats }
  }
  if (!Array.isArray(parsed.links)) {
    fails.push('缺少连接数组 links')
    return { fails, warns, notes, stats }
  }
  if (parsed.nodes.length === 0) fails.push('空图谱：nodes 为空数组（空白文件无交付意义）')

  if (typeof parsed.title !== 'string' || !parsed.title.trim()) {
    fails.push('缺少顶层 title（图谱名，与文件名一致）')
  }
  if (typeof parsed.description !== 'string' || !parsed.description.trim()) {
    fails.push('缺少顶层 description（一句话简介）')
  }

  /* ---- 节点 ---- */
  const names = new Map() // name -> 次数
  const badNodes = new Set()
  parsed.nodes.forEach((node, i) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      fails.push(`nodes[${i}] 不是对象`)
      badNodes.add(i)
      return
    }
    if (typeof node.name !== 'string' || !node.name.trim()) {
      fails.push(`nodes[${i}].name 为空`)
      badNodes.add(i)
    } else {
      names.set(node.name, (names.get(node.name) || 0) + 1)
      if (node.name.length > 20) warns.push(`节点名超 20 字：「${node.name}」`)
    }
    if (typeof node.des !== 'string' || !node.des.trim()) {
      fails.push(`节点「${node.name ?? `nodes[${i}]`}」缺 des（悬浮提示为「名称：描述」）`)
    } else if (node.des.length > 120) {
      warns.push(`节点「${node.name}」des 超 120 字，悬浮提示会成长篇`)
    }
    if (typeof node.category !== 'string' || !node.category.trim()) {
      fails.push(`节点「${node.name ?? `nodes[${i}]`}」缺 category（类目决定着色分组）`)
    }
    if (typeof node.symbolSize !== 'number' || !Number.isFinite(node.symbolSize)) {
      fails.push(`节点「${node.name ?? `nodes[${i}]`}」symbolSize 不是数字`)
    } else if (node.symbolSize < 1 || node.symbolSize > 100) {
      fails.push(`节点「${node.name}」symbolSize=${node.symbolSize}，须在 1–100（应用表单硬限制）`)
    }
  })
  const dupNames = [...names.entries()].filter(([, c]) => c > 1).map(([n]) => n)
  if (dupNames.length > 0) {
    fails.push(`节点重名（name 是全图唯一主键）：${dupNames.slice(0, 5).join('、')}${dupNames.length > 5 ? ' 等' : ''}`)
  }

  /* ---- 连接 ---- */
  const nameSet = new Set(names.keys())
  const seenPair = new Set() // "a\u0000b" 归一化端点对（无向）
  const degree = new Map([...nameSet].map((n) => [n, 0]))
  parsed.links.forEach((link, i) => {
    const tag = link && typeof link === 'object' ? `links[${i}]` : `links[${i}]`
    if (!link || typeof link !== 'object' || Array.isArray(link)) {
      fails.push(`${tag} 不是对象`)
      return
    }
    for (const k of ['source', 'target', 'name', 'des']) {
      if (typeof link[k] !== 'string' || !link[k].trim()) {
        fails.push(`${tag}（${link.source ?? '?'} → ${link.target ?? '?'}）缺 ${k}`)
      }
    }
    for (const k of ['source', 'target']) {
      if (typeof link[k] === 'string' && !nameSet.has(link[k])) {
        fails.push(`${tag} 悬空：${k}「${link[k]}」不是任何节点的 name`)
      }
    }
    if (link.source === link.target && typeof link.source === 'string' && link.source) {
      fails.push(`${tag} 自环：source 与 target 都是「${link.source}」`)
    }
    if (
      typeof link.source === 'string' && typeof link.target === 'string' &&
      nameSet.has(link.source) && nameSet.has(link.target) && link.source !== link.target
    ) {
      const key = link.source < link.target ? `${link.source}\u0000${link.target}` : `${link.target}\u0000${link.source}`
      if (seenPair.has(key)) {
        fails.push(`重复连接：「${link.source}」与「${link.target}」之间已有连接（两点间仅允许一条，无向）`)
      }
      seenPair.add(key)
      degree.set(link.source, degree.get(link.source) + 1)
      degree.set(link.target, degree.get(link.target) + 1)
    }
  })

  /* ---- 连通性 ---- */
  const adj = new Map([...nameSet].map((n) => [n, []]))
  for (const key of seenPair) {
    const [a, b] = key.split('\u0000')
    adj.get(a).push(b)
    adj.get(b).push(a)
  }
  const visited = new Set()
  const components = []
  for (const n of nameSet) {
    if (visited.has(n)) continue
    const comp = []
    const queue = [n]
    visited.add(n)
    while (queue.length > 0) {
      const cur = queue.shift()
      comp.push(cur)
      for (const next of adj.get(cur)) {
        if (!visited.has(next)) {
          visited.add(next)
          queue.push(next)
        }
      }
    }
    components.push(comp)
  }
  components.sort((a, b) => b.length - a.length)
  stats.components = components.length
  if (components.length > 1) {
    fails.push(
      `图分裂为 ${components.length} 个连通分量（最大 ${components[0].length} 节点，` +
        `其余如 ${components.slice(1).map((c) => `「${c[0]}」等 ${c.length} 点`).slice(0, 3).join('、')}）——` +
        `力导向图会飘成几簇，需补跨分量桥接边`
    )
  }
  const isolated = [...degree.entries()].filter(([, d]) => d === 0).map(([n]) => n)
  if (isolated.length > 0) {
    fails.push(`孤立节点（度 0）：${isolated.slice(0, 5).join('、')}${isolated.length > 5 ? ' 等' : ''}`)
  }

  /* ---- 质量基准 WARN ---- */
  stats.nodes = parsed.nodes.length
  stats.links = parsed.links.length
  const categories = new Set(
    parsed.nodes.filter((n) => n && typeof n.category === 'string').map((n) => n.category)
  )
  stats.categories = categories.size
  if (stats.nodes < 20) warns.push(`节点仅 ${stats.nodes} 个（全库基准 37–174，目标 60–120）`)
  if (stats.nodes > 300) warns.push(`节点 ${stats.nodes} 个，超出常见规模（渲染与阅读负担重）`)
  if (categories.size > 12) {
    warns.push(`类目 ${categories.size} 个（基准 5–9，色板 20 色封顶，超 20 必撞色）`)
  }
  if (stats.nodes >= 20) {
    const ratio = stats.links / stats.nodes
    if (ratio < 0.8 || ratio > 2.5) {
      warns.push(`连接/节点比 ${ratio.toFixed(2)}（基准 1.2–1.6），结构过稀或过密`)
    }
  }

  return { fails, warns, notes, stats }
}
