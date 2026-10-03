// src/viewer/index.js
// viewer 入口：读 <script type="application/json" id="xk-data"> 数据 →
// 注入样式 → 建 viewer（3D 核心）→ 建 UI → 接线节点点击详情面板。
// window.__XK_VIEWER__ 暴露实例给冒烟断言用（只读查看器，暴露无风险）。
import { injectStyles } from './styles.js'
import { createViewer } from './viewer.js'
import { createUi } from './ui.js'
import { pickViewerLang } from './i18n.js'

const boot = () => {
  let data = null
  try {
    data = JSON.parse(document.getElementById('xk-data').textContent)
  } catch {
    data = null
  }
  if (!data || !Array.isArray(data.nodes) || !data.nodes.length) {
    document.body.textContent = 'Invalid XKnowledge viewer data.'
    return
  }
  injectStyles()
  const lang = pickViewerLang(navigator.language, data.lang)
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh'

  // UI 在 viewer 之后创建，节点点击回调经可变引用接线
  let showNode = () => {}
  const viewer = createViewer(document.getElementById('graph3d'), data, {
    onNodeClick: (n) => showNode(n.name),
    nodeLabelSep: lang === 'en' ? ': ' : '：'
  })
  const ui = createUi(document.body, data, viewer, { lang })
  showNode = ui.showNode

  window.__XK_VIEWER__ = viewer
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
