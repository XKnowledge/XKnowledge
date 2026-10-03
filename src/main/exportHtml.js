/**
 * 交互式 HTML 导出落盘（一次性导出产物，与 saveVideoFile 同模式：
 * 不进 chart 的 guard/mtime 体系）。viewer 单文件 HTML 由构建期产物
 * resources/viewer/index.html（模板 + 内联 IIFE bundle）承担，这里只做
 * 两件事：读模板、替换数据占位符后弹保存框写盘。
 * XK_SMOKE_HTML_DIR 注入时跳过系统保存框（模态框在无人值守环境会挂死
 * 冒烟），直接写该目录——冒烟专用后门，正常运行无此变量不生效。
 */
import fs from 'fs'
import { join } from 'path'
import { app, dialog } from 'electron'
import { t } from './i18nMain'

/** 模板占位符（与 src/viewer/template.html 约定一致；compose 后不得残留） */
const DATA_PLACEHOLDER = '"__XK_DATA__"'
const TITLE_PLACEHOLDER = '__XK_TITLE__'

/** HTML 实体转义：title 进 <title> 标签，图谱名是用户数据必须转义 */
export const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/**
 * 拼装导出 HTML：数据以 JSON 字面量注入 <script type="application/json">。
 * JSON 序列化后把 "<" 全部转义为 <（合法 JSON 转义、解析后原样还原），
 * 数据里的 </script> 无法提前闭合标签——比只替换 </script> 更彻底
 * （连 <!-- 之类的解析歧义一并消除）。replace 一律函数形式：replacement
 * 字符串里的 $&/$1 是特殊序列，数据值里出现会被错误展开。
 * 坏数据（非对象/缺 nodes）与缺占位符模板抛错，调用方经 invoke 变 reject。
 */
export const composeHtmlViewer = (template, data) => {
  if (typeof template !== 'string' || !template.includes(DATA_PLACEHOLDER)) {
    throw new Error('viewer_template_missing')
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.nodes)) {
    throw new Error('viewer_data_invalid')
  }
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return template
    .replace(DATA_PLACEHOLDER, () => json)
    .replace(TITLE_PLACEHOLDER, () => escapeHtml(data.title ?? ''))
}

/** viewer 单文件模板路径：dev 与打包态统一相对 getAppPath()（asar 内可读） */
export const viewerTemplatePath = () => join(app.getAppPath(), 'resources', 'viewer', 'index.html')

/**
 * 保存导出 HTML：读模板 → compose → 弹保存框写盘（文本 utf-8）。
 * 用户取消返回 { canceled: true }；成功返回 { path }。
 * deps.readTemplate 可注入（单测用，默认读 viewerTemplatePath）。
 */
export const saveHtmlFile = async (window, { data, defaultName }, deps = {}) => {
  const readTemplate =
    deps.readTemplate ?? (async () => fs.promises.readFile(viewerTemplatePath(), 'utf-8'))
  let template
  try {
    template = await readTemplate()
  } catch {
    throw new Error('viewer_template_missing')
  }
  const html = composeHtmlViewer(template, data)
  const smokeDir = process.env.XK_SMOKE_HTML_DIR
  if (smokeDir) {
    const filePath = join(smokeDir, defaultName)
    await fs.promises.writeFile(filePath, html, 'utf-8')
    return { path: filePath }
  }
  const { filePath } = await dialog.showSaveDialog(window, {
    title: t('dialog.htmlSaveAs'),
    defaultPath: defaultName,
    properties: ['createDirectory'],
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (!filePath) return { canceled: true }
  await fs.promises.writeFile(filePath, html, 'utf-8')
  return { path: filePath }
}
