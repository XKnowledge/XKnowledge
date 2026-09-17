import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import { join } from 'path'

// exampleService 依赖 app.getAppPath() 定位 examples 目录；
// fileService 顶部 import { dialog }，mock 中需一并提供
vi.mock('electron', () => ({
  app: { getAppPath: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() }
}))

import { app } from 'electron'
import { listExamples, openExample } from '../../src/main/exampleService'

const mkChart = (extra = {}, overrides = {}) =>
  JSON.stringify({
    version: 2,
    nodes: [
      { name: '节点1', des: '描述', symbolSize: 50, category: '类目A' },
      { name: '节点2', des: '描述', symbolSize: 50, category: '类目A' },
      { name: '节点3', des: '描述', symbolSize: 50, category: '类目B' }
    ],
    links: [{ source: '节点1', target: '节点2', name: '边', des: '边描述' }],
    ...extra,
    ...overrides
  })

let root, examples
beforeEach(async () => {
  root = await fs.promises.mkdtemp(join(os.tmpdir(), 'xk-ex-'))
  examples = join(root, 'examples')
  await fs.promises.mkdir(examples)
  app.getAppPath.mockReturnValue(root)
})
afterEach(async () => {
  await fs.promises.rm(root, { recursive: true, force: true })
})

describe('listExamples', () => {
  it('列出合法示例并提取元数据：title/description 缺省回退文件名与空串', async () => {
    await fs.promises.writeFile(
      join(examples, '带元数据.xk'),
      mkChart({ title: '中国通史', description: '秦—清通史概念网络' })
    )
    await fs.promises.writeFile(join(examples, '无元数据.xk'), mkChart())

    const list = await listExamples()
    expect(list).toHaveLength(2)

    const withMeta = list.find((e) => e.fileName === '带元数据.xk')
    expect(withMeta.title).toBe('中国通史')
    expect(withMeta.description).toBe('秦—清通史概念网络')
    expect(withMeta.nodeCount).toBe(3)
    expect(withMeta.linkCount).toBe(1)
    expect(withMeta.categories).toEqual(['类目A', '类目B']) // 去重且保持首现顺序

    const fallback = list.find((e) => e.fileName === '无元数据.xk')
    expect(fallback.title).toBe('无元数据') // 文件名去扩展名
    expect(fallback.description).toBe('')
  })

  it('非 .xk 文件忽略；损坏（非法 JSON）与结构不合规的 .xk 跳过，不影响其余', async () => {
    await fs.promises.writeFile(join(examples, '正常.xk'), mkChart())
    await fs.promises.writeFile(join(examples, 'readme.txt'), 'not a chart')
    await fs.promises.writeFile(join(examples, '损坏.xk'), '{oops')
    await fs.promises.writeFile(join(examples, '缺版本.xk'), mkChart(null, { version: 1 }))

    const list = await listExamples()
    expect(list.map((e) => e.fileName)).toEqual(['正常.xk'])
  })

  it('目录不存在返回空数组，不抛错', async () => {
    app.getAppPath.mockReturnValue(join(root, 'no-such-app'))
    expect(await listExamples()).toEqual([])
  })

  it('目录为空返回空数组', async () => {
    expect(await listExamples()).toEqual([])
  })
})

describe('openExample', () => {
  it('返回文件原始内容字符串（content 即渲染端要 parse 的 JSON 文本）', async () => {
    const raw = mkChart({ title: '示例' })
    await fs.promises.writeFile(join(examples, '示例.xk'), raw)
    const res = await openExample('示例.xk')
    expect(res).toEqual({ content: raw })
  })

  it('文件名含路径成分（../、斜杠、反斜杠）被拒绝', async () => {
    await expect(openExample('../secret.xk')).rejects.toThrow()
    await expect(openExample('a/b.xk')).rejects.toThrow()
    await expect(openExample('a\\b.xk')).rejects.toThrow()
  })

  it('非 .xk 后缀、空串、非字符串被拒绝', async () => {
    await expect(openExample('evil.exe')).rejects.toThrow()
    await expect(openExample('')).rejects.toThrow()
    await expect(openExample(null)).rejects.toThrow()
  })

  it('文件不存在时抛读取错误（复用 readChartFile 的错误）', async () => {
    await expect(openExample('不存在.xk')).rejects.toThrow()
  })
})
