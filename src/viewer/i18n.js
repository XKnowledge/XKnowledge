// src/viewer/i18n.js
// viewer 双语文案：语言跟随**导出时的应用语言**（data.lang，导出者所见即
// 接收方所得）；data.lang 缺失/被手工改坏时才按接收方 navigator.language
// 自适应（zh 开头 → zh）。独立于 app locales——单文件必须自包含。
export const VIEWER_I18N = {
  zh: {
    nodes: '节点',
    links: '连接',
    searchPlaceholder: '搜索节点…',
    searchNoHit: '无匹配',
    labels: '显示小节点名称',
    focus: '聚焦',
    focusOff: '关闭',
    focusDim: '灰化',
    focusDeep: '隐藏',
    hops: '跳数',
    reset: '复位视图',
    neighbors: '个连接',
    category: '类目',
    view: '视图',
    navHint: '左键：旋转　右键：平移　滚轮：缩放　拖节点：移动',
    nodeLabelSep: '：'
  },
  en: {
    nodes: 'nodes',
    links: 'links',
    searchPlaceholder: 'Search nodes…',
    searchNoHit: 'no match',
    labels: 'Small node labels',
    focus: 'Focus',
    focusOff: 'off',
    focusDim: 'dim',
    focusDeep: 'hide',
    hops: 'hops',
    reset: 'Reset view',
    neighbors: ' links',
    category: 'Category',
    view: 'View',
    navHint: 'Left: rotate  Right: pan  Wheel: zoom  Drag node: move',
    nodeLabelSep: ': '
  }
}

/** 导出语言（data.lang）优先（zh* → zh，其余 → en），缺失才看接收方浏览器语言 */
export const pickViewerLang = (dataLang, navLang) => {
  if (typeof dataLang === 'string' && dataLang) {
    return dataLang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  }
  return typeof navLang === 'string' && navLang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
