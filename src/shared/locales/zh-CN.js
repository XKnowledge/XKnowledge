/**
 * zh-CN 字典：渲染层（vue-i18n）与主进程（i18nMain 查表）共用唯一数据源。
 * 纯数据模块：禁止 import vue / electron。
 * 插值 {name}；复数 {n, plural, ...} 仅渲染层 vue-i18n 消费，主进程 t() 只做字面替换。
 * 两份字典 key 结构必须逐域一致（缺 key 运行时回落 zh-CN + 控制台警告）。
 */
export const zhCN = {
  common: {
    untitled: '未命名',
    cancel: '取消',
    confirm: '确认',
    close: '关闭',
    settings: '设置',
    import: '导入',
    add: '新增',
    save: '保存',
    discard: '放弃',
    minimize: '最小化',
    maximize: '最大化',
    restore: '向下还原',
    closeEsc: '关闭 (Esc)',
    openFailedDetail: '打开失败：文件读取失败或已损坏',
    collapse: '收起',
    name: '名称',
    description: '描述'
  },
  dialog: {
    confirmExit: '确认退出',
    unsavedExit: '文件未保存，是否退出？',
    saveTo: '将文件保存到…',
    saveAsTo: '将文件另存为…',
    open: '打开',
    pickWorldDir: '选择图库目录'
  },
  menu: {
    newFile: '新建文件',
    openFile: '打开文件',
    closeFile: '关闭文件',
    saveAs: '另存为...',
    importOutline: '从大纲导入...',
    addDir: '增加目录',
    refresh: '刷新视图',
    backHome: '返回首页',
    worldTree: '世界树',
    openLocalFile: '打开本地文件'
  },
  settings: {
    title: '设置',
    theme: '主题',
    followSystem: '跟随系统',
    light: '浅色',
    dark: '深色',
    language: '语言',
    keybindings: '快捷键',
    keybindingConflict: '已被「{name}」占用',
    pressNewCombo: '按下新组合…',
    resetDefault: '恢复默认',
    resetAll: '全部恢复默认',
    gestures: '鼠标手势',
    gestureNote: '鼠标手势暂不支持自定义'
  },
  keybinding: {
    names: { save: '保存', undo: '撤销', redo: '重做', delete: '删除', search: '图内搜索' },
    reject: {
      esc: 'Esc 是录制取消键，不能作为快捷键',
      tab: 'Tab 是焦点移动键，不能作为快捷键',
      f5: 'F5 被保留（防刷新），不能作为快捷键',
      ctrlR: 'Ctrl/⌘+R 被保留（防刷新），不能作为快捷键',
      searchBare: '图内搜索在输入框内也会触发，必须搭配至少一个修饰键'
    }
  },
  editor: {
    nodeName: '节点名称',
    categoryPlaceholder: '类目',
    newCategory: '新类目',
    small: '小',
    medium: '中',
    large: '大',
    descriptionOptional: '描述（可选）',
    edgeNamePlaceholder: '连接名称（留空建无名边），回车确认'
  },
  node: {
    category: '所属类目',
    categoryPlaceholder: '请选择类目',
    categoryNamePlaceholder: '类目名',
    newCategory: '新增类目',
    size: '节点大小',
    submit: '修改节点'
  },
  edge: {
    submit: '修改连接'
  },
  search: {
    placeholder: '搜索节点名/描述',
    worldPlaceholder: '搜索全库节点：名称 / 描述',
    noMatch: '无匹配节点'
  },
  example: {
    nodeEdgeCount: '{nodes} 节点 · {edges} 边'
  },
  gesture: {
    createNode: '新建节点',
    marquee: '框选',
    createLink: '新建连接',
    doubleClickBlank: '双击空白处',
    shiftDrag: 'Shift+拖拽',
    linkLabel: '{modifier}+拖拽节点'
  },
  chart: {
    showEdgeName: '悬浮显示连接名称',
    showSmallLabels: '显示小节点名称',
    focusMode: '聚焦模式',
    focusOff: '关闭',
    focusDim: '灰化',
    focusHide: '隐藏',
    focusHops: '跳数',
    repulsion: '排斥力大小',
    description: '图谱简介',
    view: '视图',
    exportPng: '导出图片',
    resetView: '复位视图',
    exportVideo: '导出视频',
    recording: '录制中…',
    screenRecord: '录屏',
    stopRecord: '停止录屏',
    videoExported: '已导出视频',
    videoUnsupported: '当前环境不支持视频录制',
    recordingSaved: '录屏已保存',
    recordingCancelled: '已取消导出',
    loadFailed: '图表数据装载失败，请关闭窗口后重新打开文件',
    newWindowFailed: '新建图表窗口失败',
    alreadyOpen: '该文件已在打开的窗口中',
    openFailed: '打开失败',
    nothingToSave: '没有可保存的图表内容',
    fileConflictHint: '文件已被其他窗口或外部程序修改，请使用“另存为”保留修改',
    exampleProtectedHint: '示例文件不允许修改，请选择其他位置保存',
    saveFailed: '保存失败',
    saveAsFailed: '另存为失败',
    deleteNode: '删除节点',
    deleteEdge: '删除连接',
    editSider: '编辑栏',
    deletedSummary: '已删除 {nodes} 个节点、{edges} 条连接',
    searchHits: '共 {count} 个命中',
    init3dFailed: '3D 视图初始化失败（显卡驱动异常？），侧边栏编辑功能仍可使用',
    navInfo3d:
      '左键：旋转　右键：平移　滚轮：缩放　双击：建节点　拖节点：移动　{modifier}+拖到节点：连线　Shift+拖：框选',
    nodeLabelSep: '：'
  },
  world: {
    initFailed: '3D 视图初始化失败（显卡驱动异常？），世界层不可用',
    superNodeLabel: '{title}（{count} 节点）',
    empty: '世界为空',
    collapseAll: '全部收拢',
    viewSettings: '视图调节',
    repulsion: '排斥力',
    focus: '聚焦',
    sourceExample: '内置示例',
    sourceUser: '用户图库',
    expand: '展开此图',
    openFullEdit: '打开完整编辑',
    emptyDir: '图库目录未发现任何图谱：{dir}',
    loadFailed: '世界索引加载失败',
    expandFailed: '展开失败：文件读取失败或已损坏',
    dirUpdated: '图库目录已更新',
    setDirFailed: '设置图库目录失败',
    corruptSkipped: '世界索引：{count} 个损坏文件已跳过',
    expandedCount: '已展开 {count}',
    nodeCountSource: '节点 {count} 个 · 来源：{source}',
    navInfo: '左键：旋转 滚轮/中键：缩放 右键：平移'
  },
  gallery: {
    title: '示例图库',
    searchPlaceholder: '搜索示例：标题 / 描述 / 分类',
    newBlankFile: '新建空白文件',
    noMatch: '无匹配的示例',
    noExamples: '暂无示例'
  },
  outline: {
    title: '从大纲导入',
    hint1: '粘贴 Markdown 大纲，按规则解析为图谱追加到当前文件（同名节点跳过）：',
    codeHeading: '标题',
    hintHeading: ' 层级、缩进列表（2 空格一档）、',
    codeWikilink: '双链',
    hintWikilink: ' 显式连接、',
    hint2: '结构行下段落存为节点描述；多个一级标题会依次连成链保持整图连通。',
    textareaPlaceholder:
      '# 一级标题（成为类目）\n## 二级标题\n- 列表项\n  - 子列表项\n正文段落会成为上方节点的描述',
    nothingToImport: '没有可导入的内容（节点均已存在且无新连接）',
    importSummary: '将导入 {nodes} 个节点、{edges} 条连接'
  },
  validation: {
    nodeNameRequired: '节点名称不能为空',
    categoryRequired: '请选择/创建节点所属类目',
    duplicateNode: '不能创建同名节点',
    edgeExists: '两个节点间连接已存在'
  },
  error: {
    fileConflict: '文件已被其他窗口或外部程序修改，为避免覆盖他人的修改，请使用"另存为"',
    exampleProtected: '示例文件不允许修改，请保存到其他位置',
    worldPathRejected: '无效的图谱路径',
    worldPathOutside: '路径不在世界树图库范围内',
    worldDirRejected: '无效的图库目录',
    incompleteChart: '文件结构不完整（{detail}），不是有效的 XKnowledge 图谱文件',
    readFailed: '文件读取失败',
    writeFailed: '文件写入失败',
    notValidFile: '文件已损坏或不是有效的 XKnowledge 文件',
    contentInvalid: '文件内容已损坏或格式不正确，无法打开',
    notOpenedGuard: '该文件未经过打开或另存为操作，不允许直接写入',
    invalidExampleName: '无效的示例文件名',
    validation: {
      not_json_object: '文件内容不是 JSON 对象',
      no_version: '缺少版本标记（version 应为 2）',
      missing_nodes: '缺少节点数据（nodes）',
      invalid_node_item: '节点数据包含无效项',
      missing_links: '缺少连接数据（links）',
      dangling_edge: '存在引用不存在节点的连接'
    }
  }
}
