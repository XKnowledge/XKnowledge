import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { examplesDir } from './examplePaths'
import { readChartFile } from './fileService'

/**
 * 世界图索引：双源（examples/ + 用户图目录）扫描 .xk，聚合跨图同名缝合线，
 * 产出只读世界层数据。.xk 文件是唯一权威，本模块产物（world-index.json）
 * 是纯缓存：mtime 未变的图不重读，损坏即弃、全量可重建。
 * 世界层永不写任何 .xk。
 */
const INDEX_VERSION = 1

const cacheFile = () => path.join(app.getPath('userData'), 'world-index.json')
const settingsFile = () => path.join(app.getPath('userData'), 'world-settings.json')

const atomicWrite = async (filePath, text) => {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await fs.promises.writeFile(tmp, text, 'utf-8')
  await fs.promises.rename(tmp, filePath)
}

/**
 * 同名缝合聚合（纯函数）：nodes → [{ name, graphIds }]
 * 只收出现在 ≥2 图的名字；graphIds 升序去重；结果按 name 排序（确定性）。
 */
export const buildStitches = (nodes) => {
  const byName = new Map()
  for (const n of nodes ?? []) {
    if (!byName.has(n.name)) byName.set(n.name, new Set())
    byName.get(n.name).add(n.graphId)
  }
  const out = []
  for (const [name, ids] of byName) {
    if (ids.size > 1) out.push({ name, graphIds: [...ids].sort() })
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1))
}

/** 收集目录下全部 .xk（recursive 时含子目录）的 { id, mtimeMs }；目录不可访问返回 [] */
const listChartFiles = async (dir, recursive) => {
  const out = []
  let entries
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return out // 目录不存在/无权限：空源，不阻塞另一源
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (recursive) out.push(...(await listChartFiles(p, recursive)))
    } else if (e.isFile() && e.name.endsWith('.xk')) {
      try {
        const { mtimeMs } = await fs.promises.stat(p)
        out.push({ id: path.resolve(p), mtimeMs })
      } catch {
        /* 竞态消失：跳过 */
      }
    }
  }
  return out
}

const readCache = async () => {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(cacheFile(), 'utf-8'))
    if (parsed?.version === INDEX_VERSION && parsed.entries && typeof parsed.entries === 'object') {
      return new Map(Object.entries(parsed.entries))
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      // 缓存损坏：备份后从空重建（.bak 覆盖旧备份无害）
      await fs.promises.rename(cacheFile(), `${cacheFile()}.bak`).catch(() => {})
    }
  }
  return new Map()
}

export const readWorldUserDir = async () => {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(settingsFile(), 'utf-8'))
    if (typeof parsed?.userDir === 'string' && parsed.userDir) return parsed.userDir
  } catch {
    /* 缺失/损坏：视为未配置 */
  }
  return null
}

/** 单源扫描：命中缓存（id+mtime+source 三同）免读盘；损坏跳过计数 */
const scanSource = async (dir, { recursive, source }, cached, entries, broken) => {
  for (const { id, mtimeMs } of await listChartFiles(dir, recursive)) {
    const hit = cached.get(id)
    if (hit && hit.graph.mtimeMs === mtimeMs && hit.graph.source === source) {
      entries.set(id, hit)
      continue
    }
    let chart
    try {
      const { content } = await readChartFile(id)
      chart = JSON.parse(content)
    } catch {
      broken.count++
      continue
    }
    entries.set(id, {
      graph: {
        id,
        title: chart.title ?? path.basename(id, '.xk'),
        source,
        nodeCount: chart.nodes.length,
        linkCount: chart.links.length,
        mtimeMs
      },
      nodes: chart.nodes.map((n) => ({
        graphId: id,
        name: n.name,
        des: n.des ?? '',
        category: n.category ?? ''
      }))
    })
  }
}

export const loadWorldIndex = async () => {
  const [cached, userDir] = [await readCache(), await readWorldUserDir()]
  const entries = new Map()
  const broken = { count: 0 }
  await scanSource(examplesDir(), { recursive: false, source: 'example' }, cached, entries, broken)
  if (userDir && path.resolve(userDir) !== path.resolve(examplesDir())) {
    await scanSource(userDir, { recursive: true, source: 'user' }, cached, entries, broken)
  }
  const graphs = []
  const nodes = []
  for (const entry of entries.values()) {
    graphs.push(entry.graph)
    nodes.push(...entry.nodes)
  }
  graphs.sort((a, b) => (a.id < b.id ? -1 : 1)) // 稳定输出，缓存/重建/测试可复现
  await atomicWrite(
    cacheFile(),
    JSON.stringify({
      version: INDEX_VERSION,
      entries: Object.fromEntries(entries),
      builtAt: Date.now()
    })
  )
  return { graphs, nodes, stitches: buildStitches(nodes), brokenCount: broken.count, userDir }
}
