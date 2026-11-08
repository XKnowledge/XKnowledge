import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import { join } from 'path'

// vi.mock 工厂被提升到文件顶部，工厂内不能引用下方声明的变量——
// 读盘计数器挂 globalThis（计划预检已裁定此写法）
globalThis.__worldCalls = []

vi.mock('electron', () => ({
  app: { getLocale: vi.fn(() => 'zh-CN'), getAppPath: vi.fn(), getPath: vi.fn() },
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
  setWorldUserDirs
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
  it('双源扫描：examples 平铺 + 用户目录递归；损坏跳过计数；非 .xk 忽略', async () => {
    await fs.promises.writeFile(join(root, 'examples', '化学.xk'), mkChart(['化学', '卢梭']))
    await fs.promises.writeFile(join(root, 'examples', '损坏.xk'), 'BROKEN{')
    await fs.promises.writeFile(join(root, 'examples', 'readme.txt'), 'x')
    const userDir = join(root, 'my-graphs')
    await fs.promises.mkdir(join(userDir, '子目录'), { recursive: true })
    await fs.promises.writeFile(join(userDir, '顶层.xk'), mkChart(['甲']))
    await fs.promises.writeFile(join(userDir, '子目录', '深层.xk'), mkChart(['卢梭', '乙']))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [userDir] })
    )

    const idx = await loadWorldIndex()
    const titles = idx.graphs.map((g) => g.title)
    expect(titles.sort()).toEqual(['化学', '深层', '顶层'])
    expect(idx.brokenCount).toBe(1)
    expect(idx.userDirs).toEqual([userDir])
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

  it('目录缺失：examples 不存在时空源不 throw；用户目录无效同样安全', async () => {
    app.getAppPath.mockReturnValue(join(root, 'no-such-app'))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [join(root, 'no-such-dir')] })
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

  it('用户目录包含 examplesDir：示例不重复收录、source 保持 example、缓存照常命中', async () => {
    await fs.promises.writeFile(join(root, 'examples', '化学.xk'), mkChart(['化学']))
    await fs.promises.writeFile(join(root, 'U.xk'), mkChart(['u'])) // 用户目录根下的用户图
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [root] }) // examples 的父目录
    )

    const idx = await loadWorldIndex()
    expect(idx.graphs.filter((g) => g.title === '化学')).toHaveLength(1)
    expect(idx.graphs.find((g) => g.title === '化学').source).toBe('example')
    expect(idx.graphs.find((g) => g.title === 'U').source).toBe('user')
    expect(globalThis.__worldCalls).toHaveLength(2) // 每文件只读一次

    await loadWorldIndex()
    expect(globalThis.__worldCalls).toHaveLength(2) // 全缓存命中，无永续失效
  })

  it('缓存写盘失败（rename EPERM，Windows 目标被占用场景）：数据照常返回、临时文件被清理（审计 #10）', async () => {
    await fs.promises.writeFile(join(root, 'examples', 'A.xk'), mkChart(['甲']))
    const realRename = fs.promises.rename
    const spy = vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (to === join(userData, 'world-index.json')) {
        throw Object.assign(new Error(`EPERM: ${to}`), { code: 'EPERM' })
      }
      return realRename(from, to)
    })
    try {
      const idx = await loadWorldIndex() // 修复前：缓存写盘 reject 一路穿透
      expect(idx.graphs.map((g) => g.title)).toEqual(['A'])
      expect(idx.brokenCount).toBe(0)
      const leftovers = (await fs.promises.readdir(userData)).filter((f) => f.includes('.tmp-'))
      expect(leftovers).toEqual([]) // 临时文件不残留
    } finally {
      spy.mockRestore()
    }
  })

  it('设置写盘失败（非缓存）：仍向上抛（调用方负责提示），临时文件同样被清理', async () => {
    const realRename = fs.promises.rename
    const spy = vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (to === join(userData, 'world-settings.json')) {
        throw Object.assign(new Error(`EPERM: ${to}`), { code: 'EPERM' })
      }
      return realRename(from, to)
    })
    try {
      await expect(setWorldUserDirs(null)).rejects.toThrow('EPERM')
      const leftovers = (await fs.promises.readdir(userData)).filter((f) => f.includes('.tmp-'))
      expect(leftovers).toEqual([])
    } finally {
      spy.mockRestore()
    }
  })

  it('v1 单目录设置自动迁移：读作一项数组，扫描行为与 v2 一致', async () => {
    const userDir = join(root, 'legacy')
    await fs.promises.mkdir(userDir, { recursive: true })
    await fs.promises.writeFile(join(userDir, 'L.xk'), mkChart(['l']))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 1, userDir })
    )
    const idx = await loadWorldIndex()
    expect(idx.userDirs).toEqual([userDir])
    expect(idx.graphs.some((g) => g.title === 'L')).toBe(true)
  })

  it('多目录聚合：两个用户目录的图合并进同一世界，缝合线跨目录生成', async () => {
    const dirA = join(root, 'lib-a')
    const dirB = join(root, 'lib-b')
    await fs.promises.mkdir(dirA, { recursive: true })
    await fs.promises.mkdir(dirB, { recursive: true })
    await fs.promises.writeFile(join(dirA, '甲.xk'), mkChart(['共享', '独甲']))
    await fs.promises.writeFile(join(dirB, '乙.xk'), mkChart(['共享', '独乙']))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [dirA, dirB] })
    )
    const idx = await loadWorldIndex()
    expect(idx.graphs.map((g) => g.title).sort()).toEqual(['乙', '甲']) // 码位序：乙 < 甲
    const aId = idx.graphs.find((g) => g.title === '甲').id
    const bId = idx.graphs.find((g) => g.title === '乙').id
    expect(idx.stitches).toEqual([{ name: '共享', graphIds: [aId, bId].sort() }])
  })

  it('嵌套用户目录去重：外层与内层同时在列时，同一文件只读一次（缓存条目唯一）', async () => {
    const outer = join(root, 'nest')
    const inner = join(outer, 'inner')
    await fs.promises.mkdir(inner, { recursive: true })
    await fs.promises.writeFile(join(inner, 'N.xk'), mkChart(['n']))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [outer, inner] })
    )
    const idx = await loadWorldIndex()
    expect(idx.graphs.filter((g) => g.title === 'N')).toHaveLength(1)
    expect(globalThis.__worldCalls).toHaveLength(1) // 只读一次
    await loadWorldIndex()
    expect(globalThis.__worldCalls).toHaveLength(1) // 二次全缓存命中
  })

  it('设置文件损坏：视为未配置，examples 源照常扫描', async () => {
    await fs.promises.writeFile(join(root, 'examples', 'A.xk'), mkChart(['甲']))
    await fs.promises.writeFile(join(userData, 'world-settings.json'), '{corrupt')
    const idx = await loadWorldIndex()
    expect(idx.userDirs).toEqual([])
    expect(idx.graphs.map((g) => g.title)).toEqual(['A'])
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

  it('用户目录内合法路径放行；设置用户目录后 examples 路径仍合法', async () => {
    const userDir = join(root, 'my-graphs')
    await fs.promises.mkdir(userDir, { recursive: true })
    const inside = join(userDir, 'U.xk')
    await fs.promises.writeFile(inside, mkChart(['u']))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [userDir] })
    )
    const { content } = await readWorldGraph(inside)
    expect(JSON.parse(content).nodes[0].name).toBe('u')
    // examples 前缀始终合法（与用户目录设置无关）
    await expect(readWorldGraph(join(root, 'examples', '化学.xk'))).resolves.toBeDefined()
  })

  it('多目录白名单：任一在列目录内的路径放行，全部移除后该路径被拒', async () => {
    const dirA = join(root, 'lib-a')
    const dirB = join(root, 'lib-b')
    await fs.promises.mkdir(dirA, { recursive: true })
    await fs.promises.mkdir(dirB, { recursive: true })
    const bFile = join(dirB, 'B.xk')
    await fs.promises.writeFile(bFile, mkChart(['b']))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [dirA, dirB] })
    )
    await expect(readWorldGraph(bFile)).resolves.toBeDefined()
    // 移除 dirB 后白名单收窄，dirB 内路径被拒
    await setWorldUserDirs({ remove: dirB })
    await expect(readWorldGraph(bFile)).rejects.toThrow('[WORLD_PATH_REJECTED]')
  })
})

describe('setWorldUserDirs', () => {
  it("'pick' 对话框取消：ok=false + reason='canceled'、目录列表不变", async () => {
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [join(root, 'a')] })
    )
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    const res = await setWorldUserDirs('pick')
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('canceled')
    expect(res.userDirs).toEqual([join(root, 'a')])
  })

  it("'pick' 对话框以触发窗口为 parent（模态，防连点开多个目录选择框）", async () => {
    const win = {}
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await setWorldUserDirs('pick', win)
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(win, {
      title: '选择图库目录',
      properties: ['openDirectory']
    })
  })

  it("'pick' 选中目录：追加到既有列表（不替换），下次 loadWorldIndex 两目录都扫到", async () => {
    const dirA = join(root, 'lib-a')
    const dirB = join(root, 'picked')
    await fs.promises.mkdir(dirA, { recursive: true })
    await fs.promises.mkdir(dirB, { recursive: true })
    await fs.promises.writeFile(join(dirA, 'A.xk'), mkChart(['a']))
    await fs.promises.writeFile(join(dirB, 'P.xk'), mkChart(['p']))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [dirA] })
    )
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [dirB] })
    const res = await setWorldUserDirs('pick')
    expect(res.ok).toBe(true)
    expect(res.userDirs).toHaveLength(2)
    const idx = await loadWorldIndex()
    expect(idx.graphs.some((g) => g.title === 'A')).toBe(true)
    expect(idx.graphs.some((g) => g.title === 'P')).toBe(true)
  })

  it('重复添加（归一化路径相同，大小写不同）：ok=false + reason=duplicate，列表不变', async () => {
    const userDir = join(root, 'Dup')
    await fs.promises.mkdir(userDir, { recursive: true })
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [userDir] })
    )
    const res = await setWorldUserDirs(userDir)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('duplicate')
    expect(res.userDirs).toEqual([userDir])
  })

  it('{ remove } 移除一项：持久化生效、user 源条目随下次重建消失；移除不存在的目录幂等', async () => {
    const dirA = join(root, 'keep')
    const dirB = join(root, 'old')
    await fs.promises.mkdir(dirA, { recursive: true })
    await fs.promises.mkdir(dirB, { recursive: true })
    await fs.promises.writeFile(join(dirA, 'K.xk'), mkChart(['k']))
    await fs.promises.writeFile(join(dirB, 'O.xk'), mkChart(['o']))
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [dirA, dirB] })
    )
    await loadWorldIndex() // 两目录进缓存

    const res = await setWorldUserDirs({ remove: dirB })
    expect(res.ok).toBe(true)
    expect(res.userDirs).toEqual([dirA])
    const idx = await loadWorldIndex()
    expect(idx.graphs.some((g) => g.title === 'O')).toBe(false)
    expect(idx.graphs.some((g) => g.title === 'K')).toBe(true)

    // 幂等：再移除一次已不存在的目录
    const again = await setWorldUserDirs({ remove: dirB })
    expect(again.ok).toBe(false)
    expect(again.reason).toBe('notfound')
    expect(again.userDirs).toEqual([dirA])
  })

  it('null 清空全部用户目录', async () => {
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: [join(root, 'a'), join(root, 'b')] })
    )
    const res = await setWorldUserDirs(null)
    expect(res).toEqual({ ok: true, userDirs: [] })
    const idx = await loadWorldIndex()
    expect(idx.userDirs).toEqual([])
  })

  it('非绝对路径字符串：拒绝（throw WORLD_DIR_REJECTED）', async () => {
    await expect(setWorldUserDirs('relative/dir')).rejects.toThrow('[WORLD_DIR_REJECTED]')
  })

  it('{ remove: 相对路径 } 同样拒绝', async () => {
    await expect(setWorldUserDirs({ remove: 'relative/dir' })).rejects.toThrow(
      '[WORLD_DIR_REJECTED]'
    )
  })

  it('目录数量上限：达到 16 个后 reason=limit，不再追加', async () => {
    const dirs = []
    for (let i = 0; i < 16; i++) {
      dirs.push(join(root, `d${i}`))
    }
    await fs.promises.writeFile(
      join(userData, 'world-settings.json'),
      JSON.stringify({ version: 2, userDirs: dirs })
    )
    const extra = join(root, 'overflow')
    const res = await setWorldUserDirs(extra)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('limit')
    expect(res.userDirs).toHaveLength(16)
  })
})
