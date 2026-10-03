import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  dialog: { showSaveDialog: vi.fn() },
  app: { getLocale: vi.fn(() => 'zh-CN'), getAppPath: vi.fn(), isPackaged: false }
}))

import { dialog, app } from 'electron'
import { composeHtmlViewer, saveHtmlFile, viewerTemplatePath } from '../../src/main/exportHtml'

// 与真模板同构的最小假模板（占位符形态必须一致）
const FAKE_TEMPLATE = `<!doctype html>
<html><head><title>__XK_TITLE__</title></head><body>
<script type="application/json" id="xk-data">"__XK_DATA__"</script>
<!--XK-VIEWER-BUNDLE-->
</body></html>`

const DATA = {
  version: 1,
  title: '我的图谱',
  lang: 'zh-CN',
  categories: [{ name: 'a' }],
  nodes: [{ name: 'n1', des: '', symbolSize: 50, category: 'a' }],
  links: []
}

describe('composeHtmlViewer', () => {
  it('数据占位符替换为 JSON 字面量、title 占位符替换为图名', () => {
    const out = composeHtmlViewer(FAKE_TEMPLATE, DATA)
    expect(out).toContain('"title":"我的图谱"')
    expect(out).toContain('<title>我的图谱</title>')
    expect(out).not.toContain('"__XK_DATA__"')
    expect(out).not.toContain('__XK_TITLE__')
    // 替换后仍是合法 HTML 骨架
    expect(out).toContain('<!doctype html>')
  })

  it('数据里的 "<" 一律转义为 \\u003c：防 </script> 提前闭合注入', () => {
    const evil = {
      ...DATA,
      title: 't',
      nodes: [{ name: '</script><b>x', des: '<!--', symbolSize: 1, category: '' }]
    }
    const out = composeHtmlViewer(FAKE_TEMPLATE, evil)
    expect(out).not.toContain('</script><b>')
    // "<" 全部转义（">" 无闭合能力不必转）——数据里的 </script> 变成无害文本
    expect(out).toContain('\\u003c/script>')
    // JSON 仍可解析回来（\u003c 是合法 JSON 转义）
    const m = out.match(/<script type="application\/json" id="xk-data">([\s\S]*?)<\/script>/)
    expect(JSON.parse(m[1]).nodes[0].name).toBe('</script><b>x')
  })

  it('title 经 HTML 实体转义（图谱名含标签字符）', () => {
    const out = composeHtmlViewer(FAKE_TEMPLATE, { ...DATA, title: '<script>alert(1)</script>' })
    expect(out).toContain('<title>&lt;script&gt;alert(1)&lt;/script&gt;</title>')
  })

  it('坏数据（null/缺 nodes）与缺占位符模板都抛错', () => {
    expect(() => composeHtmlViewer(FAKE_TEMPLATE, null)).toThrow()
    expect(() => composeHtmlViewer(FAKE_TEMPLATE, { title: 'x' })).toThrow()
    expect(() => composeHtmlViewer('<html></html>', DATA)).toThrow()
  })
})

describe('saveHtmlFile', () => {
  let dir
  beforeEach(async () => {
    dir = await fs.promises.mkdtemp(join(os.tmpdir(), 'xk-html-'))
    dialog.showSaveDialog.mockReset()
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await fs.promises.rm(dir, { recursive: true, force: true })
  })
  const readTemplate = async () => FAKE_TEMPLATE

  it('用户取消返回 { canceled: true } 不写盘', async () => {
    dialog.showSaveDialog.mockResolvedValue({ filePath: '' })
    const res = await saveHtmlFile(undefined, { data: DATA, defaultName: 'a.html' }, { readTemplate })
    expect(res).toEqual({ canceled: true })
    expect(dialog.showSaveDialog).toHaveBeenCalledTimes(1)
  })

  it('选中路径写入拼装产物（含 JSON 数据）', async () => {
    const target = join(dir, 'out.html')
    dialog.showSaveDialog.mockResolvedValue({ filePath: target })
    const res = await saveHtmlFile(undefined, { data: DATA, defaultName: 'a.html' }, { readTemplate })
    expect(res).toEqual({ path: target })
    const written = fs.readFileSync(target, 'utf-8')
    expect(written).toContain('"title":"我的图谱"')
  })

  it('XK_SMOKE_HTML_DIR 后门：跳过保存框直写该目录（冒烟专用）', async () => {
    vi.stubEnv('XK_SMOKE_HTML_DIR', dir)
    dialog.showSaveDialog.mockRejectedValue(new Error('不应弹框'))
    const res = await saveHtmlFile(undefined, { data: DATA, defaultName: 'b.html' }, { readTemplate })
    expect(res.path).toBe(join(dir, 'b.html'))
    expect(fs.statSync(res.path).size).toBeGreaterThan(0)
  })

  it('模板读取失败抛带语义错误（产物资源缺失时渲染端可提示）', async () => {
    const bad = async () => {
      throw new Error('ENOENT')
    }
    await expect(
      saveHtmlFile(undefined, { data: DATA, defaultName: 'a.html' }, { readTemplate: bad })
    ).rejects.toThrow('viewer_template_missing')
  })
})

describe('viewerTemplatePath', () => {
  it('dev 与打包态都在 getAppPath()/resources/viewer 下（asar 内可读）', () => {
    app.getAppPath.mockReturnValue('C:/app-root')
    app.isPackaged = false
    expect(viewerTemplatePath()).toBe(join('C:/app-root', 'resources', 'viewer', 'index.html'))
    app.isPackaged = true
    expect(viewerTemplatePath()).toBe(join('C:/app-root', 'resources', 'viewer', 'index.html'))
  })
})
