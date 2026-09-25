import fs from 'fs'
import path from 'path'
import { app, dialog } from 'electron'
import { examplesDir } from './examplePaths'
import { readChartFile } from './fileService'

/**
 * 世界图索引：双源（examples/ + 用户图目录）扫描 .xk，聚合跨图同名缝合线，
 * 产出只读世界层数据。.xk 文件是唯一权威，本模块产物（world-index.json）
 * 是纯缓存：mtime 未变的图不重读，损坏即弃、全量可重建。
 * 世界层永不写任何 .xk。
 */
const INDEX_VERSION = 1
const SETTINGS_VERSION = 1

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

const readWorldUserDir = async () => {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(settingsFile(), 'utf-8'))
    if (typeof parsed?.userDir === 'string' && parsed.userDir) return parsed.userDir
  } catch {
    /* 缺失/损坏：视为未配置 */
  }
  return null
}

const writeWorldUserDir = async (userDir) => {
  await atomicWrite(settingsFile(), JSON.stringify({ version: SETTINGS_VERSION, userDir }))
}

/**
 * 单源扫描：命中缓存（id+mtime+source 三同）免读盘；损坏跳过计数。
 * skipInside：user 源扫描时跳过 examplesDir 内的文件——userDir 若覆盖
 * examples 的父目录，同一文件会被两源发现，缓存按 source 匹配将永续
 * 失效（每次全量重读）且 source 被改写为 user，跳过保住示例归属与缓存
 */
const scanSource = async (dir, { recursive, source, skipInside }, cached, entries, broken) => {
  for (const { id, mtimeMs } of await listChartFiles(dir, recursive)) {
    if (skipInside && insideDir(id, skipInside)) continue
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
    await scanSource(
      userDir,
      { recursive: true, source: 'user', skipInside: examplesDir() },
      cached,
      entries,
      broken
    )
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

/** 前缀判定：resolve 后以 dir + 分隔符开头（大小写不敏感，同 examplePaths 惯例） */
const insideDir = (filePath, dir) => {
  const resolved = path.resolve(filePath)
  return resolved.toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep)
}

/**
 * 读取世界图库内单图：id 必须位于 examplesDir 或当前 userDir 前缀内，
 * 防止渲染端传任意路径读盘。合法路径走 readChartFile 复用损坏拦截。
 */
export const readWorldGraph = async (id) => {
  if (typeof id !== 'string' || !id || !path.isAbsolute(id)) {
    throw Object.assign(new Error('[WORLD_PATH_REJECTED] 无效的图谱路径'), {
      code: 'WORLD_PATH_REJECTED',
      detail: String(id)
    })
  }
  const userDir = await readWorldUserDir()
  const allowed = insideDir(id, examplesDir()) || (userDir ? insideDir(id, userDir) : false)
  if (!allowed) {
    throw Object.assign(new Error('[WORLD_PATH_REJECTED] 路径不在世界图库范围内'), {
      code: 'WORLD_PATH_REJECTED',
      detail: id
    })
  }
  return readChartFile(id)
}

/**
 * 设置/清除/选择用户图目录。'pick' 走主进程目录对话框；null 清除；
 * 字符串须为绝对路径。变更持久化到 world-settings.json，
 * 下次 loadWorldIndex 按新目录增量重建（旧 user 源条目自然消失）。
 */
export const setWorldUserDir = async (dir) => {
  if (dir === 'pick') {
    const res = await dialog.showOpenDialog({
      title: '选择图库目录',
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths?.length) {
      return { ok: false, userDir: await readWorldUserDir() }
    }
    dir = res.filePaths[0]
  }
  if (dir === null) {
    await writeWorldUserDir(null)
    return { ok: true, userDir: null }
  }
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
    throw Object.assign(new Error('[WORLD_DIR_REJECTED] 无效的图库目录'), {
      code: 'WORLD_DIR_REJECTED',
      detail: String(dir)
    })
  }
  const resolved = path.resolve(dir)
  await writeWorldUserDir(resolved)
  return { ok: true, userDir: resolved }
}
