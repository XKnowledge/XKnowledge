import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTour, TOUR_DONE_KEY } from '../../src/renderer/src/composables/useTour'

// node 测试环境无 localStorage：注入内存实现（源码读写均 try-catch 包裹，
// keybindingStore 同款惯例；这里给真实读写行为供断言）
const store = new Map()
vi.stubGlobal('localStorage', {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v))
})

describe('useTour：新手教程状态机', () => {
  beforeEach(() => store.clear())

  it('未看过：maybeAutoStart 开启教程', () => {
    const { open, maybeAutoStart } = useTour()
    expect(open.value).toBe(false)
    maybeAutoStart()
    expect(open.value).toBe(true)
  })

  it('已看过（标记存在）：maybeAutoStart 不开启', () => {
    store.set(TOUR_DONE_KEY, '1')
    const { open, maybeAutoStart } = useTour()
    maybeAutoStart()
    expect(open.value).toBe(false)
  })

  it('stop 关闭并写标记；此后 maybeAutoStart 不再自动开', () => {
    const { open, start, stop, maybeAutoStart } = useTour()
    start()
    stop()
    expect(open.value).toBe(false)
    expect(store.get(TOUR_DONE_KEY)).toBe('1')
    maybeAutoStart()
    expect(open.value).toBe(false)
  })

  it('手动 start 不受已看过标记影响（菜单重开场景）', () => {
    store.set(TOUR_DONE_KEY, '1')
    const { open, start } = useTour()
    start()
    expect(open.value).toBe(true)
  })

  it('onBeforeStart 回调在每次开启前执行（编排层把侧栏回标准态）', () => {
    const before = vi.fn()
    const { start } = useTour(before)
    start()
    expect(before).toHaveBeenCalledTimes(1)
  })

  it('localStorage 抛异常：读取视为已看过（不自动弹）、stop 写入不炸', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      }
    })
    const { open, maybeAutoStart, start, stop } = useTour()
    maybeAutoStart()
    expect(open.value).toBe(false) // 存储缺失不打扰：宁可不放教程
    start()
    stop() // 写入失败被吞，内存态照常关闭
    expect(open.value).toBe(false)
    // 还原内存实现供后续用例
    vi.stubGlobal('localStorage', {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v))
    })
  })
})
