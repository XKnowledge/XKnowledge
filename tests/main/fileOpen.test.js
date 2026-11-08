import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolve as resolvePath } from 'node:path'

vi.mock('electron', () => ({
  app: { isReady: vi.fn(() => true) },
  dialog: { showMessageBox: vi.fn(async () => ({ response: 0 })) }
}))

vi.mock('../../src/main/windowManager', () => ({ createChartWindow: vi.fn() }))
vi.mock('../../src/main/fileService', () => ({ readChartFile: vi.fn() }))
vi.mock('../../src/main/examplePaths', () => ({ isExamplePath: vi.fn(() => false) }))
vi.mock('../../src/main/ipc', () => ({ focusOpenedWindow: vi.fn(() => false) }))
vi.mock('../../src/main/i18nMain', () => ({ t: vi.fn((key) => key) }))

import { app, dialog } from 'electron'
import { createChartWindow } from '../../src/main/windowManager'
import { readChartFile } from '../../src/main/fileService'
import { isExamplePath } from '../../src/main/examplePaths'
import { focusOpenedWindow } from '../../src/main/ipc'
import {
  findXkPath,
  isXkPath,
  resolveFilePath,
  openXkPath,
  requestOpen,
  drainPendingOpens
} from '../../src/main/fileOpen'

const XK = resolvePath('docs/测试图谱.xk')

beforeEach(async () => {
  // 队列是模块级状态：上一用例残留的入队请求会污染下一个用例。
  // 让 focus 恒真 → 排空时不读盘、不开窗，只做清场
  focusOpenedWindow.mockReturnValue(true)
  app.isReady.mockReturnValue(true)
  await drainPendingOpens()
  vi.clearAllMocks()
  focusOpenedWindow.mockReturnValue(false)
  app.isReady.mockReturnValue(true)
})

describe('命令行参数解析', () => {
  it('跳过 argv[0]（可执行文件本身），取出 .xk 路径', () => {
    const argv = ['XKnowledge.exe', 'C:/Users/me/图谱.xk']
    expect(findXkPath(argv)).toBe(resolvePath('C:/Users/me/图谱.xk'))
  })

  it('忽略以 - 开头的 Chromium 开关，取后面的文件', () => {
    const argv = ['XKnowledge.exe', '--no-sandbox', '--allow-file-access', 'C:/a.xk']
    expect(findXkPath(argv)).toBe(resolvePath('C:/a.xk'))
  })

  it('扩展名大小写不敏感（资源管理器按原文件名传出 .XK）', () => {
    expect(findXkPath(['XKnowledge.exe', 'C:/a.XK'])).toBe(resolvePath('C:/a.XK'))
    expect(isXkPath('C:/a.Xk')).toBe(true)
  })

  it('非 .xk 参数（仅启动应用、或别的文件）返回空串', () => {
    expect(findXkPath(['XKnowledge.exe'])).toEqual('')
    expect(findXkPath(['XKnowledge.exe', '.'])).toEqual('')
    expect(findXkPath(['XKnowledge.exe', 'C:/a.txt'])).toEqual('')
    expect(findXkPath([])).toEqual('')
    expect(findXkPath(undefined)).toEqual('')
  })

  it('file:// URL 归一为本地路径（Linux 桌面项以 %U 传参）', () => {
    // Windows 下 file:///x/a.xk 缺盘符、本身非法，按平台给合法样本
    const url = process.platform === 'win32' ? 'file:///C:/x/a.xk' : 'file:///x/a.xk'
    const expected = resolvePath(process.platform === 'win32' ? 'C:/x/a.xk' : '/x/a.xk')
    expect(resolveFilePath(url)).toEqual(expected)
    expect(findXkPath(['XKnowledge.exe', url])).toEqual(expected)
  })

  it('相对路径按当前工作目录补全为绝对路径', () => {
    expect(resolveFilePath('a.xk')).toBe(resolvePath('a.xk'))
    expect(resolveFilePath('')).toEqual('')
    expect(resolveFilePath(null)).toEqual('')
  })

  it('非法 file:// URL 不抛异常，按空串处理（找不到对应文件就是没有文档）', () => {
    expect(resolveFilePath('file://')).toEqual('')
  })
})

describe('openXkPath：装载与开窗', () => {
  it('读盘成功后在图表窗口装载，path 原样带过去（保存可直接写回）', async () => {
    readChartFile.mockResolvedValue({ content: '{"version":2}', path: XK })

    const ok = await openXkPath(XK)

    expect(ok).toBe(true)
    expect(readChartFile).toHaveBeenCalledWith(XK)
    expect(createChartWindow).toHaveBeenCalledWith({ content: '{"version":2}', path: XK })
  })

  it('已在某窗口打开时只聚焦，不重复读盘开窗', async () => {
    focusOpenedWindow.mockReturnValue(true)

    const ok = await openXkPath(XK)

    expect(ok).toBe(true)
    expect(readChartFile).not.toHaveBeenCalled()
    expect(createChartWindow).not.toHaveBeenCalled()
  })

  it('示例目录内的文件按副本打开：path 置空，保存必然弹另存为', async () => {
    readChartFile.mockResolvedValue({ content: '{}', path: 'C:/app/examples/a.xk' })
    isExamplePath.mockReturnValue(true)

    await openXkPath('C:/app/examples/a.xk')

    expect(createChartWindow).toHaveBeenCalledWith({ content: '{}', path: '' })
  })

  it('读盘/校验失败时弹错误框、返回 false，不创建窗口', async () => {
    readChartFile.mockRejectedValue(
      Object.assign(new Error('文件已损坏或不是有效的 XKnowledge 文件'), { code: 'INVALID_JSON' })
    )

    const ok = await openXkPath(XK)

    expect(ok).toBe(false)
    expect(createChartWindow).not.toHaveBeenCalled()
    const arg = dialog.showMessageBox.mock.calls[0][0]
    expect(arg.type).toEqual('error')
    expect(arg.detail).toContain(XK) // 出错的是哪个文件必须可见
    expect(arg.detail).toContain('文件已损坏')
  })

  it('失败不抛出（系统发起的打开没有调用方能接住异常）', async () => {
    readChartFile.mockRejectedValue(new Error('boom'))
    await expect(openXkPath(XK)).resolves.toBe(false)
  })

  it('非 .xk 路径直接忽略，不读盘', async () => {
    expect(await openXkPath('C:/a.txt')).toBe(false)
    expect(readChartFile).not.toHaveBeenCalled()
  })

  it('连点两下（两次并发打开同一文件）只读一次盘、只开一个窗口', async () => {
    let release
    readChartFile.mockImplementation(
      () => new Promise((r) => (release = () => r({ content: '{}', path: XK })))
    )

    const first = openXkPath(XK)
    const second = openXkPath(XK) // 第二次落在 opening 去重窗口内
    release()
    await Promise.all([first, second])

    expect(readChartFile).toHaveBeenCalledTimes(1)
    expect(createChartWindow).toHaveBeenCalledTimes(1)
  })

  it('首次打开失败后不再占着去重标记，可重试', async () => {
    readChartFile.mockRejectedValueOnce(new Error('第一次失败'))
    expect(await openXkPath(XK)).toBe(false)

    readChartFile.mockResolvedValueOnce({ content: '{}', path: XK })
    expect(await openXkPath(XK)).toBe(true)
    expect(createChartWindow).toHaveBeenCalledTimes(1)
  })
})

describe('requestOpen / drainPendingOpens：ready 前后的两条路径', () => {
  it('ready 后立即打开（冷启动 / 已运行双击共用）', async () => {
    readChartFile.mockResolvedValue({ content: '{}', path: XK })

    const handled = await requestOpen(XK)

    expect(handled).toBe(true)
    expect(createChartWindow).toHaveBeenCalledTimes(1)
  })

  it('ready 前入队而不打开（macOS open-file 早于 ready），就绪后排空', async () => {
    app.isReady.mockReturnValue(false)

    expect(await requestOpen(XK)).toBe(true)
    expect(createChartWindow).not.toHaveBeenCalled()

    app.isReady.mockReturnValue(true)
    readChartFile.mockResolvedValue({ content: '{}', path: XK })
    await drainPendingOpens()

    expect(createChartWindow).toHaveBeenCalledTimes(1)
    // 排空后再来一次排空不应重复打开
    await drainPendingOpens()
    expect(createChartWindow).toHaveBeenCalledTimes(1)
  })

  it('多个积压请求按到达顺序串行打开', async () => {
    app.isReady.mockReturnValue(false)
    const order = []
    readChartFile.mockImplementation(async (p) => {
      order.push(p)
      return { content: '{}', path: p }
    })
    await requestOpen(resolvePath('a.xk'))
    await requestOpen(resolvePath('b.xk'))

    app.isReady.mockReturnValue(true)
    await drainPendingOpens()

    expect(order).toEqual([resolvePath('a.xk'), resolvePath('b.xk')])
    expect(createChartWindow).toHaveBeenCalledTimes(2)
  })

  it('空路径视为未处理（second-instance 只带了开关参数）', async () => {
    expect(await requestOpen('')).toBe(false)
    expect(createChartWindow).not.toHaveBeenCalled()
  })
})
