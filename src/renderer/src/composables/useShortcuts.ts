import { type Ref } from 'vue'
import { message } from 'ant-design-vue'
import { matchDeleteEvent, matchEvent } from '../utils/keybindings.js'
import { shortcutModifierActive } from '../utils/platformModifier.js'
import { bindings as keybindings } from '../store/keybindingStore.js'
import { t } from '../i18n.js'

/** XkGraph3D 实例上快捷键用到的 expose 面 */
export interface ShortcutGraphHandle {
  openSearch?: () => void
  exportPng?: () => void
}

export interface UseShortcutsOptions {
  graph3dRef: Ref<ShortcutGraphHandle | null>
  settingsRef: Ref<{ open?: () => void } | null>
  outlineImportRef: Ref<{ open?: () => void } | null>
  /** Delete 三路分发的判定输入（框选集 + 最后点击边） */
  selectionNodeNames: Ref<string[]>
  selectionLinkIndexes: Ref<number[]>
  currentEdgeDataIndex: Ref<number>
  /** 菜单/快捷键分发的动作集（编排层把各 composable 的函数汇到这里） */
  actions: {
    saveFile: () => Promise<boolean>
    saveAs: () => Promise<void>
    closeFile: () => Promise<void>
    createNewFile: () => void
    openFile: () => Promise<void>
    createNode: () => void
    deleteNode: () => void
    deleteEdge: () => void
    deleteSelection: () => void
    copySelection: () => Promise<void>
    pasteSelection: () => Promise<void>
    undo: () => void
    redo: () => void
    onExportHtml: () => Promise<void>
    onExportVideo: () => Promise<void>
    onToggleScreenRecord: () => Promise<void>
    startTour: () => void
  }
  /** 录制期间只读判定（环绕/录屏任一进行中，ChartView 谓词单源注入）：
   *  黑名单动作（改图/换图/换呈现）在 dispatch 入口直接吞掉 */
  isRecording?: () => boolean
  /** macOS 删除键别名（window.electronAPI.platform 注入）：⌫ 报 Backspace，
   *  默认 delete 绑定在 darwin 上靠别名命中（keybindings.matchDeleteEvent） */
  isDarwin?: boolean
}

/** 录制期间禁的动作名单（判定口径「非修改非尺寸都允许」）：改图数据
 *  （建/删/连/贴/撤/重做/大纲导入）、换录制对象（新建/打开/关闭文件）、
 *  换呈现（设置弹窗改主题/语言）。放行：保存/另存/复制/导出图片/导出
 *  HTML/搜索/录制互斥项（互斥禁用态另由 XkMenu 表达） */
const RECORDING_BLOCKED_ACTIONS = new Set([
  'create_node',
  'delete_node',
  'delete_edge',
  'delete_selection',
  'paste',
  'undo',
  'redo',
  'import_outline',
  'create_new_file',
  'open_file',
  'close_file',
  'open_settings',
  'start_tour'
])

/**
 * 键盘与菜单动作的统一分发：一个动作一个名字（actionName），
 * 两条触发路径汇进同一个 dispatch(actionName) 入口——
 * - keydown → shortcut() 判定（7 个可自定义键位读 keybindingStore，
 *   matchEvent 精确匹配，primary=Ctrl/⌘ 双收；isTypingContext 守卫跟动作走）
 * - 菜单按钮 → XkMenu 拿 dispatch prop 直接调用（同一张 actionMap）
 * keydown 监听的挂/卸（onMounted/onUnmounted）属编排层。
 */
export function useShortcuts({
  graph3dRef,
  settingsRef,
  outlineImportRef,
  selectionNodeNames,
  selectionLinkIndexes,
  currentEdgeDataIndex,
  actions,
  isRecording = () => false,
  isDarwin = false
}: UseShortcutsOptions) {
  // 动作注册表：编排层注入的函数 + ref 直连项（设置/大纲导入/导出 PNG/搜索
  // 无需经编排层转发）。dispatch 查表直调——不经任何中间状态。
  const actionMap: Record<string, () => void> = {
    save_file: actions.saveFile,
    save_as: actions.saveAs,
    close_file: actions.closeFile,
    create_new_file: actions.createNewFile,
    open_file: actions.openFile,
    create_node: actions.createNode,
    delete_node: actions.deleteNode,
    delete_edge: actions.deleteEdge,
    delete_selection: actions.deleteSelection,
    copy: actions.copySelection,
    paste: actions.pasteSelection,
    undo: actions.undo,
    redo: actions.redo,
    open_settings: () => settingsRef.value?.open(),
    import_outline: () => outlineImportRef.value?.open(),
    // 导出子菜单四项（无键盘键位，仅菜单入口）：与原侧栏按钮同一批函数
    export_png: () => graph3dRef.value?.exportPng(),
    export_html: actions.onExportHtml,
    export_video: actions.onExportVideo,
    screen_record: actions.onToggleScreenRecord,
    start_tour: actions.startTour,
    open_search: () => graph3dRef.value?.openSearch()
  }

  /** 键盘与菜单的唯一分发入口：按动作名查表直调，缺项提示开发期错字；
   *  录制期间黑名单动作（改图/换图/换呈现）在查表前吞掉 */
  const dispatch = (actionName: string): void => {
    if (isRecording() && RECORDING_BLOCKED_ACTIONS.has(actionName)) return
    const action = actionMap[actionName]
    if (action) {
      // 异步动作（导出视频/停止录屏等）失败时统一兜底提示：编排链上无人
      // 接 reject（菜单 @click 不接返回值、无全局 unhandledrejection），
      // 不补 catch 就是控制台以外零反馈（审计 #11）
      const result: unknown = action()
      if (result instanceof Promise) {
        result.catch(() => message.error(t('common.actionFailed')))
      }
    } else {
      console.warn(`未定义的操作: ${actionName}`)
    }
  }

  const shortcut = (event: KeyboardEvent) => {
    // 统一转换为小写处理
    const key = event.key.toLowerCase()
    // 焦点在按钮等普通控件上时快捷键照常生效，只在文本输入元素中屏蔽，
    // 否则点击工具栏/侧边栏控件后焦点残留，Delete/Ctrl(⌘)+Z/Y 会静默失效
    const target = event.target as HTMLElement
    const isTypingContext =
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

    // 快捷键配置映射表：7 个可自定义键位读 keybindingStore（设置里录制改键），
    // 判定经 keybindings.matchEvent 精确匹配（primary=Ctrl/⌘ 双收）；
    // isTypingContext 守卫跟动作走、不跟键走——改键不改变守卫行为
    const shortcutMap: Array<{ match: () => boolean; action: () => void }> = [
      // 全局快捷键
      {
        match: () => matchEvent(event, keybindings.value.save),
        action: () => dispatch('save_file')
      },
      {
        // 拦截项非用户动作、不进自定义列表，保持原样
        match: () => shortcutModifierActive(event) && key === 'r',
        action: () => event.preventDefault() // 阻止浏览器刷新
      },
      {
        // 不加 isTypingContext 守卫：任何输入框聚焦时按搜索键都应跳到
        // 搜索框（浏览器惯例）
        match: () => matchEvent(event, keybindings.value.search),
        action: () => {
          event.preventDefault() // 防御性拦截（Electron 默认无查找，防未来版本行为变化）
          dispatch('open_search')
        }
      },

      // 图表区域快捷键（输入文本时不触发）
      {
        // 删「框选集优先，否则最后点击的对象」：框选批量删（delete_selection）；
        // 无框选时最后点过边（且未再点节点）删边，否则删节点；两边 index 在对方
        // 被点击时对称清空，无选中时各自函数的 <0 守卫兜底，按键无动作。
        // 判定走 matchDeleteEvent：darwin 上默认 delete 键接受 ⌫（Backspace）
        // 别名（macOS 键盘无独立 Delete 键）
        match: () => !isTypingContext && matchDeleteEvent(event, keybindings.value.delete, isDarwin),
        action: () => {
          if (selectionNodeNames.value.length || selectionLinkIndexes.value.length) {
            dispatch('delete_selection')
            return
          }
          dispatch(currentEdgeDataIndex.value > -1 ? 'delete_edge' : 'delete_node')
        }
      },
      {
        match: () => !isTypingContext && matchEvent(event, keybindings.value.undo),
        action: () => dispatch('undo')
      },
      {
        match: () => !isTypingContext && matchEvent(event, keybindings.value.redo),
        action: () => dispatch('redo')
      },
      {
        // 三路分发在 copySelection 内部（三条路径汇到同一序列化出口，不拆
        // actionMap 多条目）；输入框内放行走浏览器原生文本复制
        match: () => !isTypingContext && matchEvent(event, keybindings.value.copy),
        action: () => dispatch('copy')
      },
      {
        match: () => !isTypingContext && matchEvent(event, keybindings.value.paste),
        action: () => dispatch('paste')
      }
    ]

    // 执行匹配的快捷键动作
    for (const config of shortcutMap) {
      if (config.match()) {
        config.action()
        break // 匹配成功后终止循环
      }
    }
  }

  return { shortcut, dispatch }
}
