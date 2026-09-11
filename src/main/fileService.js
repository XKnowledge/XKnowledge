import fs from 'fs'
import { dialog } from 'electron'

const FILE_FILTERS = [{ name: 'XKnowledge', extensions: ['xk'] }]

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
 * 成功返回 { content, path }（content 为文件原始文本）。
 * 读取失败或 JSON 非法时 throw Error 实例（message 为中文提示，
 * code/detail/path 作为附加属性供编程访问）——throw 普通对象会因
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
  try {
    JSON.parse(data)
  } catch (err) {
    throw Object.assign(new Error('文件已损坏或不是有效的 XKnowledge 文件'), {
      code: 'INVALID_JSON',
      detail: filePath,
      path: filePath
    })
  }

  return { content: data, path: filePath }
}

/**
 * 弹出另存对话框并写入文件。
 * 用户取消返回 { canceled: true }；成功返回 { path }。
 */
export const saveChartFileAs = async (window, content, title) => {
  const { filePath } = await dialog.showSaveDialog(window, {
    title,
    properties: ['createDirectory'],
    filters: FILE_FILTERS
  })

  if (!filePath) return { canceled: true }
  await fs.promises.writeFile(filePath, content, 'utf-8')
  return { path: filePath }
}

/**
 * 按给定路径写入文件（保存场景，不弹对话框）。
 */
export const writeChartFile = async (filePath, content) => {
  await fs.promises.writeFile(filePath, content, 'utf-8')
  return { path: filePath }
}
