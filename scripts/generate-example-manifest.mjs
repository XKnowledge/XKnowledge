// 生成示例图库元数据清单：扫描 examples/ 全部合法 .xk，把卡片所需元数据
// （fileName/title/description/nodeCount/linkCount/categories）写入
// examples/examples.manifest.json，主进程 listExamples 命中清单即免逐文件
// 读取（~85ms → ~1ms，首页两段式加载消除；机制详见 src/main/exampleManifest.mjs）。
//
// 何时跑：改/增/删 examples/ 内的 .xk 之后（同步守护测试会红来提醒你），
// 以及构建流程 prebuild 自动跑。产物随仓库提交——打包态 asar 只读，
// 清单必须随 examples/ 一起进包才能走快路径。
//
// 用法：yarn generate:examples
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanExamples, serializeManifest, MANIFEST_NAME } from '../src/main/exampleManifest.mjs'

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXAMPLES_DIR = path.join(APP_ROOT, 'examples')
const manifestPath = path.join(EXAMPLES_DIR, MANIFEST_NAME)

if (!fs.existsSync(EXAMPLES_DIR)) {
  console.error(`FATAL: examples 目录不存在: ${EXAMPLES_DIR}`)
  process.exit(1)
}

const items = await scanExamples(EXAMPLES_DIR)
if (items.length === 0) {
  console.error('FATAL: 扫描结果为空——examples/ 内没有合法 .xk，拒绝生成空清单（防误清空）')
  process.exit(1)
}

const content = serializeManifest(items)

// 内容相同不重写：避免每次构建都触碰文件 mtime、弄脏 git 工作区
let existing = null
try {
  existing = await fs.promises.readFile(manifestPath, 'utf-8')
} catch {
  // 首次生成
}
if (existing === content) {
  console.log(`清单已是最新（${items.length} 个示例），未重写: ${manifestPath}`)
} else {
  await fs.promises.writeFile(manifestPath, content, 'utf-8')
  console.log(`清单已生成（${items.length} 个示例）: ${manifestPath}`)
}
