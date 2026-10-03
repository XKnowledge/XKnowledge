// src/viewer/styles.js
// viewer 全部样式（单文件自包含，构建后内联 <style>）。深浅色走 body
// data-theme + CSS 变量，色值与 SCENE_COLORS 语义对齐（bg/label/watermark）。
export const VIEWER_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body {
  font: 13px/1.5 system-ui, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  --xk-bg: #ffffff; --xk-fg: #333333; --xk-label: #333333;
  --xk-watermark: #000000; --xk-panel: rgba(255,255,255,.92); --xk-border: #d9d9d9;
  --xk-chip-off: #c4c9cc;
  background: var(--xk-bg); color: var(--xk-fg);
}
body[data-theme='dark'] {
  --xk-bg: #141414; --xk-fg: #e0e0e0; --xk-label: #e0e0e0;
  --xk-watermark: #ffffff; --xk-panel: rgba(20,20,20,.92); --xk-border: #4a4f53;
  --xk-chip-off: #4a4f53;
}
#graph3d { position: absolute; inset: 0; }
.xk-head {
  position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center;
  gap: 12px; padding: 10px 14px; pointer-events: none; z-index: 10;
}
.xk-head > * { pointer-events: auto; }
.xk-title { font-size: 16px; font-weight: 600; max-width: 40vw;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xk-count { opacity: .65; white-space: nowrap; }
.xk-search { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.xk-search input {
  width: 200px; padding: 4px 10px; border: 1px solid var(--xk-border);
  border-radius: 4px; background: var(--xk-panel); color: var(--xk-fg); outline: none;
}
.xk-search input:focus { border-color: var(--xk-fg); }
.xk-search-count { opacity: .65; white-space: nowrap; }
.xk-btn {
  padding: 4px 12px; border: 1px solid var(--xk-border); border-radius: 4px;
  background: var(--xk-panel); color: var(--xk-fg); cursor: pointer; font: inherit;
}
.xk-btn:hover { border-color: var(--xk-fg); }
.xk-legend {
  position: absolute; left: 14px; bottom: 52px; display: flex; flex-wrap: wrap;
  gap: 6px; max-width: 46vw; max-height: 30vh; overflow: auto; z-index: 10;
}
.xk-chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px;
  border: 1px solid var(--xk-border); border-radius: 10px; cursor: pointer;
  background: var(--xk-panel); color: var(--xk-fg); white-space: nowrap;
}
.xk-chip .dot { width: 10px; height: 10px; border-radius: 50%; }
.xk-chip[data-off='1'] { opacity: .45; }
.xk-chip[data-off='1'] .dot { background: var(--xk-chip-off) !important; }
.xk-tools {
  position: absolute; left: 0; right: 0; bottom: 0; display: flex;
  align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px;
  padding: 8px 12px; z-index: 10;
}
.xk-tools label { display: inline-flex; align-items: center; gap: 4px;
  cursor: pointer; user-select: none; }
.xk-tools select {
  padding: 2px 6px; border: 1px solid var(--xk-border); border-radius: 4px;
  background: var(--xk-panel); color: var(--xk-fg); font: inherit;
}
.xk-watermark {
  position: absolute; left: 0; right: 0; bottom: 5%; text-align: center;
  font-weight: bold; font-size: max(18px, 2.2vh); color: var(--xk-watermark);
  opacity: .8; pointer-events: none; z-index: 5;
}
.xk-panel {
  position: absolute; top: 52px; right: 14px; width: 280px; max-height: 60vh;
  overflow: auto; padding: 14px; border: 1px solid var(--xk-border);
  border-radius: 8px; background: var(--xk-panel); z-index: 10; display: none;
}
.xk-panel[data-open='1'] { display: block; }
.xk-panel h3 { font-size: 15px; margin-bottom: 8px; }
.xk-panel .cat { font-size: 12px; opacity: .7; margin-bottom: 8px; }
.xk-panel .des { font-size: 13px; white-space: pre-wrap; word-break: break-word; }
.xk-panel .deg { font-size: 12px; opacity: .7; margin-top: 8px; }
.graph-tooltip { font: 12px/1.4 system-ui, sans-serif !important; }
`

/** 注入样式（幂等） */
export const injectStyles = () => {
  if (document.getElementById('xk-viewer-style')) return
  const style = document.createElement('style')
  style.id = 'xk-viewer-style'
  style.textContent = VIEWER_CSS
  document.head.appendChild(style)
}
