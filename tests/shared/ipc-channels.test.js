// IPC 通道名单结构守护：通道字符串全局唯一（撞名 = 两条业务共享一条消息
// 通道，主进程 handle 与 preload invoke 会串台）+ <域>:<动作> 命名约定 +
// 键名与通道域前缀一致（防复制粘贴出 APP_xxx: 'world:...' 式漂移）。
// 各通道的参数/返回值语义由 ipc.test（主进程注册面）与 preload/index.test
// （渲染层暴露面）逐条覆盖，这里只锁名单的结构性不变量。
import { describe, it, expect } from 'vitest'
import { IPC } from '../../src/shared/ipc-channels.js'

describe('IPC 通道名单（结构守护）', () => {
  const entries = Object.entries(IPC)

  it('名单非空且值全为非空字符串', () => {
    expect(entries.length).toBeGreaterThan(0)
    for (const [key, value] of entries) {
      expect(typeof value, `IPC.${key}`).toBe('string')
      expect(value.length, `IPC.${key}`).toBeGreaterThan(0)
    }
  })

  it('通道值全局唯一（撞名会让两个业务共享同一条消息通道）', () => {
    const values = entries.map(([, value]) => value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('通道值符合 <域>:<动作> 命名约定（小写字母数字与连字符）', () => {
    for (const [key, value] of entries) {
      expect(value, `IPC.${key} = '${value}'`).toMatch(
        /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-z][a-z0-9-]*$/
      )
    }
  })

  it('键名首段与通道域一致（FILE_OPEN → file:…，键值漂移在此拦截）', () => {
    for (const [key, value] of entries) {
      const domain = value.split(':')[0]
      const keyDomain = key.split('_')[0].toLowerCase()
      expect(domain, `IPC.${key} = '${value}'`).toBe(keyDomain)
    }
  })
})
