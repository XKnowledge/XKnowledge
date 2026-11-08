import { app, dialog } from 'electron'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChartWindow } from './windowManager'
import { readChartFile } from './fileService'
import { isExamplePath } from './examplePaths'
import { focusOpenedWindow } from './ipc'
import { t } from './i18nMain'

/**
 * 双击 .xk 打开文档的入口（安装器写入的文件关联把路径作为唯一命令行参数
 * 传给 exe：配套登记录见 package.json → build.fileAssociations）。
 *
 * 三条到达路径都收在这一个模块：
 *   1. 冷启动：路径在 process.argv 里，此时还没有任何窗口
 *   2. 已运行：系统拉起第二个进程，路径经主实例的 second-instance 事件送达
 *   3. macOS：Finder 双击经 open-file 事件送达，且可能早于 ready
 * 统一交给 requestOpen 入队/直开，避免三处各写一套状态判断。
 */

// 与 fileService 的打开对话框筛选保持一致（EOL 层不区分大小写：Windows 上
// 资源管理器可能按文件名原样传出 .XK）
const XK_EXT = '.xk'

/** 是否为 .xk 路径（大小写不敏感） */
export const isXkPath = (value) => typeof value === 'string' && value.toLowerCase().endsWith(XK_EXT)

/**
 * 命令行参数归一为绝对路径：
 * - Linux 桌面项用 %U 传入，文件会以 file:// URL 形式出现
 * - 相对路径（开发期 `electron .` 后跟文件名）按当前工作目录补全
 * 解析失败返回 ''，由调用方按「不是文档」跳过。
 */
export const resolveFilePath = (raw) => {
  if (typeof raw !== 'string' || raw === '') return ''
  let p = raw
  if (p.startsWith('file://')) {
    try {
      p = fileURLToPath(p)
    } catch {
      return ''
    }
  }
  try {
    return resolvePath(p)
  } catch {
    return ''
  }
}

/**
 * 从命令行参数里取出 .xk 路径。
 * argv[0] 是可执行文件本身，必须跳过；以 - 开头的参数（Chromium 开关、
 * --no-sandbox 等）一律忽略——它们在有文件参数时也会一起传进来。
 */
export const findXkPath = (argv = []) => {
  for (const raw of argv.slice(1)) {
    if (typeof raw !== 'string' || raw.startsWith('-')) continue
    if (!isXkPath(raw)) continue
    const abs = resolveFilePath(raw)
    if (abs) return abs
  }
  return ''
}

// ready 之前到达的打开请求（macOS open-file 常早于 ready，冷启动时
// second-instance 也不保证在 ready 之后）
const pendingOpens = []

// 正在读盘待开窗的路径：连点两下图标会连发两个 second-instance，
// 落盘登记（file:opened）要等渲染层装载完才生效，中间这段时间靠它去重
const opening = new Set()

/**
 * 打开一个 .xk 文件：已在某窗口打开则聚焦该窗口，否则读盘后开新图表窗口。
 * 返回是否成功打开（聚焦也算成功）——冷启动时调用方据此决定是否补开首页，
 * 避免「文件损坏 → 弹错误框 → 一个窗口都没有」的假死观感。
 * 读盘/校验失败只弹错误框、不抛：这是系统发起的打开，没有调用方能接住异常。
 */
export const openXkPath = async (filePath) => {
  const target = resolveFilePath(filePath)
  if (!isXkPath(target)) return false

  if (focusOpenedWindow(target)) return true
  if (opening.has(target)) return true
  opening.add(target)

  try {
    // 失败时 throw（READ_FAILED / INVALID_JSON / INVALID_STRUCTURE）
    const read = await readChartFile(target)
    // 示例目录内的文件按副本语义打开（与 file:open 对话框同一套规则）：
    // path 置空，保存必然弹「另存为」，内置示例永不被写坏
    createChartWindow({ content: read.content, path: isExamplePath(read.path) ? '' : read.path })
    return true
  } catch (err) {
    await dialog.showMessageBox({
      type: 'error',
      title: t('dialog.openFailed'),
      message: t('dialog.openFailed'),
      detail: `${target}\n\n${err?.message ?? err}`,
      buttons: [t('common.ok')],
      noLink: true
    })
    return false
  } finally {
    opening.delete(target)
  }
}

/**
 * 打开请求入口：ready 前入队、ready 后直开。
 * 返回 true 表示已处理（含入队），false 表示这次请求落空。
 */
export const requestOpen = async (filePath) => {
  if (!filePath) return false
  if (!app.isReady()) {
    pendingOpens.push(filePath)
    return true
  }
  return openXkPath(filePath)
}

/**
 * 排空 ready 前积压的打开请求（whenReady 里调用）。
 * 逐个串行：多个文件同时双击时，先开的窗口先拿到 pending chart，
 * 避免并发读盘把同一次双击拆成两个半成品窗口。
 */
export const drainPendingOpens = async () => {
  const queued = pendingOpens.splice(0)
  for (const filePath of queued) {
    await openXkPath(filePath)
  }
}
