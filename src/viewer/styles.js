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
/* 图例：软件同款竖排卡片（graph3d-legend 同构——浮层底色无边框、
   色点+类目名一行一个、off 删除线半透明、超高滚动） */
.xk-legend {
  position: absolute; top: 52px; left: 14px; display: flex; flex-direction: column;
  gap: 4px; max-height: 60%; overflow-y: auto; z-index: 10;
  padding: 8px; border-radius: 6px; background: var(--xk-panel); font: 13px sans-serif;
}
.xk-chip {
  display: flex; align-items: center; gap: 6px; padding: 0; border: none;
  cursor: pointer; user-select: none; text-align: left; font: inherit;
  background: transparent; color: var(--xk-fg); white-space: nowrap;
}
.xk-chip .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.xk-chip[data-off='1'] { opacity: .35; text-decoration: line-through; }
.xk-side {
  position: absolute; top: 52px; right: 14px; width: 250px; z-index: 10;
  display: flex; flex-direction: column; gap: 10px;
}
.xk-ctrl {
  border: 1px solid var(--xk-border); border-radius: 8px;
  background: var(--xk-panel); overflow: hidden;
}
.xk-ctrl-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 10px 7px 12px; cursor: pointer; user-select: none;
  font-weight: 600; font-size: 13px;
}
.xk-ctrl-toggle {
  border: none; background: none; color: var(--xk-fg); cursor: pointer;
  font: inherit; padding: 0 6px; line-height: 1;
}
.xk-ctrl[data-collapsed='1'] .xk-ctrl-body { display: none; }
.xk-ctrl-body {
  display: flex; flex-direction: column; gap: 10px; padding: 4px 12px 12px;
}
.xk-ctrl-body label { display: inline-flex; align-items: center; gap: 4px;
  cursor: pointer; user-select: none; }
.xk-ctrl-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.xk-ctrl-body select {
  padding: 2px 6px; border: 1px solid var(--xk-border); border-radius: 4px;
  background: var(--xk-bg); color: var(--xk-fg); font: inherit;
}
.xk-ctrl-body .xk-btn { width: 100%; }
.xk-watermark {
  position: absolute; left: 0; right: 0; bottom: 5%; text-align: center;
  font-weight: bold; font-size: max(18px, 2.2vh); color: var(--xk-watermark);
  opacity: .8; pointer-events: none; z-index: 5;
}
.xk-panel {
  max-height: 55vh;
  overflow: auto; padding: 14px; border: 1px solid var(--xk-border);
  border-radius: 8px; background: var(--xk-panel); display: none;
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
