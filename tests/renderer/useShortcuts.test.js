import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useShortcuts } from '../../src/renderer/src/composables/useShortcuts'

// keydown 事件用结构兼容的普通对象：matchEvent 只读修饰键/key，
// isTypingContext 守卫读 target——不耦合真实浏览器事件
const keyEvent = (over = {}) => ({
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  key: '',
  target: { tagName: 'DIV', isContentEditable: false },
  preventDefault: vi.fn(),
  ...over
})

// 编排层注入面：17 个动作全 vi.fn；三个 ref 直连入口各带 open/export 方法
const setup = (over = {}) => {
  const actions = {
    saveFile: vi.fn(),
    saveAs: vi.fn(),
    closeFile: vi.fn(),
    createNewFile: vi.fn(),
    openFile: vi.fn(),
    createNode: vi.fn(),
    deleteNode: vi.fn(),
    deleteEdge: vi.fn(),
    deleteSelection: vi.fn(),
    copySelection: vi.fn(),
    pasteSelection: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    onExportHtml: vi.fn(),
    onExportVideo: vi.fn(),
    onToggleScreenRecord: vi.fn(),
    startTour: vi.fn()
  }
  const graph3dRef = { value: { openSearch: vi.fn(), exportPng: vi.fn() } }
  const settingsRef = { value: { open: vi.fn() } }
  const outlineImportRef = { value: { open: vi.fn() } }
  const selectionNodeNames = { value: [] }
  const selectionLinkIndexes = { value: [] }
  const currentEdgeDataIndex = { value: -1 }
  const { shortcut, dispatch } = useShortcuts({
    graph3dRef,
    settingsRef,
    outlineImportRef,
    selectionNodeNames,
    selectionLinkIndexes,
    currentEdgeDataIndex,
    actions,
    ...over
  })
  return {
    shortcut,
    dispatch,
    actions,
    graph3dRef,
    settingsRef,
    outlineImportRef,
    selectionNodeNames,
    selectionLinkIndexes,
    currentEdgeDataIndex
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dispatch：键盘与菜单汇入的唯一分发入口', () => {
  // 菜单 15 项 + 键盘专属（delete_selection/copy/paste）——一个动作一个名字
  it.each([
    ['save_file', 'saveFile'],
    ['save_as', 'saveAs'],
    ['close_file', 'closeFile'],
    ['create_new_file', 'createNewFile'],
    ['open_file', 'openFile'],
    ['create_node', 'createNode'],
    ['delete_node', 'deleteNode'],
    ['delete_edge', 'deleteEdge'],
    ['delete_selection', 'deleteSelection'],
    ['copy', 'copySelection'],
    ['paste', 'pasteSelection'],
    ['undo', 'undo'],
    ['redo', 'redo'],
    ['export_html', 'onExportHtml'],
    ['export_video', 'onExportVideo'],
    ['screen_record', 'onToggleScreenRecord'],
    ['start_tour', 'startTour']
  ])('dispatch(%s) 直调编排层注入的 %s', (actionName, fnName) => {
    const { dispatch, actions } = setup()
    dispatch(actionName)
    expect(actions[fnName]).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['open_settings', 'settingsRef'],
    ['import_outline', 'outlineImportRef']
  ])('dispatch(%s) 直连对应面板的 open()', (actionName, refName) => {
    const ctx = setup()
    ctx.dispatch(actionName)
    expect(ctx[refName].value.open).toHaveBeenCalledTimes(1)
  })

  it('dispatch(export_png) 直连 graph3d 的 exportPng（无键盘键位，仅菜单入口）', () => {
    const { dispatch, graph3dRef } = setup()
    dispatch('export_png')
    expect(graph3dRef.value.exportPng).toHaveBeenCalledTimes(1)
  })

  it('dispatch(open_search) 直连 graph3d 的 openSearch（搜索也无键盘守卫直通）', () => {
    const { dispatch, graph3dRef } = setup()
    dispatch('open_search')
    expect(graph3dRef.value.openSearch).toHaveBeenCalledTimes(1)
  })

  it('未定义的动作名：console.warn 提示且不抛错', () => {
    const { dispatch } = setup()
    expect(() => dispatch('no_such_action')).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no_such_action'))
  })

  it('分发是同步直调：不借助翻转布尔量或 watch 异步绕行', () => {
    const { dispatch, actions } = setup()
    dispatch('save_file')
    expect(actions.saveFile).toHaveBeenCalledTimes(1) // 同一调用栈内已执行
  })
})

describe('键盘路径：keydown 判定后汇入同一 dispatch', () => {
  it.each([
    ['s', 'saveFile'],
    ['z', 'undo'],
    ['y', 'redo'],
    ['c', 'copySelection'],
    ['v', 'pasteSelection']
  ])('Ctrl+%s 触发 %s（默认键位）', (key, fnName) => {
    const { shortcut, actions } = setup()
    shortcut(keyEvent({ ctrlKey: true, key }))
    expect(actions[fnName]).toHaveBeenCalledTimes(1)
  })

  it('primary 双收：Meta(⌘)+S 与 Ctrl+S 等价触发 saveFile', () => {
    const { shortcut, actions } = setup()
    shortcut(keyEvent({ metaKey: true, key: 's' }))
    expect(actions.saveFile).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+F 触发搜索并 preventDefault（输入框聚焦时也放行）', () => {
    const { shortcut, graph3dRef } = setup()
    const event = keyEvent({ ctrlKey: true, key: 'f', target: { tagName: 'INPUT' } })
    shortcut(event)
    expect(graph3dRef.value.openSearch).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+R 只拦截浏览器刷新（preventDefault），不触发任何动作', () => {
    const { shortcut, actions } = setup()
    const event = keyEvent({ ctrlKey: true, key: 'r' })
    shortcut(event)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled()
  })

  it('无匹配键位不触发任何动作', () => {
    const { shortcut, actions } = setup()
    shortcut(keyEvent({ key: 'x' }))
    for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled()
  })
})

describe('Delete 三路分发（框选集优先，否则最后点击对象）', () => {
  it('框选节点非空 → delete_selection', () => {
    const ctx = setup()
    ctx.selectionNodeNames.value = ['a', 'b']
    ctx.shortcut(keyEvent({ key: 'Delete' }))
    expect(ctx.actions.deleteSelection).toHaveBeenCalledTimes(1)
    expect(ctx.actions.deleteNode).not.toHaveBeenCalled()
  })

  it('框选边非空 → delete_selection', () => {
    const ctx = setup()
    ctx.selectionLinkIndexes.value = [0, 1]
    ctx.shortcut(keyEvent({ key: 'Delete' }))
    expect(ctx.actions.deleteSelection).toHaveBeenCalledTimes(1)
  })

  it('无框选 + 最后点击过边 → delete_edge', () => {
    const ctx = setup()
    ctx.currentEdgeDataIndex.value = 0
    ctx.shortcut(keyEvent({ key: 'Delete' }))
    expect(ctx.actions.deleteEdge).toHaveBeenCalledTimes(1)
    expect(ctx.actions.deleteNode).not.toHaveBeenCalled()
  })

  it('无框选 + 无边 → delete_node', () => {
    const ctx = setup()
    ctx.shortcut(keyEvent({ key: 'Delete' }))
    expect(ctx.actions.deleteNode).toHaveBeenCalledTimes(1)
  })
})

describe('isTypingContext 守卫：跟动作走、不跟键走', () => {
  it.each([
    ['Delete', 'deleteNode'],
    ['z', 'undo']
  ])('输入框聚焦时 Ctrl/裸 %s 不触发 %s', (key, fnName) => {
    const { shortcut, actions } = setup()
    shortcut(
      keyEvent({
        ctrlKey: key !== 'Delete',
        key,
        target: { tagName: 'INPUT' }
      })
    )
    expect(actions[fnName]).not.toHaveBeenCalled()
  })

  it('isContentEditable 元素同样被守卫', () => {
    const { shortcut, actions } = setup()
    shortcut(keyEvent({ key: 'Delete', target: { tagName: 'DIV', isContentEditable: true } }))
    expect(actions.deleteNode).not.toHaveBeenCalled()
  })
})
