import fs from 'fs'
import path from 'path'
import { app, dialog } from 'electron'
import { examplesDir } from './examplePaths'
import { readChartFile } from './fileService'
import { t } from './i18nMain'

/**
 * 世界树索引：多源（examples/ + N 个用户图库目录）扫描 .xk，聚合跨图
 * 同名缝合线，产出只读世界层数据。.xk 文件是唯一权威，本模块产物
 * （world-index.json）是纯缓存：mtime 未变的图不重读，损坏即弃、
 * 全量可重建。世界层永不写任何 .xk。
 */
const INDEX_VERSION = 1
const SETTINGS_VERSION = 2

const cacheFile = () => path.join(app.getPath('userData'), 'world-index.json')
const settingsFile = () => path.join(app.getPath('userData'), 'world-settings.json')

/**
 * 世界树用户图库目录上限：多目录设计天然有膨胀面（每次「增加」都全量
 * 递归扫描），设个宽松上限拦住失控配置（误选盘符根目录之类）并在
 * 增加时提前告知，而不是让扫描变慢后用户自己排查。
 */
const MAX_USER_DIRS = 16

/** 原子写：先写临时文件再 rename 覆盖。失败时清理临时文件（Windows 上
 *  目标被杀软/OneDrive/第二实例占用，rename 抛 EPERM/EBUSY 不清就堆积） */
const atomicWrite = async (filePath, text) => {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await fs.promises.writeFile(tmp, text, 'utf-8')
    await fs.promises.rename(tmp, filePath)
  } catch (err) {
    await fs.promises.unlink(tmp).catch(() => {})
    throw err
  }
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

/**
 * 读取用户图库目录列表（设置 v2）。读 v1 单目录写法自动迁移为
 * 一项数组（不写回盘——下次 setWorldUserDirs 持久化时自然落 v2）；
 * 缺失/损坏视为未配置。条目逐个校验绝对路径，非法项丢弃不阻塞。
 */
const readWorldUserDirs = async () => {
  let parsed
  try {
    parsed = JSON.parse(await fs.promises.readFile(settingsFile(), 'utf-8'))
  } catch {
    return [] // 缺失/损坏：视为未配置
  }
  if (Array.isArray(parsed?.userDirs)) {
    return parsed.userDirs.filter((d) => typeof d === 'string' && path.isAbsolute(d))
  }
  if (typeof parsed?.userDir === 'string' && parsed.userDir) {
    return [parsed.userDir]
  }
  return []
}

const writeWorldUserDirs = async (userDirs) => {
  await atomicWrite(settingsFile(), JSON.stringify({ version: SETTINGS_VERSION, userDirs }))
}

/**
 * 单源扫描：命中缓存（id+mtime+source 三同）免读盘；损坏跳过计数。
 * skipInside：目录前缀表（数组或单值）——命中的文件归先扫的源，用于
 * 用户目录套住 examples（示例归属不被改写、缓存永续失效）与多个
 * 用户目录互相嵌套（内层文件归外层，同一文件不读两次）两种场景
 */
const scanSource = async (dir, { recursive, source, skipInside }, cached, entries, broken) => {
  const skipList = Array.isArray(skipInside) ? skipInside : skipInside ? [skipInside] : []
  for (const { id, mtimeMs } of await listChartFiles(dir, recursive)) {
    if (skipList.some((d) => insideDir(id, d))) continue
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
  const [cached, userDirs] = [await readCache(), await readWorldUserDirs()]
  const entries = new Map()
  const broken = { count: 0 }
  await scanSource(examplesDir(), { recursive: false, source: 'example' }, cached, entries, broken)
  // 多用户目录扫描顺序：先按路径排序（浅的在前）——配合逐目录累积的
  // skipInside 前缀表，嵌套目录（如 D:\ 与 D:\图谱 同时在列）的内层
  // 文件只归最先扫到的外层目录，同一文件永不被读两次（同 examples
  // 防重的推广；缓存条目随目录列表变化可能整体失效一次，属预期成本）
  const scanned = [path.resolve(examplesDir()).toLowerCase()]
  const sortedDirs = [...new Set(userDirs.map((d) => path.resolve(d)))].sort()
  for (const dir of sortedDirs) {
    await scanSource(
      dir,
      { recursive: true, source: 'user', skipInside: scanned },
      cached,
      entries,
      broken
    )
    scanned.push(dir.toLowerCase())
  }
  const graphs = []
  const nodes = []
  for (const entry of entries.values()) {
    graphs.push(entry.graph)
    nodes.push(...entry.nodes)
  }
  graphs.sort((a, b) => (a.id < b.id ? -1 : 1)) // 稳定输出，缓存/重建/测试可复现
  // 缓存写盘尽力而为：产物是纯缓存（损坏即弃、全量可重建），rename 被占用
  // 抛 EPERM 时吞掉——不能让「数据已全部读成功」的世界树打不开（审计 #10）
  await atomicWrite(
    cacheFile(),
    JSON.stringify({
      version: INDEX_VERSION,
      entries: Object.fromEntries(entries),
      builtAt: Date.now()
    })
  ).catch(() => {})
  return { graphs, nodes, stitches: buildStitches(nodes), brokenCount: broken.count, userDirs }
}

/** 前缀判定：resolve 后以 dir + 分隔符开头（大小写不敏感，同 examplePaths 惯例） */
const insideDir = (filePath, dir) => {
  const resolved = path.resolve(filePath)
  return resolved.toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep)
}

/**
 * 读取世界树图库内单图：id 必须位于 examplesDir 或任一用户图库目录
 * 前缀内，防止渲染端传任意路径读盘。合法路径走 readChartFile 复用损坏拦截。
 */
export const readWorldGraph = async (id) => {
  if (typeof id !== 'string' || !id || !path.isAbsolute(id)) {
    throw Object.assign(new Error(`[WORLD_PATH_REJECTED] ${t('error.worldPathRejected')}`), {
      code: 'WORLD_PATH_REJECTED',
      detail: String(id)
    })
  }
  const userDirs = await readWorldUserDirs()
  const allowed = insideDir(id, examplesDir()) || userDirs.some((d) => insideDir(id, d))
  if (!allowed) {
    throw Object.assign(new Error(`[WORLD_PATH_REJECTED] ${t('error.worldPathOutside')}`), {
      code: 'WORLD_PATH_REJECTED',
      detail: id
    })
  }
  return readChartFile(id)
}

/**
 * 增/删世界树用户图库目录（多目录列表语义）。action：
 * - 'pick'：走主进程目录选择框，选中目录**追加**到列表（重复添加按
 *   归一化路径去重，返回 ok:false + reason:'duplicate' 由渲染层提示）；
 * - { remove: dir }：按归一化路径移除一项（不在列表返回 ok:false +
 *   reason:'notfound'，不 throw——移除一个已被移除的目录是幂等操作）。
 * 变更持久化到 world-settings.json（v2 userDirs 数组），下次
 * loadWorldIndex 按新列表增量重建（消失目录的旧条目自然淘汰）。
 * window 为触发窗口：绑定为对话框 parent 使其模态，防止对话框
 * 打开期间窗口仍可点击「增加目录」连开多个选择框（可为 undefined）。
 */
export const setWorldUserDirs = async (action, window) => {
  const normalize = (d) => path.resolve(d)
  const sameDir = (a, b) => normalize(a).toLowerCase() === normalize(b).toLowerCase()

  if (action?.remove !== undefined) {
    if (typeof action.remove !== 'string' || !path.isAbsolute(action.remove)) {
      throw Object.assign(new Error(`[WORLD_DIR_REJECTED] ${t('error.worldDirRejected')}`), {
        code: 'WORLD_DIR_REJECTED',
        detail: String(action.remove)
      })
    }
    const dirs = await readWorldUserDirs()
    const next = dirs.filter((d) => !sameDir(d, action.remove))
    if (next.length === dirs.length) {
      return { ok: false, reason: 'notfound', userDirs: dirs }
    }
    await writeWorldUserDirs(next)
    return { ok: true, userDirs: next }
  }

  let dir = action
  if (dir === 'pick') {
    const res = await dialog.showOpenDialog(window, {
      title: t('dialog.pickWorldDir'),
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths?.length) {
      return { ok: false, reason: 'canceled', userDirs: await readWorldUserDirs() }
    }
    dir = res.filePaths[0]
  }
  if (dir === null) {
    await writeWorldUserDirs([])
    return { ok: true, userDirs: [] }
  }
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
    throw Object.assign(new Error(`[WORLD_DIR_REJECTED] ${t('error.worldDirRejected')}`), {
      code: 'WORLD_DIR_REJECTED',
      detail: String(dir)
    })
  }
  const dirs = await readWorldUserDirs()
  if (dirs.some((d) => sameDir(d, dir))) {
    return { ok: false, reason: 'duplicate', userDirs: dirs }
  }
  if (dirs.length >= MAX_USER_DIRS) {
    return { ok: false, reason: 'limit', userDirs: dirs }
  }
  const next = [...dirs, normalize(dir)]
  await writeWorldUserDirs(next)
  return { ok: true, userDirs: next }
}
