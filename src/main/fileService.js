import fs from 'fs'
import { dialog } from 'electron'
import { createPathGuard } from './fileGuard'
import { isExamplePath } from './examplePaths'

const FILE_FILTERS = [{ name: 'XKnowledge', extensions: ['xk'] }]

const guard = createPathGuard()

// 校验逻辑独立为无 electron 依赖的纯模块（见 chartValidation.mjs 头注释），
// 转发导出保持既有 import 路径不变；本模块内部也直接使用
import { validateChartStructure } from './chartValidation.mjs'
export { validateChartStructure }

/**
 * 原子写入：先写同目录临时文件，再 rename 覆盖目标。
 * 写入中途崩溃/断电/磁盘满时，目标文件要么是旧内容、要么是新内容，
 * 不会留下截断的半个 JSON（60 秒自动保存高频写盘尤其依赖这一点）。
 * 失败时清理临时文件并向上抛出原始错误，由调用方包装。
 */
const writeFileAtomic = async (filePath, content) => {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await fs.promises.writeFile(tmpPath, content, 'utf-8')
    await fs.promises.rename(tmpPath, filePath)
  } catch (err) {
    // Windows 上目标被其他进程占用（同步盘/杀软/编辑器未开共享删除）时
    // rename 抛 EPERM/EBUSY——回退 copyFile 覆盖写，保持与直接 writeFile
    // 相近的可用性（此路径无原子性，但失败时原文件不动，仍优于截断写）
    if (['EPERM', 'EBUSY', 'EACCES'].includes(err?.code)) {
      try {
        await fs.promises.copyFile(tmpPath, filePath)
        await fs.promises.unlink(tmpPath)
        return
      } catch (copyErr) {
        await fs.promises.unlink(tmpPath).catch(() => {})
        throw copyErr
      }
    }
    await fs.promises.unlink(tmpPath).catch(() => {}) // 尽力清理残留
    throw err
  }
}

/** 写入成功后刷新 guard 的 mtime 记录，供下一次冲突检测使用。 */
const recordWritten = async (filePath) => {
  try {
    const { mtimeMs } = await fs.promises.stat(filePath)
    guard.authorize(filePath, mtimeMs)
  } catch {
    guard.authorize(filePath, null)
  }
}

const wrapWriteError = (err, filePath) =>
  Object.assign(new Error('文件写入失败'), {
    code: 'WRITE_FAILED',
    detail: String(err),
    path: filePath
  })

/**
 * 示例目录写保护：examples 内文件是内置资产，任何通道都不允许写。
 * message 带稳定 token [EXAMPLE_PROTECTED]，供渲染端跨 IPC 分支提示
 * （与 [FILE_CONFLICT] 同套路）。
 */
const assertNotExample = (filePath) => {
  if (!isExamplePath(filePath)) return
  throw Object.assign(
    new Error('[EXAMPLE_PROTECTED] 示例文件不允许修改，请保存到其他位置'),
    {
      code: 'EXAMPLE_PROTECTED',
      path: filePath
    }
  )
}

/**
 * 弹出"打开"对话框。返回 electron 原生的 ShowOpenDialogReturnValue
 * （canceled / filePaths），不负责后续读取。
 */
export const showOpenDialog = (window) =>
  dialog.showOpenDialog(window, {
    title: '打开',
    properties: ['openFile'],
    filters: FILE_FILTERS
  })

/**
 * 读取并校验 .xk 文件内容。
 * 成功返回 { content, path }（content 为文件原始文本），并授权该路径
 * 供后续 writeChartFile 使用。
 * 读取失败、JSON 非法或结构不完整时 throw Error 实例（message 为中文
 * 提示，code/detail/path 作为附加属性供编程访问）——throw 普通对象会因
 * IPC 错误边界执行 error.toString() 而丢失全部信息（变 "[object Object]"）。
 * 由调用方决定如何提示用户。
 */
export const readChartFile = async (filePath) => {
  let data
  try {
    data = await fs.promises.readFile(filePath, 'utf-8')
  } catch (err) {
    throw Object.assign(new Error('文件读取失败'), {
      code: 'READ_FAILED',
      detail: String(err),
      path: filePath
    })
  }

  // 在主进程先校验文件内容，损坏的文件不发给渲染进程，避免渲染端崩溃
  let parsed
  try {
    parsed = JSON.parse(data)
  } catch {
    throw Object.assign(new Error('文件已损坏或不是有效的 XKnowledge 文件'), {
      code: 'INVALID_JSON',
      detail: filePath,
      path: filePath
    })
  }

  // 半合法 JSON（语法正确但缺 version/nodes/links 等结构）同样会在
  // 渲染端引发白屏，一并拦截
  const structureError = validateChartStructure(parsed)
  if (structureError) {
    throw Object.assign(
      new Error(`文件结构不完整（${structureError}），不是有效的 XKnowledge 图谱文件`),
      {
        code: 'INVALID_STRUCTURE',
        detail: structureError,
        path: filePath
      }
    )
  }

  try {
    const { mtimeMs } = await fs.promises.stat(filePath)
    guard.authorize(filePath, mtimeMs)
  } catch {
    guard.authorize(filePath, null)
  }

  return { content: data, path: filePath }
}

/**
 * 弹出另存对话框并写入文件（原子写入）。
 * 用户取消返回 { canceled: true }；成功返回 { path }。
 * dialog 选中的路径视为用户显式授权，写后记录 mtime。
 * 选中示例目录内的路径时拒绝写入（示例是内置资产，不允许覆盖）。
 */
export const saveChartFileAs = async (window, content, title) => {
  const { filePath } = await dialog.showSaveDialog(window, {
    title,
    properties: ['createDirectory'],
    filters: FILE_FILTERS
  })

  if (!filePath) return { canceled: true }

  assertNotExample(filePath)
  guard.authorize(filePath, null)
  try {
    await writeFileAtomic(filePath, content)
  } catch (err) {
    throw wrapWriteError(err, filePath)
  }
  await recordWritten(filePath)
  return { path: filePath }
}

/**
 * 按给定路径写入文件（保存/自动保存场景，不弹对话框）。
 * 写前经 guard 校验（路径已授权 + 无 mtime 冲突），写入原子化，
 * 失败包装为 WRITE_FAILED 中文错误。
 * 示例目录内路径无条件拒绝（先于授权检查：无论是否授权都不许写）。
 */
export const writeChartFile = async (filePath, content) => {
  assertNotExample(filePath)
  await guard.assertWritable(filePath) // 未授权 / 冲突时 throw，带 code
  try {
    await writeFileAtomic(filePath, content)
  } catch (err) {
    throw wrapWriteError(err, filePath)
  }
  await recordWritten(filePath)
  return { path: filePath }
}
