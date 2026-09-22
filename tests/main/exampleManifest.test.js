import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import { join } from 'path'
import {
  serializeManifest,
  parseManifest,
  manifestMatches,
  scanExamples,
  listExamplesFrom,
  MANIFEST_NAME
} from '../../src/main/exampleManifest.mjs'

const item = (over = {}) => ({
  fileName: 'a.xk',
  title: '标题',
  description: '描述',
  nodeCount: 3,
  linkCount: 1,
  categories: ['类目A'],
  ...over
})

describe('serializeManifest / parseManifest', () => {
  it('往返一致：serialize 后 parse 还原出等值 items（按 fileName 码点序存储，与 readdir 序无关——跨平台清单字节稳定）', () => {
    const items = [item({ fileName: 'b.xk' }), item({ fileName: 'a.xk' })]
    expect(parseManifest(serializeManifest(items))).toEqual([items[1], items[0]])
  })

  it('serialize 不改入参顺序（调用方可继续使用原数组）', () => {
    const items = [item({ fileName: 'b.xk' }), item({ fileName: 'a.xk' })]
    serializeManifest(items)
    expect(items.map((i) => i.fileName)).toEqual(['b.xk', 'a.xk'])
  })

  it('序列化为 2 空格缩进（git diff 可读）且带 version 标记', () => {
    const raw = serializeManifest([item()])
    expect(raw).toContain('"version": 1')
    expect(raw).toMatch(/^\s{2}"items"/m)
  })

  it('非法 JSON 返回 null', () => {
    expect(parseManifest('{oops')).toBeNull()
  })

  it('非对象 / 缺 version / items 非数组 / 未知 version 返回 null', () => {
    expect(parseManifest('[]')).toBeNull()
    expect(parseManifest('{"items": []}')).toBeNull()
    expect(parseManifest('{"version": 1, "items": {}}')).toBeNull()
    expect(parseManifest('{"version": 2, "items": []}')).toBeNull()
  })

  it('items 元素形状不对（fileName 非串 / 计数非数 / categories 非串数组）返回 null', () => {
    expect(parseManifest(serializeManifest([item({ fileName: 1 })]))).toBeNull()
    expect(parseManifest(serializeManifest([item({ nodeCount: '3' })]))).toBeNull()
    expect(parseManifest(serializeManifest([item({ linkCount: null })]))).toBeNull()
    expect(parseManifest(serializeManifest([item({ categories: '类目A' })]))).toBeNull()
    expect(parseManifest(serializeManifest([item({ categories: [1] })]))).toBeNull()
  })

  it('title/description 缺失（undefined）时视为不合规返回 null——清单条目必是完整形状', () => {
    const raw = JSON.stringify({ version: 1, items: [item({ title: undefined })] })
    expect(parseManifest(raw)).toBeNull()
  })
})

describe('manifestMatches', () => {
  const a = item({ fileName: 'a.xk' })
  const b = item({ fileName: 'b.xk' })

  it('文件名集合相等即匹配（顺序无关）', () => {
    expect(manifestMatches([b, a], ['b.xk', 'a.xk'])).toBe(true)
  })

  it('目录多一个文件（开发态新增示例）不匹配', () => {
    expect(manifestMatches([a, b], ['a.xk', 'b.xk', 'c.xk'])).toBe(false)
  })

  it('目录少一个文件（示例被删）不匹配', () => {
    expect(manifestMatches([a, b], ['a.xk'])).toBe(false)
  })

  it('清单内 fileName 重复视为不匹配（防手改清单引入重复，走慢路径自愈）', () => {
    expect(manifestMatches([a, a], ['a.xk', 'b.xk'])).toBe(false)
  })
})

/* ---------- scanExamples / listExamplesFrom：真实临时目录 ---------- */

const chart = (over = {}) =>
  JSON.stringify({
    version: 2,
    title: '测试图谱',
    description: '描述',
    nodes: [
      { name: '节点1', category: '类目A' },
      { name: '节点2', category: '类目A' },
      { name: '节点3', category: '类目B' }
    ],
    links: [{ source: '节点1', target: '节点2' }],
    ...over
  })

let root, examples
beforeEach(async () => {
  root = await fs.promises.mkdtemp(join(os.tmpdir(), 'xk-manifest-'))
  examples = join(root, 'examples')
  await fs.promises.mkdir(examples)
})
afterEach(async () => {
  await fs.promises.rm(root, { recursive: true, force: true })
})

describe('scanExamples', () => {
  it('逐文件提取元数据；损坏 / 结构不合规 / 非 .xk 跳过；categories 的 undefined 归一为空串（保证清单序列化往返等值）', async () => {
    await fs.promises.writeFile(join(examples, '正常.xk'), chart())
    await fs.promises.writeFile(
      join(examples, '缺类目.xk'),
      chart({
        nodes: [{ name: 'n1' }, { name: 'n2', category: '类目A' }],
        links: [{ source: 'n1', target: 'n2' }]
      })
    )
    await fs.promises.writeFile(join(examples, '损坏.xk'), '{oops')
    await fs.promises.writeFile(join(examples, '缺版本.xk'), chart({ version: 1 }))
    await fs.promises.writeFile(join(examples, 'readme.txt'), 'not a chart')

    const items = await scanExamples(examples)
    expect(items.map((i) => i.fileName)).toEqual(['正常.xk', '缺类目.xk'])
    expect(items[0]).toEqual({
      fileName: '正常.xk',
      title: '测试图谱',
      description: '描述',
      nodeCount: 3,
      linkCount: 1,
      categories: ['类目A', '类目B']
    })
    expect(items[1].categories).toEqual(['', '类目A']) // undefined → ''
  })

  it('title/description 缺省回退：文件名去扩展名 / 空串', async () => {
    await fs.promises.writeFile(
      join(examples, '裸图.xk'),
      chart({ title: undefined, description: undefined })
    )
    const [it] = await scanExamples(examples)
    expect(it.title).toBe('裸图')
    expect(it.description).toBe('')
  })

  it('目录不存在返回空数组，不抛错', async () => {
    expect(await scanExamples(join(root, 'no-such'))).toEqual([])
  })
})

describe('listExamplesFrom', () => {
  it('无清单走慢路径，并把结果写成可解析的清单（下次回到快路径）', async () => {
    await fs.promises.writeFile(join(examples, 'a.xk'), chart())
    const first = await listExamplesFrom(examples)
    expect(first.map((i) => i.fileName)).toEqual(['a.xk'])

    const raw = await fs.promises.readFile(join(examples, MANIFEST_NAME), 'utf-8')
    expect(parseManifest(raw)).toEqual(first)
  })

  it('清单与目录一致时走快路径信任清单：磁盘文件此后损坏也照单返回（不逐个读 .xk）', async () => {
    await fs.promises.writeFile(join(examples, 'a.xk'), chart())
    await fs.promises.writeFile(join(examples, 'b.xk'), chart())
    await listExamplesFrom(examples) // 建清单
    // 事后把 b.xk 换成垃圾——快路径不读文件，清单仍声明它
    await fs.promises.writeFile(join(examples, 'b.xk'), '{oops')

    const list = await listExamplesFrom(examples)
    expect(list.map((i) => i.fileName)).toEqual(['a.xk', 'b.xk'])
  })

  it('目录新增 .xk（清单过期）走慢路径并重建清单', async () => {
    await fs.promises.writeFile(join(examples, 'a.xk'), chart())
    await listExamplesFrom(examples)
    await fs.promises.writeFile(join(examples, '新.xk'), chart())

    const list = await listExamplesFrom(examples)
    expect(list.map((i) => i.fileName)).toEqual(['a.xk', '新.xk'])
    const raw = await fs.promises.readFile(join(examples, MANIFEST_NAME), 'utf-8')
    expect(parseManifest(raw)).toEqual(list)
  })

  it('清单损坏（非法 JSON）走慢路径并重建', async () => {
    await fs.promises.writeFile(join(examples, 'a.xk'), chart())
    await fs.promises.writeFile(join(examples, MANIFEST_NAME), '{oops')

    const list = await listExamplesFrom(examples)
    expect(list.map((i) => i.fileName)).toEqual(['a.xk'])
    expect(parseManifest(await fs.promises.readFile(join(examples, MANIFEST_NAME), 'utf-8'))).toEqual(
      list
    )
  })

  it('目录不存在返回空数组且不写清单', async () => {
    expect(await listExamplesFrom(join(root, 'no-such'))).toEqual([])
    await expect(
      fs.promises.readFile(join(root, 'no-such', MANIFEST_NAME), 'utf-8')
    ).rejects.toThrow()
  })

  it('空目录首次返回 [] 并写出空清单，二次调用仍返回 []', async () => {
    expect(await listExamplesFrom(examples)).toEqual([])
    const raw = await fs.promises.readFile(join(examples, MANIFEST_NAME), 'utf-8')
    expect(parseManifest(raw)).toEqual([])
    expect(await listExamplesFrom(examples)).toEqual([])
  })

  it('清单重写失败（目录只读，如打包态 asar）静默忽略，不影响返回值', async () => {
    await fs.promises.writeFile(join(examples, 'a.xk'), chart())
    // 无清单 → 慢路径 → 重写清单；用 spy 让 writeFile 失败模拟只读目录
    const orig = fs.promises.writeFile
    fs.promises.writeFile = async () => {
      throw Object.assign(new Error('EROFS'), { code: 'EROFS' })
    }
    try {
      const list = await listExamplesFrom(examples)
      expect(list.map((i) => i.fileName)).toEqual(['a.xk'])
    } finally {
      fs.promises.writeFile = orig
    }
  })
})
