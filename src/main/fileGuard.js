import fs from 'fs'

/**
 * 文件写入门卫：跟踪"本会话通过对话框/打开操作授权过的文件路径"及其
 * 上次已知 mtime。目的：
 * 1. 写入路径只允许来自本进程 dialog 或 readChartFile 的结果，
 *    防止被攻破的渲染进程伪造任意路径写盘（PATH_NOT_AUTHORIZED）。
 * 2. 多窗口/外部程序修改同一文件后，后写者不再静默覆盖先写者，
 *    而是抛 FILE_CONFLICT 交由上层提示用户。
 *
 * 多窗口共享同一主进程实例，因此单个 guard 实例即可覆盖跨窗口场景。
 * 错误统一为带 code/path 属性的 Error（普通对象跨 IPC 会丢信息）。
 */
export const createPathGuard = () => {
  const authorized = new Map() // 绝对/原始路径 -> 上次已知 mtimeMs（null 表示新文件）

  const fail = (code, message, path) => Object.assign(new Error(message), { code, path })

  return {
    /** 记录授权。mtimeMs 传 null 表示磁盘上尚不存在的新文件。 */
    authorize(path, mtimeMs) {
      authorized.set(path, mtimeMs ?? null)
    },

    /**
     * 写入前校验：路径必须授权过，且磁盘 mtime 与记录一致
     * （文件不存在视为一致）。不满足时 throw Error。
     */
    async assertWritable(path) {
      if (!authorized.has(path)) {
        throw fail('PATH_NOT_AUTHORIZED', '该文件未经过打开或另存为操作，不允许直接写入', path)
      }
      const known = authorized.get(path)
      let current = null
      try {
        current = (await fs.promises.stat(path)).mtimeMs
      } catch {
        // 文件不存在（如另存为新文件），无冲突可言
      }
      if (known !== null && current !== null && known !== current) {
        // message 前缀的 [FILE_CONFLICT] 是稳定 token：invoke 错误边界只
        // 保留 message（code 属性跨 IPC 丢失），渲染端按 token 分支提示
        throw fail(
          'FILE_CONFLICT',
          '[FILE_CONFLICT] 文件已被其他窗口或外部程序修改，为避免覆盖他人的修改，请使用"另存为"',
          path
        )
      }
    }
  }
}
