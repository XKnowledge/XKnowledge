/**
 * 示例图库元数据清单（manifest）：首页卡片所需的 fileName/title/description/
 * nodeCount/linkCount/categories 预先收集进 examples/examples.manifest.json，
 * 运行时读一个小文件（~1ms）代替逐个读取全部 .xk（207 个串行 ~85ms），
 * 首页「新建空白卡 → 停顿 → 卡片齐现」的两段式由此消除。
 *
 * 快慢两层：
 *   快路径——目录 .xk 文件名集合与清单一致时直接信任清单（清单在生成时
 *           已逐文件过 validateChartStructure，「看得见的打得开」在生成
 *           时成立；此后文件被换坏的极端情形由 openExample 的 readChartFile
 *           损坏拦截兜底，表现为点击时提示而非白屏）；
 *   慢路径——清单缺失/损坏/不一致（开发态增删示例）时退回逐文件读取，
 *           并重写清单让下次回到快路径（打包态 examples 在只读 asar 内，
 *           重写失败静默——asar 内容构建时已固定，快路径恒命中）。
 *
 * 本模块保持零 electron 依赖（仅 node:fs/path + chartValidation 纯模块），
 * .mjs 后缀使生成脚本（scripts/generate-example-manifest.mjs）与
 * electron 主进程、vitest 三方都能直接 import。
 */
import fs from 'fs'
import path from 'path'
import { validateChartStructure } from './chartValidation.mjs'

/** 清单文件名；放在 examples/ 内随 electron-builder files 通配自动进包 */
export const MANIFEST_NAME = 'examples.manifest.json'

/** 清单格式版本：字段增删时递增，旧清单解析失败自然走慢路径重建 */
const MANIFEST_VERSION = 1

const isString = (v) => typeof v === 'string'

/** 清单条目必须是完整形状——缺任一字段（如手改丢 title）视为清单不可信 */
const isValidItem = (it) =>
  !!it &&
  typeof it === 'object' &&
  isString(it.fileName) &&
  isString(it.title) &&
  isString(it.description) &&
  typeof it.nodeCount === 'number' &&
  typeof it.linkCount === 'number' &&
  Array.isArray(it.categories) &&
  it.categories.every(isString)

/** 序列化：按 fileName 码点序存储（与 readdir 序无关，跨平台清单字节稳定，
 *  同步守护测试与生成脚本才能逐字节对比）；2 空格缩进让 git diff 可 review；
 *  拷贝后排序，不改入参顺序 */
export const serializeManifest = (items) =>
  JSON.stringify(
    {
      version: MANIFEST_VERSION,
      items: [...items].sort((a, b) => (a.fileName < b.fileName ? -1 : 1))
    },
    null,
    2
  )

/** 解析：任何不可信（非法 JSON / 缺 version / 条目形状不对）一律返回 null */
export const parseManifest = (raw) => {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (parsed.version !== MANIFEST_VERSION || !Array.isArray(parsed.items)) return null
    if (!parsed.items.every(isValidItem)) return null
    return parsed.items
  } catch {
    return null
  }
}

/** 清单与目录是否一致：fileName 集合相等（顺序无关）；清单内重名视为不一致 */
export const manifestMatches = (items, fileNames) => {
  if (!Array.isArray(items)) return false
  const listed = new Set(items.map((it) => it.fileName))
  if (listed.size !== items.length) return false
  const onDisk = new Set(fileNames)
  if (listed.size !== onDisk.size) return false
  for (const name of listed) {
    if (!onDisk.has(name)) return false
  }
  return true
}

/* ---------- 扫描与编排（fs 逻辑，仍零 electron 依赖） ---------- */

/** readdir 结果 → 参与扫描/比对的 .xk 文件名列表（manifest 自身被排除） */
const xkFileNames = (entries) =>
  entries.filter((e) => e.isFile() && e.name.endsWith('.xk')).map((e) => e.name)

/** 从单个已校验的 parsed 图谱提取卡片元数据；categories 的 undefined 归一为
 *  空串——保证 JSON 序列化进清单后往返等值（渲染端 filterExamples/catColor
 *  均已按 ?? '' 防御，此归一对展示零影响） */
const extractMeta = (parsed, fileName) => ({
  fileName,
  title: parsed.title || fileName.replace(/\.xk$/, ''),
  description: parsed.description || '',
  nodeCount: parsed.nodes.length,
  linkCount: parsed.links.length,
  categories: [...new Set(parsed.nodes.map((n) => n.category ?? ''))]
})

/**
 * 只读扫描（慢路径主体）：逐文件读取 + 校验 + 提取元数据。
 * 目录不存在返回 []；单个文件读取或校验失败跳过并 warn，不拖垮整表。
 * 生成脚本与同步守护测试也直接用它，保证「生成时」与「运行时」同一逻辑。
 */
export const scanExamples = async (dir) => {
  let entries
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const items = []
  for (const name of xkFileNames(entries)) {
    try {
      const raw = await fs.promises.readFile(path.join(dir, name), 'utf-8')
      const parsed = JSON.parse(raw)
      if (validateChartStructure(parsed) !== null) {
        console.warn(`[exampleManifest] 示例结构不合规，已跳过: ${name}`)
        continue
      }
      items.push(extractMeta(parsed, name))
    } catch (err) {
      console.warn(`[exampleManifest] 示例读取失败，已跳过: ${name}`, err?.message)
    }
  }
  return items
}

/**
 * 列表编排（快慢两层）。目录不存在返回 []。
 * 清单重写失败（打包态 asar 只读）静默——包内清单由构建流程保证与目录
 * 一致，快路径恒命中，重写仅服务开发态增删示例后的自愈。
 */
export const listExamplesFrom = async (dir) => {
  let entries
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const fileNames = xkFileNames(entries)

  // 快路径：清单存在且与目录文件名集合一致 → 直接信任（不再读 .xk）
  try {
    const raw = await fs.promises.readFile(path.join(dir, MANIFEST_NAME), 'utf-8')
    const items = parseManifest(raw)
    if (items !== null && manifestMatches(items, fileNames)) return items
  } catch {
    // 清单不存在（首跑/全新目录）——落慢路径
  }

  // 慢路径：逐文件扫描，重写清单让下次回到快路径
  const items = await scanExamples(dir)
  try {
    await fs.promises.writeFile(path.join(dir, MANIFEST_NAME), serializeManifest(items), 'utf-8')
  } catch {
    // 只读目录（打包态 asar）：无需重建，见函数注释
  }
  return items
}
