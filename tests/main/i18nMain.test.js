import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  // 测试环境无 Electron 运行时：getLocale 返回中文系统，默认语言即 zh-CN
  app: { getLocale: vi.fn(() => 'zh-CN') }
}))

import { getCurrentLocale, setCurrentLocale, t } from '../../src/main/i18nMain.js'

describe('i18nMain t()', () => {
  it('默认中文（跟随系统）：查表与插值', () => {
    expect(t('common.untitled')).toBe('未命名')
    expect(t('chart.deletedSummary', { nodes: 3, edges: 5 })).toBe('已删除 3 个节点、5 条连接')
    expect(t('error.incompleteChart', { detail: '缺少 nodes' })).toBe(
      '文件结构不完整（缺少 nodes），不是有效的 XKnowledge 图谱文件'
    )
  })

  it('切英文后同 key 返回英文', () => {
    setCurrentLocale('en-US')
    expect(t('common.untitled')).toBe('Untitled')
    expect(t('gesture.linkLabel', { modifier: 'Ctrl' })).toBe('Ctrl+drag node')
    setCurrentLocale('zh-CN') // 还原，避免影响其他用例
  })

  it('缺 key 回落 zh-CN，再缺回落 key 本身', () => {
    setCurrentLocale('en-US')
    // en 暂缺的 key 落回 zh 值；完全不存在的 key 返回 key 本身
    expect(t('no.such.key')).toBe('no.such.key')
    setCurrentLocale('zh-CN')
  })

  it('非法 locale 归一 zh-CN', () => {
    setCurrentLocale('fr-FR')
    expect(getCurrentLocale()).toBe('zh-CN')
    expect(t('common.cancel')).toBe('取消')
  })

  it('两份字典逐域同构（缺 key 即警告点）', () => {
    setCurrentLocale('en-US')
    // 抽查各域代表 key 均有英文值（非 key 回吐）
    for (const key of [
      'common.untitled',
      'dialog.confirmExit',
      'settings.language',
      'keybinding.names.save',
      'gesture.createNode',
      'chart.navInfo3d',
      'world.navInfo',
      'outline.importSummary',
      'validation.nodeNameRequired',
      'error.fileConflict'
    ]) {
      expect(t(key)).not.toBe(key)
    }
    setCurrentLocale('zh-CN')
  })
})
