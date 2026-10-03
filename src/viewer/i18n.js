// src/viewer/i18n.js
// viewer 双语文案：导出的 HTML 在任意接收方浏览器打开，语言无法预知，
// 按 navigator.language 选（zh 开头 → zh），不可判时回退导出时应用语言
//（data.lang，导出者语言偏好传递）。独立于 app locales——单文件必须自包含。
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
    nodeLabelSep: ': '
  }
}

/** navigator.language 优先（zh* → zh，其余 → en），不可判回退导出语言 */
export const pickViewerLang = (navLang, dataLang) => {
  if (typeof navLang === 'string' && navLang) {
    return navLang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  }
  return dataLang === 'en-US' ? 'en' : 'zh'
}
