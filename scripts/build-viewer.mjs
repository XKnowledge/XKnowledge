// 构建 viewer 单文件 HTML：src/viewer/index.js --vite(IIFE+minify, 内存产物)-->
// 内联进 template.html 的 bundle 占位注释 --> resources/viewer/index.html。
// 产物进 git、prebuild 重生成（examples.manifest 同模式）：electron-builder
// files 已含 resources/**/*，主进程运行时按 getAppPath()/resources/viewer
// 读取（asar 内可读）。内容相同不重写（不触碰 mtime、不弄脏 git 工作区）。
// 用法：npm run build:viewer
import { build } from 'vite'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE_MARK = '<!--XK-VIEWER-BUNDLE-->'
const OUT = path.join(APP_ROOT, 'resources', 'viewer', 'index.html')

const result = await build({
  configFile: false, // 独立构建，不读 electron.vite.config
  logLevel: 'warn',
  build: {
    target: 'es2020',
    minify: true,
    write: false, // 内存产物
    lib: {
      entry: path.join(APP_ROOT, 'src/viewer/index.js'),
      formats: ['iife'],
      name: 'XKViewer'
    },
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
})
// vite 7 的 build() 返回 RollupOutput[]（即便单入口也是数组）
const js = result[0].output
  .filter((c) => c.type === 'chunk')
  .map((c) => c.code)
  .join('\n')
if (!js) {
  console.error('FATAL: viewer bundle 为空')
  process.exit(1)
}

const template = fs.readFileSync(path.join(APP_ROOT, 'src/viewer/template.html'), 'utf-8')
if (!template.includes(BUNDLE_MARK)) {
  console.error('FATAL: 模板缺 bundle 占位注释')
  process.exit(1)
}
// replace 必须函数形式：bundle 代码里的 $&/$1 是 replacement 特殊序列
const html = template.replace(BUNDLE_MARK, () => `<script>${js}</script>`)

let existing = null
try {
  existing = fs.readFileSync(OUT, 'utf-8')
} catch {
  // 首次生成
}
const kb = (html.length / 1024).toFixed(0)
if (existing === html) {
  console.log(`viewer 已是最新（${kb}KB）: ${OUT}`)
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, html, 'utf-8')
  console.log(`viewer 已生成（${kb}KB）: ${OUT}`)
}
