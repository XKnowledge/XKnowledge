import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() }
}))

import { dialog } from 'electron'
import {
  validateChartStructure,
  readChartFile,
  writeChartFile,
  saveChartFileAs
} from '../../src/main/fileService'

const VALID_CHART = JSON.stringify({
  series: [
    {
      type: 'graph',
      data: [{ name: '节点1', category: '类目1' }],
      links: [],
      force: { repulsion: 200 },
      edgeLabel: { show: true }
    }
  ],
  legend: [{ data: ['类目1'] }]
})

let dir
beforeEach(async () => {
  dir = await fs.promises.mkdtemp(join(os.tmpdir(), 'xk-fs-'))
})
afterEach(async () => {
  await fs.promises.rm(dir, { recursive: true, force: true })
})

describe('validateChartStructure', () => {
  const parse = (s) => JSON.parse(s)

  it('结构完整的图表数据通过（返回 null）', () => {
    expect(validateChartStructure(parse(VALID_CHART))).toBeNull()
  })

  it('顶层不是对象被拒绝', () => {
    expect(validateChartStructure([1, 2])).toMatch(/不是 JSON 对象/)
    expect(validateChartStructure('str')).toMatch(/不是 JSON 对象/)
    expect(validateChartStructure(null)).toMatch(/不是 JSON 对象/)
  })

  it('缺少 series / series 为空数组被拒绝', () => {
    expect(validateChartStructure(parse('{"legend":[{}]}'))).toMatch(/series/)
    expect(validateChartStructure(parse('{"series":[]}'))).toMatch(/series/)
  })

  it('缺少 series[0].data 或 data 含无效项被拒绝', () => {
    const noData = JSON.parse(VALID_CHART)
    delete noData.series[0].data
    expect(validateChartStructure(noData)).toMatch(/data/)
    const nullNode = JSON.parse(VALID_CHART)
    nullNode.series[0].data.push(null)
    expect(validateChartStructure(nullNode)).toMatch(/节点/)
  })

  it('缺少 series[0].force（渲染端 initAttr 必炸点）被拒绝', () => {
    const chart = JSON.parse(VALID_CHART)
    delete chart.series[0].force
    expect(validateChartStructure(chart)).toMatch(/force/)
  })

  it('缺少 series[0].edgeLabel（渲染端 initAttr/initChartData 必炸点）被拒绝', () => {
    const chart = JSON.parse(VALID_CHART)
    delete chart.series[0].edgeLabel
    expect(validateChartStructure(chart)).toMatch(/edgeLabel/)
  })

  it('缺少 legend（渲染端 watch 必炸点）被拒绝', () => {
    const chart = JSON.parse(VALID_CHART)
    delete chart.legend
    expect(validateChartStructure(chart)).toMatch(/legend/)
    const emptyLegend = JSON.parse(VALID_CHART)
    emptyLegend.legend = []
    expect(validateChartStructure(emptyLegend)).toMatch(/legend/)
  })
})

describe('readChartFile', () => {
  it('合法文件返回 { content, path }，content 为原始文本', async () => {
    const path = join(dir, 'a.xk')
    await fs.promises.writeFile(path, VALID_CHART, 'utf-8')
    const res = await readChartFile(path)
    expect(res.path).toBe(path)
    expect(res.content).toBe(VALID_CHART)
  })

  it('JSON 非法抛 INVALID_JSON（中文 message）', async () => {
    const path = join(dir, 'bad.xk')
    await fs.promises.writeFile(path, '{oops', 'utf-8')
    await expect(readChartFile(path)).rejects.toMatchObject({
      code: 'INVALID_JSON'
    })
  })

  it('JSON 合法但结构缺失抛 INVALID_STRUCTURE，不发给渲染进程', async () => {
    const path = join(dir, 'half.xk')
    await fs.promises.writeFile(path, '{"series":[{"data":[]}]}', 'utf-8')
    await expect(readChartFile(path)).rejects.toMatchObject({
      code: 'INVALID_STRUCTURE'
    })
  })

  it('文件不存在抛 READ_FAILED', async () => {
    await expect(readChartFile(join(dir, 'none.xk'))).rejects.toMatchObject({
      code: 'READ_FAILED'
    })
  })
})

describe('writeChartFile（原子写入 + 授权 + 冲突检测）', () => {
  it('未经打开/另存授权的路径抛 PATH_NOT_AUTHORIZED，不落盘', async () => {
    const path = join(dir, 'evil.xk')
    await expect(writeChartFile(path, VALID_CHART)).rejects.toMatchObject({
      code: 'PATH_NOT_AUTHORIZED'
    })
    expect(fs.existsSync(path)).toBe(false)
  })

  it('readChartFile 授权后可写入，且写入不留 .tmp 残留', async () => {
    const path = join(dir, 'a.xk')
    await fs.promises.writeFile(path, VALID_CHART, 'utf-8')
    await readChartFile(path)
    const content = VALID_CHART.replace('节点1', '节点2')
    await writeChartFile(path, content)
    expect(await fs.promises.readFile(path, 'utf-8')).toBe(content)
    const leftovers = (await fs.promises.readdir(dir)).filter((f) => f.includes('.tmp-'))
    expect(leftovers).toEqual([])
  })

  it('同一授权路径可连续写入（写后自动刷新 mtime 记录）', async () => {
    const path = join(dir, 'a.xk')
    await fs.promises.writeFile(path, VALID_CHART, 'utf-8')
    await readChartFile(path)
    await writeChartFile(path, VALID_CHART)
    await writeChartFile(path, VALID_CHART) // 第二次不应误报冲突
  })

  it('外部修改过 mtime 后再写抛 FILE_CONFLICT，原内容不被破坏', async () => {
    const path = join(dir, 'a.xk')
    await fs.promises.writeFile(path, VALID_CHART, 'utf-8')
    await readChartFile(path)
    const future = new Date(Date.now() + 3600_000)
    await fs.promises.utimes(path, future, future)
    await expect(writeChartFile(path, '{}')).rejects.toMatchObject({
      code: 'FILE_CONFLICT'
    })
    expect(await fs.promises.readFile(path, 'utf-8')).toBe(VALID_CHART)
  })

  it('写入失败（如目标目录只读盘满模拟）时原文件内容不被截断', async () => {
    const path = join(dir, 'a.xk')
    await fs.promises.writeFile(path, VALID_CHART, 'utf-8')
    await readChartFile(path)
    // undefined content 使底层 writeFile 在写出任何内容前失败
    await expect(writeChartFile(path, undefined)).rejects.toBeTruthy()
    expect(await fs.promises.readFile(path, 'utf-8')).toBe(VALID_CHART)
  })

  it('rename 被占用（EPERM，如同步盘/杀软锁定）时回退 copyFile，内容仍正确写入且无 .tmp 残留', async () => {
    const path = join(dir, 'a.xk')
    await fs.promises.writeFile(path, VALID_CHART, 'utf-8')
    await readChartFile(path)
    const renameSpy = vi
      .spyOn(fs.promises, 'rename')
      .mockRejectedValue(Object.assign(new Error('EPERM: file busy'), { code: 'EPERM' }))
    try {
      const content = VALID_CHART.replace('节点1', '节点2')
      await writeChartFile(path, content)
      expect(await fs.promises.readFile(path, 'utf-8')).toBe(content)
      const leftovers = (await fs.promises.readdir(dir)).filter((f) => f.includes('.tmp-'))
      expect(leftovers).toEqual([])
    } finally {
      renameSpy.mockRestore()
    }
  })

  it('冲突错误 message 含稳定 token [FILE_CONFLICT]，供渲染端跨 IPC 分支', async () => {
    const path = join(dir, 'a.xk')
    await fs.promises.writeFile(path, VALID_CHART, 'utf-8')
    await readChartFile(path)
    const future = new Date(Date.now() + 3600_000)
    await fs.promises.utimes(path, future, future)
    const err = await writeChartFile(path, '{}').catch((e) => e)
    expect(err.message).toContain('[FILE_CONFLICT]')
    expect(err.message).toContain('已被其他窗口或外部程序修改')
  })
})

describe('saveChartFileAs', () => {
  it('用户取消返回 { canceled: true }，不写盘', async () => {
    dialog.showSaveDialog.mockResolvedValue({ filePath: undefined })
    const res = await saveChartFileAs(null, VALID_CHART, 'title')
    expect(res).toEqual({ canceled: true })
  })

  it('确认路径后原子写入并返回 { path }，该路径随后可直接 writeChartFile', async () => {
    const path = join(dir, 'saved.xk')
    dialog.showSaveDialog.mockResolvedValue({ filePath: path })
    const res = await saveChartFileAs(null, VALID_CHART, 'title')
    expect(res).toEqual({ path })
    expect(await fs.promises.readFile(path, 'utf-8')).toBe(VALID_CHART)
    // 另存授权闭环：后续自动保存不再需要对话框
    const content = VALID_CHART.replace('节点1', '节点2')
    await writeChartFile(path, content)
    expect(await fs.promises.readFile(path, 'utf-8')).toBe(content)
  })

  it('写入抛错时包装为 WRITE_FAILED（中文 message + path 属性）', async () => {
    const path = join(dir, 'fail.xk')
    dialog.showSaveDialog.mockResolvedValue({ filePath: path })
    const err = await saveChartFileAs(null, undefined, 'title').catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('WRITE_FAILED')
    expect(err.path).toBe(path)
  })
})
