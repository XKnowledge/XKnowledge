import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useChartFile } from '../../src/renderer/src/composables/useChartFile'

vi.mock('ant-design-vue', () => ({
  message: { error: vi.fn(), info: vi.fn(), success: vi.fn() }
}))

/** 特征测试（characterization）：锁定文件生命周期既有行为，动刀前后不得漂移。
 *  覆盖清点结论：persistFile/saveAs 的分支（取消/冲突/示例保护/兜底）与
 *  自动保存门控此前零自动化覆盖、唯一冒烟 smoke-autosave 基线为红——
 *  本文件是 useChartFile 抽取的入场券（见 docs/chartview-split-checklist.md）。
 *  node 环境：window/electronAPI 以 globalThis.window 注入桩；antd message 模块级 mock。 */
const makeSetup = (chartData = { nodes: [], links: [] }) => {
  const chart = ref(chartData)
  const saveNodeVisible = ref(false)
  const router = { push: vi.fn() }
  const resetSider = vi.fn()
  const resetRefData = vi.fn()
  const api = useChartFile({ chartData: chart, saveNodeVisible, router, resetSider, resetRefData })
  return { chartData: chart, saveNodeVisible, router, resetSider, resetRefData, ...api }
}

const mockElectronAPI = (overrides = {}) => {
  // invoke 型方法一律返回 Promise（真实面是 ipcRenderer.invoke）；
  // onRequestClose 返回解绑函数
  const P = (v) => vi.fn().mockResolvedValue(v)
  const handlers = {
    saveFile: P({}),
    saveFileAs: P({}),
    newChartWindow: P({ ok: true }),
    openFile: P({}),
    fileOpened: P({ ok: true }),
    fileDirty: P({ ok: true }),
    enterChartMode: P({ ok: true }),
    exitChartMode: P({ ok: true }),
    closeWindow: P({ ok: true }),
    confirmUnsaved: P('cancel'),
    onRequestClose: vi.fn().mockReturnValue(() => {}),
    ...overrides
  }
  globalThis.window = { electronAPI: handlers }
  return handlers
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  delete globalThis.window
})

describe('useChartFile（文件生命周期）—— persistFile 分支', () => {
  it('chartData 为 null：提示无可保存并返回 false，不落盘', async () => {
    mockElectronAPI()
    const { persistFile } = makeSetup(null)
    await expect(persistFile()).resolves.toBe(false)
  })

  it('用户取消（canceled）：返回 false，脏标记与登记不动', async () => {
    const api = mockElectronAPI({ saveFile: vi.fn().mockResolvedValue({ canceled: true }) })
    const { persistFile, saveNodeVisible } = makeSetup()
    saveNodeVisible.value = true
    await expect(persistFile()).resolves.toBe(false)
    expect(saveNodeVisible.value).toBe(true)
    expect(api.fileOpened).not.toHaveBeenCalled()
  })

  it('保存成功：回写路径、清脏、按新路径登记', async () => {
    const api = mockElectronAPI({ saveFile: vi.fn().mockResolvedValue({ path: 'D:/a.xk' }) })
    const { persistFile, saveNodeVisible, filePath } = makeSetup()
    saveNodeVisible.value = true
    await expect(persistFile()).resolves.toBe(true)
    expect(filePath.value).toBe('D:/a.xk')
    expect(saveNodeVisible.value).toBe(false)
    expect(api.fileOpened).toHaveBeenCalledWith({ path: 'D:/a.xk' })
  })

  it('文件冲突（[FILE_CONFLICT]）：暂停自动保存并保持脏标记', async () => {
    mockElectronAPI({
      saveFile: vi.fn().mockRejectedValue(new Error('[FILE_CONFLICT] xxx'))
    })
    const { persistFile, saveNodeVisible, autoSaveSuspended } = makeSetup()
    saveNodeVisible.value = true
    await expect(persistFile()).resolves.toBe(false)
    expect(autoSaveSuspended.value).toBe(true)
    expect(saveNodeVisible.value).toBe(true)
  })

  it('示例目录保护（[EXAMPLE_PROTECTED]）与兜底分支：报错且保持脏标记', async () => {
    mockElectronAPI({
      saveFile: vi
        .fn()
        .mockRejectedValueOnce(new Error('[EXAMPLE_PROTECTED] x'))
        .mockRejectedValueOnce(new Error('boom'))
    })
    const { persistFile, saveNodeVisible } = makeSetup()
    saveNodeVisible.value = true
    await expect(persistFile()).resolves.toBe(false)
    await expect(persistFile()).resolves.toBe(false)
    expect(saveNodeVisible.value).toBe(true)
  })
})

describe('useChartFile —— saveAs / 登记与门控', () => {
  it('saveFile 成功触发面板重置、persistFile（自动保存共用层）不触发', async () => {
    mockElectronAPI({ saveFile: vi.fn().mockResolvedValue({ path: 'D:/a.xk' }) })
    const { persistFile, saveFile, resetSider, resetRefData } = makeSetup()
    await persistFile()
    expect(resetSider).not.toHaveBeenCalled()
    expect(resetRefData).not.toHaveBeenCalled()
    await saveFile()
    expect(resetSider).toHaveBeenCalledTimes(1)
    expect(resetRefData).toHaveBeenCalledTimes(1)
  })

  it('saveAs 取消：状态不动；成功：换路径、清脏、按新路径登记', async () => {
    const api = mockElectronAPI({
      saveFileAs: vi
        .fn()
        .mockResolvedValueOnce({ canceled: true })
        .mockResolvedValueOnce({ path: 'D:/b.xk' })
    })
    const { saveAs, saveNodeVisible, filePath } = makeSetup()
    saveNodeVisible.value = true
    await saveAs()
    expect(saveNodeVisible.value).toBe(true)
    expect(api.fileOpened).not.toHaveBeenCalled()
    await saveAs()
    expect(filePath.value).toBe('D:/b.xk')
    expect(saveNodeVisible.value).toBe(false)
    expect(api.fileOpened).toHaveBeenCalledWith({ path: 'D:/b.xk' })
  })

  it('registerOpenedFile：登记路径与图库名（非字符串兜底空串）并上报主进程', () => {
    const api = mockElectronAPI()
    const { registerOpenedFile, filePath, chartName } = makeSetup()
    registerOpenedFile('D:/c.xk', '图库名')
    expect(filePath.value).toBe('D:/c.xk')
    expect(chartName.value).toBe('图库名')
    expect(api.fileOpened).toHaveBeenCalledWith({ path: 'D:/c.xk' })
    registerOpenedFile('', undefined)
    expect(chartName.value).toBe('')
  })

  it('自动保存门控：仅「未暂停 + 脏 + 有路径」时每分钟落盘一次', () => {
    vi.useFakeTimers()
    try {
      const api = mockElectronAPI({
        saveFile: vi.fn().mockResolvedValue({ path: 'D:/a.xk' })
      })
      const { saveNodeVisible, filePath, mountFileLifecycle, unmountFileLifecycle } = makeSetup()
      mountFileLifecycle()
      // 无路径不保存
      saveNodeVisible.value = true
      vi.advanceTimersByTime(60000)
      expect(api.saveFile).not.toHaveBeenCalled()
      // 有路径开始保存
      filePath.value = 'D:/a.xk'
      vi.advanceTimersByTime(60000)
      expect(api.saveFile).toHaveBeenCalledTimes(1)
      // 未脏不保存
      saveNodeVisible.value = false
      vi.advanceTimersByTime(60000)
      expect(api.saveFile).toHaveBeenCalledTimes(1)
      unmountFileLifecycle()
      vi.advanceTimersByTime(120000)
      expect(api.saveFile).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('FILE_CONFLICT 暂停期间 60s 到点不写盘（suspended 门控的定时器路径）', async () => {
    vi.useFakeTimers()
    try {
      const api = mockElectronAPI({
        saveFile: vi.fn().mockRejectedValue(new Error('[FILE_CONFLICT] x'))
      })
      const {
        filePath,
        saveNodeVisible,
        persistFile,
        mountFileLifecycle,
        unmountFileLifecycle
      } = makeSetup()
      mountFileLifecycle() // 定时器只在此注册——不 mount 则 advance 无定时器可触发、断言恒真
      filePath.value = 'D:/a.xk'
      saveNodeVisible.value = true
      await persistFile() // 冲突 → autoSaveSuspended = true
      vi.advanceTimersByTime(60_000)
      expect(api.saveFile).toHaveBeenCalledTimes(1) // 仅冲突那次，定时器不重试
      unmountFileLifecycle()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useChartFile —— closeFile 退出确认', () => {
  it('未脏：直接清登记并跳回首页', async () => {
    const api = mockElectronAPI()
    const { closeFile, router } = makeSetup()
    await closeFile()
    expect(api.confirmUnsaved).not.toHaveBeenCalled()
    expect(api.fileOpened).toHaveBeenCalledWith({ path: '' })
    expect(router.push).toHaveBeenCalledWith('/')
  })

  it('已脏 + 取消：留在当前页；放弃：关窗前先清登记再跳回', async () => {
    mockElectronAPI({
      confirmUnsaved: vi.fn().mockResolvedValueOnce('cancel').mockResolvedValueOnce('discard')
    })
    const { closeFile, saveNodeVisible, router } = makeSetup()
    saveNodeVisible.value = true
    await closeFile()
    expect(router.push).not.toHaveBeenCalled()
    await closeFile()
    expect(router.push).toHaveBeenCalledWith('/')
  })

  it('已脏 + 放弃：未保存标记清零（不回首页不带旧脏态）', async () => {
    // 同一窗口「关闭文件回首页 → 再打开/新建」复用同一个 ChartView 实例，
    // saveNodeVisible 是编排层的 ref 而非随路由销毁。放弃修改意味着这份
    // 未保存内容已被用户主动丢弃，标记必须清零：否则下一个文件一进来就
    // 带未保存圆点、没改任何东西关窗也弹三选一、60 秒自动保存空转写盘
    mockElectronAPI({ confirmUnsaved: vi.fn().mockResolvedValue('discard') })
    const { closeFile, saveNodeVisible } = makeSetup()
    saveNodeVisible.value = true
    await closeFile()
    expect(saveNodeVisible.value).toBe(false)
  })

  it('已脏 + 取消：标记保持（留在当前页，未保存内容仍在）', async () => {
    mockElectronAPI({ confirmUnsaved: vi.fn().mockResolvedValue('cancel') })
    const { closeFile, saveNodeVisible } = makeSetup()
    saveNodeVisible.value = true
    await closeFile()
    expect(saveNodeVisible.value).toBe(true)
  })

  it('已脏 + 保存失败：标记保持（saveFile 失败路径不误清）', async () => {
    mockElectronAPI({
      confirmUnsaved: vi.fn().mockResolvedValue('save'),
      saveFile: vi.fn().mockRejectedValue(new Error('disk full'))
    })
    const { closeFile, saveNodeVisible } = makeSetup()
    saveNodeVisible.value = true
    await closeFile()
    expect(saveNodeVisible.value).toBe(true)
  })

  it('registerOpenedFile：装载新图即清零未保存标记', async () => {
    // 装载路径（ChartView.loadChartData → registerOpenedFile）是脏标记的
    // 另一个泄漏点：换图后上一份文档已不在窗口里
    mockElectronAPI()
    const { registerOpenedFile, saveNodeVisible } = makeSetup()
    saveNodeVisible.value = true
    registerOpenedFile('D:/新图.xk', '新图')
    expect(saveNodeVisible.value).toBe(false)
  })
})
