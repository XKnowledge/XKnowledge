import path from 'path'
import { examplesDir } from './examplePaths'
import { listExamplesFrom } from './exampleManifest.mjs'
import { readChartFile } from './fileService'

/**
 * 内置示例图库：examples/ 目录即图库，放入合法 .xk 即自动出现。
 * 开发态目录在项目根，打包后在 asar 内（只读，恰好保证示例永不被写坏）。
 * 所有文件 IO 收在主进程。
 *
 * 列表走 exampleManifest 的快慢两层（清单命中即免逐文件读取，首页
 * 「新建空白卡 → 停顿 → 卡片齐现」的两段式由此消除；清单机制与
 * 「看得见的打得开」语义权衡见 exampleManifest.mjs 头注释）；
 * 本模块只负责定位目录与转发。
 */

/**
 * 列出全部可用示例的元数据。
 * 目录不存在/为空返回 []；单个文件读取或校验失败由清单层跳过并 warn。
 */
export const listExamples = async () => listExamplesFrom(examplesDir())

/** 允许的示例文件名：字母/数字/下划线/中文/连字符 + .xk，不含任何路径成分 */
const EXAMPLE_NAME_RE = /^[\w一-龥-]+\.xk$/

/**
 * 读取指定示例，返回 { content }（渲染端 parse 后装载，path 由渲染端置空
 * 走"另存为"副本语义）。文件名校验 + 目录逃逸检查双保险防路径穿越，
 * 之后交给 readChartFile 复用与"打开文件"一致的损坏拦截——这也兜住
 * 清单快路径的极端场景：磁盘文件在清单生成后被换坏时，此处拦截
 * 并向用户报「打开失败」而非白屏。
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
