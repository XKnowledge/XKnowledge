import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getAppPath: vi.fn() }
}))

import { app } from 'electron'
import { examplesDir, isExamplePath } from '../../src/main/examplePaths'

beforeEach(() => {
  app.getAppPath.mockReturnValue('C:/mock-app')
})

describe('isExamplePath', () => {
  it('examples 目录内的文件判定为示例路径', () => {
    expect(isExamplePath('C:/mock-app/examples/金融.xk')).toBe(true)
    expect(isExamplePath('C:/mock-app/examples/sub/物理.xk')).toBe(true)
  })

  it('data 目录内的内置示例（如 test.xk）同样受保护', () => {
    expect(isExamplePath('C:/mock-app/data/test.xk')).toBe(true)
    expect(isExamplePath('C:/MOCK-APP/DATA/test.xk')).toBe(true)
  })

  it('目录外与前缀相似（不含路径分隔符的相似名）均不是示例路径', () => {
    expect(isExamplePath('C:/mock-app/examples-backup/a.xk')).toBe(false)
    expect(isExamplePath('C:/mock-app/data-backup/a.xk')).toBe(false)
    expect(isExamplePath('C:/other/examples/a.xk')).toBe(false)
    expect(isExamplePath('C:/other/data/test.xk')).toBe(false)
    expect(isExamplePath('C:/mock-app/金融.xk')).toBe(false)
  })

  it('大小写不影响判定（Windows 文件系统大小写不敏感）', () => {
    expect(isExamplePath('C:/MOCK-APP/Examples/金融.xk')).toBe(true)
  })

  it('非字符串与空串返回 false，不抛错', () => {
    expect(isExamplePath('')).toBe(false)
    expect(isExamplePath(null)).toBe(false)
    expect(isExamplePath(undefined)).toBe(false)
    expect(isExamplePath(123)).toBe(false)
  })

  it('examplesDir 基于 app.getAppPath() 解析', () => {
    expect(examplesDir()).toMatch(/[\\/]examples$/)
  })
})
