import path from 'path'
import { app } from 'electron'

/**
 * 内置示例目录定位与写保护判定。
 * 受保护的内置目录有两个：examples/（图库）与 data/（内置示例，如 test.xk），
 * 均按"打开即副本、保存必另存"的只读资产对待。
 * fileService / ipc / exampleService 三方都需要判断"路径是否在受保护
 * 目录内"，放在独立小模块避免 fileService ↔ exampleService 循环依赖。
 */

/** examples 图库目录：开发态在项目根，打包后在 asar 内 */
export const examplesDir = () => path.join(app.getAppPath(), 'examples')

/** 受保护的内置目录名（相对 app 根）；打包后均不在发布包内 */
const PROTECTED_DIR_NAMES = ['examples', 'data']

/**
 * 路径是否位于受保护的内置示例目录内（含子目录）。
 * 统一小写比较：Windows/macOS 文件系统大小写不敏感，用户在对话框里
 * 输入的路径大小写不可控；Linux 上需真实存在仅大小写不同的目录才会误判，
 * 可忽略。
 */
export const isExamplePath = (filePath) => {
  if (typeof filePath !== 'string' || !filePath) return false
  const appRoot = path.resolve(app.getAppPath())
  const target = path.resolve(filePath).toLowerCase()
  return PROTECTED_DIR_NAMES.some((name) => {
    const dir = path.join(appRoot, name) + path.sep
    return target.startsWith(dir.toLowerCase())
  })
}
