// viewer/styles 单测：单文件自包含样式表的关键结构锚点（深浅色变量、
// 核心选择器——导出物离线可用性靠它）+ injectStyles 的幂等注入
//（重复 boot 不堆 <style>）。node 环境手写 document 桩（仓库零新依赖
// 惯例）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { VIEWER_CSS, injectStyles } from '../../src/viewer/styles.js'

const makeDoc = () => {
  const doc = {
    head: { children: [] },
    createdCount: 0,
    getElementById: (id) => doc.head.children.find((e) => e.id === id) ?? null,
    createElement: () => {
      doc.createdCount++
      return { id: '', textContent: '', parent: null }
    }
  }
  doc.head.appendChild = (child) => {
    child.parent = doc.head
    doc.head.children.push(child)
  }
  return doc
}

let doc
beforeEach(() => {
  doc = makeDoc()
  vi.stubGlobal('document', doc)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VIEWER_CSS（结构锚点）', () => {
  it('含全屏画布与头部/图例/详情面板/水印等核心选择器', () => {
    for (const sel of [
      '#graph3d',
      '.xk-head',
      '.xk-legend',
      '.xk-chip',
      '.xk-panel',
      '.xk-watermark',
      '.xk-search'
    ]) {
      expect(VIEWER_CSS).toContain(sel)
    }
  })

  it('深浅色走 body[data-theme] + CSS 变量（两套 --xk-bg/fg/label 值）', () => {
    expect(VIEWER_CSS).toContain("body[data-theme='dark']")
    expect(VIEWER_CSS).toContain('--xk-bg')
    expect(VIEWER_CSS).toContain('--xk-watermark')
  })

  it('折叠与 off 态的联动选择器（视图卡片收起 / 图例隐藏删除线）', () => {
    expect(VIEWER_CSS).toContain(".xk-ctrl[data-collapsed='1'] .xk-ctrl-body")
    expect(VIEWER_CSS).toContain(".xk-chip[data-off='1']")
    expect(VIEWER_CSS).toContain(".xk-panel[data-open='1']")
  })
})

describe('injectStyles（幂等注入）', () => {
  it('首次：创建 id 为 xk-viewer-style 的 <style>，内容为 VIEWER_CSS，挂 head', () => {
    injectStyles()
    expect(doc.createdCount).toBe(1)
    const style = doc.head.children[0]
    expect(style.id).toBe('xk-viewer-style')
    expect(style.textContent).toBe(VIEWER_CSS)
  })

  it('重复调用：getElementById 命中即返回，不重复注入', () => {
    injectStyles()
    injectStyles()
    injectStyles()
    expect(doc.createdCount).toBe(1)
    expect(doc.head.children.length).toBe(1)
  })
})
