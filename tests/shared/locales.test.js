import { describe, it, expect } from 'vitest'
import { zhCN } from '../../src/shared/locales/zh-CN.js'
import { enUS } from '../../src/shared/locales/en-US.js'

// 两份字典是双端共用唯一数据源（字典头注释：key 结构必须逐域一致），
// 缺 key 运行时才回落 zh-CN + 控制台警告——必须在提交前静态拦截

/** 收集嵌套字典的 key 路径（domain.section.key 点串） */
const keyTreeOf = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return v !== null && typeof v === 'object' ? keyTreeOf(v, path) : [path]
  })

/** 按 key 路径取叶子值 */
const leafAt = (obj, path) => path.split('.').reduce((acc, k) => acc[k], obj)

/** 文案里的插值占位符集合；比集合不比重复次数——同一占位符出现多次是
 *  合法文案（如 en 的 deletedSummary 连用三个 {nodes}），漏掉整个占位符
 *  才是缺陷。vue-i18n 复数块 {n, plural, =1 {..} other {..}} 的内部分支
 *  词不是占位符，先整体剥掉再提取 */
const placeholdersOf = (s) =>
  [
    ...new Set(
      (s.replace(/\{\w+\s*,\s*plural\s*,.*?\}\}/g, '').match(/\{(\w+)(?:,[^}]*)?\}/g) ?? []).map(
        (m) => m.match(/\{(\w+)/)[1]
      )
    )
  ].sort()

describe('双语字典：结构守护（zh-CN / en-US）', () => {
  const zhKeys = keyTreeOf(zhCN)
  const enKeys = keyTreeOf(enUS)

  it('key 树逐域一致（缺 key 只会运行时回落 + 警告，测试红即拦下）', () => {
    expect(
      zhKeys.filter((k) => !enKeys.includes(k)),
      '仅 zh-CN 有的 key'
    ).toEqual([])
    expect(
      enKeys.filter((k) => !zhKeys.includes(k)),
      '仅 en-US 有的 key'
    ).toEqual([])
  })

  it('字典非空且两份规模一致', () => {
    expect(zhKeys.length).toBeGreaterThan(0)
    expect(zhKeys.length).toBe(enKeys.length)
  })

  it('叶子值均为非空字符串（空串会让 t() 渲染空白）', () => {
    const leaves = (obj) =>
      Object.values(obj).flatMap((v) => (v !== null && typeof v === 'object' ? leaves(v) : [v]))
    for (const v of [...leaves(zhCN), ...leaves(enUS)]) {
      expect(typeof v).toBe('string')
      expect(v.trim().length).toBeGreaterThan(0)
    }
  })

  it('同 key 的插值占位符集合一致（一侧漏写 {xxx} 会让另一侧渲染缺参）', () => {
    for (const key of zhKeys) {
      const zh = leafAt(zhCN, key)
      const en = leafAt(enUS, key)
      if (typeof zh === 'string' && typeof en === 'string') {
        expect(`${key}: ${placeholdersOf(zh).join(',')}`).toBe(
          `${key}: ${placeholdersOf(en).join(',')}`
        )
      }
    }
  })
})
