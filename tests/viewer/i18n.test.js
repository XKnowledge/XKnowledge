// viewer 语言选择：导出时应用语言（data.lang）优先——导出者所见即接收方
// 所得；data.lang 缺失/被手工改坏时才按接收方浏览器语言自适应。
import { describe, expect, it } from 'vitest'
import { pickViewerLang } from '../../src/viewer/i18n.js'

describe('pickViewerLang 导出语言优先', () => {
  it('data.lang 为 zh 开头时显示中文（接收方浏览器语言不覆盖）', () => {
    expect(pickViewerLang('zh-CN', 'en-US')).toBe('zh')
    expect(pickViewerLang('zh', 'en')).toBe('zh')
  })

  it('data.lang 为 en 时显示英文（接收方浏览器语言不覆盖）', () => {
    expect(pickViewerLang('en-US', 'zh-CN')).toBe('en')
    // 非字符串归浏览器回退分支；这里 en-US 必须胜出
    expect(pickViewerLang('en-US', undefined)).toBe('en')
  })

  it('data.lang 大小写不敏感', () => {
    expect(pickViewerLang('ZH-CN', 'en-US')).toBe('zh')
    expect(pickViewerLang('EN-us', 'zh-CN')).toBe('en')
  })

  it('data.lang 缺失/空串时回退接收方浏览器语言', () => {
    expect(pickViewerLang('', 'zh-CN')).toBe('zh')
    expect(pickViewerLang(null, 'zh-TW')).toBe('zh')
    expect(pickViewerLang(undefined, 'en-GB')).toBe('en')
  })

  it('两边都不可判时默认英文', () => {
    expect(pickViewerLang('', '')).toBe('en')
    expect(pickViewerLang(null, undefined)).toBe('en')
  })
})
