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

import { app, dialog } from 'electron'
import {
  loadWorldIndex,
  buildStitches,
  readWorldGraph,
  setWorldUserDir
} from '../../src/main/worldIndex'

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

  it('userDir 包含 examplesDir：示例不重复收录、source 保持 example、缓存照常命中', async () => {
    await fs.promises.writeFile(join(root, 'examples', '化学.xk'), mkChart(['化学']))
    await fs.promises.writeFile(join(root, 'U.xk'), mkChart(['u'])) // userDir 根下的用户图
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 1, userDir: root }) // examples 的父目录
    )

    const idx = await loadWorldIndex()
    expect(idx.graphs.filter((g) => g.title === '化学')).toHaveLength(1)
    expect(idx.graphs.find((g) => g.title === '化学').source).toBe('example')
    expect(idx.graphs.find((g) => g.title === 'U').source).toBe('user')
    expect(globalThis.__worldCalls).toHaveLength(2) // 每文件只读一次

    await loadWorldIndex()
    expect(globalThis.__worldCalls).toHaveLength(2) // 全缓存命中，无永续失效
  })
})

describe('readWorldGraph', () => {
  beforeEach(async () => {
    await fs.promises.writeFile(join(root, 'examples', '化学.xk'), mkChart(['化学']))
  })

  it('合法 examples 路径透传 readChartFile 返回内容', async () => {
    const { content } = await readWorldGraph(join(root, 'examples', '化学.xk'))
    expect(JSON.parse(content).nodes[0].name).toBe('化学')
  })

  // it.each 用例表在收集期求值，root（beforeEach 里赋值）不可用——
  // 越界路径用收集期即可计算的 tmpdir 级绝对路径（必在 examples/userDir 之外）
  const OUTSIDE = join(os.tmpdir(), 'xk-world-outside-bomb.xk')
  it.each([
    ['相对路径', 'examples/化学.xk'],
    ['非字符串', 42],
    ['空串', ''],
    ['越界绝对路径', OUTSIDE]
  ])('拒绝 %s：中文 message + WORLD_PATH_REJECTED token', async (_label, bad) => {
    await fs.promises.writeFile(OUTSIDE, mkChart(['x']))
    await expect(readWorldGraph(bad)).rejects.toThrow('[WORLD_PATH_REJECTED]')
  })

  it('userDir 内合法路径放行；设置 userDir 后 examples 路径仍合法', async () => {
    const userDir = join(root, 'my-graphs')
    await fs.promises.mkdir(userDir, { recursive: true })
    const inside = join(userDir, 'U.xk')
    await fs.promises.writeFile(inside, mkChart(['u']))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 1, userDir })
    )
    const { content } = await readWorldGraph(inside)
    expect(JSON.parse(content).nodes[0].name).toBe('u')
    // examples 前缀始终合法（与 userDir 设置无关）
    await expect(readWorldGraph(join(root, 'examples', '化学.xk'))).resolves.toBeDefined()
  })
})

describe('setWorldUserDir', () => {
  it("'pick' 对话框取消：ok=false、目录不变", async () => {
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 1, userDir: join(root, 'a') })
    )
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    const res = await setWorldUserDir('pick')
    expect(res.ok).toBe(false)
    expect(res.userDir).toBe(join(root, 'a'))
  })

  it("'pick' 对话框以触发窗口为 parent（模态，防连点开多个目录选择框）", async () => {
    const win = {}
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await setWorldUserDir('pick', win)
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(win, {
      title: '选择图库目录',
      properties: ['openDirectory']
    })
  })

  it("'pick' 选中目录：持久化且下次 loadWorldIndex 扫到新目录", async () => {
    const userDir = join(root, 'picked')
    await fs.promises.mkdir(userDir, { recursive: true })
    await fs.promises.writeFile(join(userDir, 'P.xk'), mkChart(['p']))
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [userDir] })
    const res = await setWorldUserDir('pick')
    expect(res).toEqual({ ok: true, userDir })
    const idx = await loadWorldIndex()
    expect(idx.graphs.some((g) => g.title === 'P')).toBe(true)
    expect(idx.userDir).toBe(userDir)
  })

  it('null 清除：user 源条目随下次重建消失', async () => {
    const userDir = join(root, 'old')
    await fs.promises.mkdir(userDir, { recursive: true })
    await fs.promises.writeFile(join(userDir, 'O.xk'), mkChart(['o']))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 1, userDir })
    )
    await loadWorldIndex() // user 源进缓存
    const res = await setWorldUserDir(null)
    expect(res).toEqual({ ok: true, userDir: null })
    const idx = await loadWorldIndex()
    expect(idx.graphs.some((g) => g.source === 'user')).toBe(false)
  })

  it('非绝对路径字符串：拒绝', async () => {
    await expect(setWorldUserDir('relative/dir')).rejects.toThrow('[WORLD_DIR_REJECTED]')
  })
})
