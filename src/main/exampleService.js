import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { readChartFile, validateChartStructure } from './fileService'

/**
 * 内置示例图库：examples/ 目录即图库，放入合法 .xk 即自动出现。
 * 开发态目录在项目根，打包后在 asar 内（只读，恰好保证示例永不被写坏）。
 * 所有文件 IO 收在主进程；列表阶段就用 validateChartStructure 过滤，
 * 保证"图库里看得见的，双击一定打得开"。
 */

/** 允许的示例文件名：字母/数字/下划线/中文/连字符 + .xk，不含任何路径成分 */
const EXAMPLE_NAME_RE = /^[\w一-龥-]+\.xk$/

const examplesDir = () => path.join(app.getAppPath(), 'examples')

/**
 * 列出全部可用示例的元数据。
 * 目录不存在/为空返回 []；单个文件读取或校验失败跳过并 warn，不拖垮整表。
 */
export const listExamples = async () => {
  let entries
  try {
    entries = await fs.promises.readdir(examplesDir(), { withFileTypes: true })
  } catch {
    return [] // 开发裁剪或异常打包下目录可能不存在，图库显示空态即可
  }

  const examples = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.xk')) continue
    try {
      const raw = await fs.promises.readFile(path.join(examplesDir(), entry.name), 'utf-8')
      const parsed = JSON.parse(raw)
      if (validateChartStructure(parsed) !== null) {
        console.warn(`[exampleService] 示例结构不合规，已跳过: ${entry.name}`)
        continue
      }
      const categories = [...new Set(parsed.nodes.map((n) => n.category))]
      examples.push({
        fileName: entry.name,
        title: parsed.title || entry.name.replace(/\.xk$/, ''),
        description: parsed.description || '',
        nodeCount: parsed.nodes.length,
        linkCount: parsed.links.length,
        categories
      })
    } catch (err) {
      console.warn(`[exampleService] 示例读取失败，已跳过: ${entry.name}`, err?.message)
    }
  }
  return examples
}

/**
 * 读取指定示例，返回 { content }（渲染端 parse 后装载，path 由渲染端置空
 * 走"另存为"副本语义）。文件名校验 + 目录逃逸检查双保险防路径穿越，
 * 之后交给 readChartFile 复用与"打开文件"一致的损坏拦截。
 */
export const openExample = async (fileName) => {
  if (typeof fileName !== 'string' || !EXAMPLE_NAME_RE.test(fileName)) {
    throw Object.assign(new Error('无效的示例文件名'), {
      code: 'INVALID_EXAMPLE_NAME',
      detail: String(fileName)
    })
  }
  const dir = path.resolve(examplesDir())
  const filePath = path.resolve(dir, fileName)
  if (!filePath.startsWith(dir + path.sep)) {
    throw Object.assign(new Error('无效的示例文件名'), {
      code: 'INVALID_EXAMPLE_NAME',
      detail: fileName
    })
  }
  const { content } = await readChartFile(filePath)
  return { content }
}
