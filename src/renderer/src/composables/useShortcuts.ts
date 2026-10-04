import { ref, watch, type Ref } from 'vue'
import { matchEvent } from '../utils/keybindings.js'
import { shortcutModifierActive } from '../utils/platformModifier.js'
import { bindings as keybindings } from '../store/keybindingStore.js'

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
  }
}

/**
 * 键盘快捷键与菜单动作的统一分发通道：
 * - keydown → shortcut() 判定（7 个可自定义键位读 keybindingStore，
 *   matchEvent 精确匹配，primary=Ctrl/⌘ 双收；isTypingContext 守卫跟动作走）
 * - 菜单按钮 → v-model 翻转 shortcutWatch 经 triggerShortcut 标记动作名
 * - watch(shortcutWatch) 把动作名映射到编排层注入的动作集
 * shortcutActive/shortcutWatch 同时是 XkMenu 的 v-model（按钮高亮/分发复用）。
 * keydown 监听的挂/卸（onMounted/onUnmounted）属编排层。
 */
export function useShortcuts({
  graph3dRef,
  settingsRef,
  outlineImportRef,
  selectionNodeNames,
  selectionLinkIndexes,
  currentEdgeDataIndex,
  actions
}: UseShortcutsOptions) {
  const shortcutActive = ref('')
  const shortcutWatch = ref(false)

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
        action: () => triggerShortcut('save_file')
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
          graph3dRef.value?.openSearch()
        }
      },

      // 图表区域快捷键（输入文本时不触发）
      {
        // 删「框选集优先，否则最后点击的对象」：框选批量删（deleteSelection）；
        // 无框选时最后点过边（且未再点节点）删边，否则删节点；两边 index 在对方
        // 被点击时对称清空，无选中时各自函数的 <0 守卫兜底，按键无动作
        match: () => !isTypingContext && matchEvent(event, keybindings.value.delete),
        action: () => {
          if (selectionNodeNames.value.length || selectionLinkIndexes.value.length) {
            triggerShortcut('delete_selection')
            return
          }
          triggerShortcut(currentEdgeDataIndex.value > -1 ? 'delete_edge' : 'delete_node')
        }
      },
      {
        match: () => !isTypingContext && matchEvent(event, keybindings.value.undo),
        action: () => triggerShortcut('undo')
      },
      {
        match: () => !isTypingContext && matchEvent(event, keybindings.value.redo),
        action: () => triggerShortcut('redo')
      },
      {
        // 三路分发在 copySelection 内部（三条路径汇到同一序列化出口，不拆
        // actionMap 多条目）；输入框内放行走浏览器原生文本复制
        match: () => !isTypingContext && matchEvent(event, keybindings.value.copy),
        action: () => triggerShortcut('copy')
      },
      {
        match: () => !isTypingContext && matchEvent(event, keybindings.value.paste),
        action: () => triggerShortcut('paste')
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

  // 新增的快捷操作触发方法
  const triggerShortcut = (actionName: string) => {
    shortcutActive.value = actionName
    shortcutWatch.value = !shortcutWatch.value
  }

  watch(shortcutWatch, () => {
    // 使用对象映射替代 switch-case 结构
    const actionMap: Record<string, () => void> = {
      save_file: actions.saveFile,
      save_as: actions.saveAs,
      close_file: actions.closeFile,
      create_new_file: actions.createNewFile,
      open_file: actions.openFile,
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
      screen_record: actions.onToggleScreenRecord
    }

    const actionName = shortcutActive.value
    if (actionName && actionMap[actionName]) {
      actionMap[actionName]()
    } else if (actionName) {
      console.warn(`未定义的快捷操作: ${actionName}`)
    }
  })

  return { shortcutActive, shortcutWatch, shortcut }
}
