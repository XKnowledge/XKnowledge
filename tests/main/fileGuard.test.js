import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import { join } from 'path'
import { createPathGuard } from '../../src/main/fileGuard'

const tmpPath = () => join(os.tmpdir(), `xk-guard-${Math.random().toString(36).slice(2)}`)

describe('createPathGuard', () => {
  it('未授权路径 assertWritable 抛 PATH_NOT_AUTHORIZED', async () => {
    const guard = createPathGuard()
    await expect(guard.assertWritable(tmpPath())).rejects.toMatchObject({
      code: 'PATH_NOT_AUTHORIZED'
    })
  })

  it('授权路径且 mtime 未变时放行', async () => {
    const path = tmpPath()
    await fs.promises.writeFile(path, '{}', 'utf-8')
    const { mtimeMs } = await fs.promises.stat(path)
    const guard = createPathGuard()
    guard.authorize(path, mtimeMs)
    await expect(guard.assertWritable(path)).resolves.toBeUndefined()
  })

  it('磁盘 mtime 与记录不一致时抛 FILE_CONFLICT（多窗口丢失更新保护）', async () => {
    const path = tmpPath()
    await fs.promises.writeFile(path, '{}', 'utf-8')
    const guard = createPathGuard()
    guard.authorize(path, 1000)
    // 模拟另一窗口/外部程序已修改该文件：把 mtime 前移 1 小时，保证数值上可区分
    const future = new Date(Date.now() + 3600_000)
    await fs.promises.utimes(path, future, future)
    await expect(guard.assertWritable(path)).rejects.toMatchObject({
      code: 'FILE_CONFLICT'
    })
  })

  it('已授权但磁盘上尚不存在的路径（另存为新文件）放行', async () => {
    const guard = createPathGuard()
    const path = tmpPath()
    guard.authorize(path, null)
    await expect(guard.assertWritable(path)).resolves.toBeUndefined()
  })

  it('错误对象带中文 message 与 path 属性（跨 IPC 不丢关键信息）', async () => {
    const guard = createPathGuard()
    const path = tmpPath()
    guard.authorize(path, 1000)
    const future = new Date(Date.now() + 3600_000)
    await fs.promises.writeFile(path, '{}', 'utf-8')
    await fs.promises.utimes(path, future, future)
    const err = await guard.assertWritable(path).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('[FILE_CONFLICT]') // 渲染端按此 token 分支
    expect(err.message).toContain('已被其他窗口或外部程序修改')
    expect(err.path).toBe(path)
  })
})
