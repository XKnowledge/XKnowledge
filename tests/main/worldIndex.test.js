import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import { join } from 'path'

// vi.mock 工厂被提升到文件顶部，工厂内不能引用下方声明的变量——
// 读盘计数器挂 globalThis（计划预检已裁定此写法）
globalThis.__worldCalls = []

vi.mock('electron', () => ({
  app: { getAppPath: vi.fn(), getPath: vi.fn() },
  dialog: { showOpenDialog: vi.fn() }
}))

// readChartFile 打桩：真实读盘（扫描测试用真文件），但计数调用次数
// 供 mtime 增量断言；损坏文件 throw 模拟 readChartFile 的校验行为
vi.mock('../../src/main/fileService', () => ({
  readChartFile: vi.fn(async (p) => {
    globalThis.__worldCalls.push(p)
    const content = await fs.promises.readFile(p, 'utf-8')
    if (content.startsWith('BROKEN')) {
      throw new Error('文件已损坏或不是有效的 XKnowledge 文件')
    }
    return { content, path: p }
  })
}))

import { app } from 'electron'
import { loadWorldIndex, buildStitches } from '../../src/main/worldIndex'

const mkChart = (names, extra = {}) =>
  JSON.stringify({
    version: 2,
    title: extra.title,
    nodes: names.map((name) => ({ name, des: 'd', symbolSize: 50, category: 'c' })),
    links: []
  })

let root, userData
beforeEach(async () => {
  root = await fs.promises.mkdtemp(join(os.tmpdir(), 'xk-world-'))
  userData = join(root, 'userData')
  await fs.promises.mkdir(join(root, 'examples'), { recursive: true })
  await fs.promises.mkdir(userData, { recursive: true })
  vi.clearAllMocks()
  app.getAppPath.mockReturnValue(root)
  app.getPath.mockReturnValue(userData)
  globalThis.__worldCalls.length = 0
})
afterEach(async () => {
  await fs.promises.rm(root, { recursive: true, force: true })
})

describe('buildStitches', () => {
  it('同名聚合：≥2 图的名字产出，graphIds 升序，按 name 排序', () => {
    const nodes = [
      { graphId: 'b', name: '卢梭' },
      { graphId: 'a', name: '卢梭' },
      { graphId: 'a', name: '独有' },
      { graphId: 'c', name: '水' },
      { graphId: 'b', name: '水' },
      { graphId: 'a', name: '水' }
    ]
    expect(buildStitches(nodes)).toEqual([
      { name: '卢梭', graphIds: ['a', 'b'] },
      { name: '水', graphIds: ['a', 'b', 'c'] }
    ])
  })
})

describe('loadWorldIndex', () => {
  it('双源扫描：examples 平铺 + userDir 递归；损坏跳过计数；非 .xk 忽略', async () => {
    await fs.promises.writeFile(join(root, 'examples', '化学.xk'), mkChart(['化学', '卢梭']))
    await fs.promises.writeFile(join(root, 'examples', '损坏.xk'), 'BROKEN{')
    await fs.promises.writeFile(join(root, 'examples', 'readme.txt'), 'x')
    const userDir = join(root, 'my-graphs')
    await fs.promises.mkdir(join(userDir, '子目录'), { recursive: true })
    await fs.promises.writeFile(join(userDir, '顶层.xk'), mkChart(['甲']))
    await fs.promises.writeFile(join(userDir, '子目录', '深层.xk'), mkChart(['卢梭', '乙']))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 1, userDir })
    )

    const idx = await loadWorldIndex()
    const titles = idx.graphs.map((g) => g.title)
    expect(titles.sort()).toEqual(['化学', '深层', '顶层'])
    expect(idx.brokenCount).toBe(1)
    expect(idx.userDir).toBe(userDir)
    // 递归发现子目录 + 缝合线：卢梭跨 examples 化学 与 user 深层
    const huaXueId = idx.graphs.find((g) => g.title === '化学').id
    const shenCengId = idx.graphs.find((g) => g.title === '深层').id
    expect(idx.stitches).toEqual([{ name: '卢梭', graphIds: [huaXueId, shenCengId].sort() }])
    // nodes 带 graphId/des/category
    expect(idx.nodes.find((n) => n.name === '化学').des).toBe('d')
  })

  it('mtime 增量：二次 load 只重读变更文件；删除文件后重建清理死条目', async () => {
    const a = join(root, 'examples', 'A.xk')
    const b = join(root, 'examples', 'B.xk')
    await fs.promises.writeFile(a, mkChart(['甲']))
    await fs.promises.writeFile(b, mkChart(['乙']))
    await loadWorldIndex()
    expect(globalThis.__worldCalls).toHaveLength(2)

    // 未变更：全缓存命中，零读盘
    await loadWorldIndex()
    expect(globalThis.__worldCalls).toHaveLength(2)

    // B 变更 + A 删除
    await new Promise((r) => setTimeout(r, 10)) // 保证 mtime 变化
    await fs.promises.writeFile(b, mkChart(['乙', '乙2']))
    await fs.promises.unlink(a)
    const idx = await loadWorldIndex()
    expect(globalThis.__worldCalls).toHaveLength(3) // 只重读了 B
    expect(idx.graphs.map((g) => g.title)).toEqual(['B'])
    expect(idx.graphs[0].nodeCount).toBe(2)
  })

  it('目录缺失：examples 不存在时空源不 throw；userDir 无效同样安全', async () => {
    app.getAppPath.mockReturnValue(join(root, 'no-such-app'))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 1, userDir: join(root, 'no-such-dir') })
    )
    const idx = await loadWorldIndex()
    expect(idx.graphs).toEqual([])
    expect(idx.stitches).toEqual([])
    expect(idx.brokenCount).toBe(0)
  })

  it('缓存损坏：备份 .bak 后全量重建', async () => {
    await fs.promises.writeFile(join(root, 'examples', 'A.xk'), mkChart(['甲']))
    await loadWorldIndex()
    await fs.promises.writeFile(join(userData, 'world-index.json'), '{corrupt')
    const idx = await loadWorldIndex()
    expect(idx.graphs.map((g) => g.title)).toEqual(['A'])
    expect(fs.existsSync(join(userData, 'world-index.json.bak'))).toBe(true)
  })
})
