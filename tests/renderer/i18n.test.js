// 渲染层 i18n 实例：装配双语字典（zh-CN / en-US）、fallback zh-CN、初始
// 语言由「localStorage 偏好 ⊕ 系统语言」派生（node 环境无 localStorage →
// 走 auto 跟随 navigator，断言只锁派生规则的输出、不锁具体机器语言）、
// t 快捷引用与 i18n.global.t 同源且随 locale 切换。字典自身的 key 树
// 一致性由 shared/locales.test 守护，这里只锁实例装配与出口。
import { describe, it, expect } from 'vitest'
import { i18n, t } from '../../src/renderer/src/i18n.js'
import { zhCN } from '../../src/shared/locales/zh-CN.js'
import { enUS } from '../../src/shared/locales/en-US.js'

describe('渲染层 i18n 实例', () => {
  it('装配双语字典（zh-CN / en-US 为同一份 shared 数据源）', () => {
    expect(i18n.global.messages.value['zh-CN']).toBe(zhCN)
    expect(i18n.global.messages.value['en-US']).toBe(enUS)
  })

  it('初始语言派生自系统语言（zh* 前缀 → zh-CN，其余 → en-US）', () => {
    const expected = String(navigator.language || '')
      .toLowerCase()
      .startsWith('zh')
      ? 'zh-CN'
      : 'en-US'
    expect(i18n.global.locale.value).toBe(expected)
  })

  it('fallbackLocale 为 zh-CN（缺 key 运行时回落中文）', () => {
    const fb = i18n.global.fallbackLocale
    expect(String(fb.value ?? fb)).toBe('zh-CN')
  })

  it('t 快捷引用解析当前 locale 的文案（zh → en 切换后同步）', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(t('chart.clipboardEmpty')).toBe(zhCN.chart.clipboardEmpty)
    i18n.global.locale.value = 'en-US'
    expect(t('chart.clipboardEmpty')).toBe(enUS.chart.clipboardEmpty)
  })

  it('命名插值：占位符以参数集合替换（供 message.info 播报计数）', () => {
    i18n.global.locale.value = 'zh-CN'
    const out = t('chart.deletedSummary', { nodes: 2, edges: 1 })
    expect(out).toBe('已删除 2 个节点、1 条连接')
    expect(out).not.toContain('{')
  })
})
