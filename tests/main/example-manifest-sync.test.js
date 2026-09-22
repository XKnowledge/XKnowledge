import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { scanExamples, serializeManifest, MANIFEST_NAME } from '../../src/main/exampleManifest.mjs'

/**
 * 同步守护：仓库 examples/examples.manifest.json 必须与 examples/ 目录
 * 现扫结果逐字节一致。改/增/删示例后忘了重新生成清单时，此测试红——
 * 修复方式：yarn generate:examples 并把清单随示例改动一并提交。
 * （运行时慢路径也会自愈重建，但提交一份同步的清单才能让打包态
 * 走快路径，这是首页秒开的前提。）
 */

// tests/main/ → 仓库根
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const EXAMPLES_DIR = path.join(APP_ROOT, 'examples')

describe('示例清单同步守护', () => {
  it('清单文件与 scanExamples 现扫结果逐字节一致', async () => {
    const manifestPath = path.join(EXAMPLES_DIR, MANIFEST_NAME)

    let actual
    try {
      actual = await fs.promises.readFile(manifestPath, 'utf-8')
    } catch {
      throw new Error(`清单文件不存在或不可读：${manifestPath}——请跑 yarn generate:examples`)
    }

    const expected = serializeManifest(await scanExamples(EXAMPLES_DIR))
    expect(actual).toBe(expected)
  })

  it('图库非空：清单应覆盖全部示例（防目录整体丢失后守护空转）', async () => {
    const items = await scanExamples(EXAMPLES_DIR)
    expect(items.length).toBeGreaterThan(100)
  })
})
