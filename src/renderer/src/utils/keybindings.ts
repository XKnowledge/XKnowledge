/**
 * 键盘快捷键绑定的纯数据与纯函数（默认表/录制归一/判定/文案/校验），
 * 不耦合浏览器环境与平台：isDarwin 由调用方注入（platformModifier 同款
 * 惯例），双平台逻辑都能在任意机器上单测。用户自定义的持久化与生效
 * 视图在 store/keybindingStore.js，这里只提供无状态工具。
 *
 * 绑定模型：{ modifiers: string[], key: string }
 * - modifiers 合法值 primary / shift / alt。primary 是「主修饰键」抽象：
 *   录制时 Ctrl 与 ⌘ 都归一为 primary（沿用键盘快捷键 Ctrl/⌘ 双收惯例，
 *   Mac/Win 自动正确），判定时 ctrlKey/metaKey 任一即算；用户无须也不
 *   可表达「仅 Ctrl 不含 ⌘」的字面区分
 * - key 为 event.key 小写归一（'s'、'delete'、'f5'、' '（空格）、'arrowup'…）
 * - 判定精确匹配：绑定列出的修饰键必须按下、未列出的必须未按下
 *   （Ctrl+Shift+S 不再误触 Ctrl+S）
 */

import { t } from '../i18n.js'

/** 绑定模型：{ modifiers, key }（modifiers 合法值见 LEGAL_MODIFIERS） */
export interface KeyBinding {
  modifiers: Array<'primary' | 'shift' | 'alt'>
  key: string
}

/** 7 个可自定义键位及默认绑定（delete/copy=三路分发整体：框选集优先→直选边→最后点击节点） */
export type KeybindingId = 'save' | 'undo' | 'redo' | 'delete' | 'copy' | 'paste' | 'search'

export const DEFAULT_BINDINGS: Record<KeybindingId, KeyBinding> = {
  save: { modifiers: ['primary'], key: 's' },
  undo: { modifiers: ['primary'], key: 'z' },
  redo: { modifiers: ['primary'], key: 'y' },
  delete: { modifiers: [], key: 'delete' },
  copy: { modifiers: ['primary'], key: 'c' },
  paste: { modifiers: ['primary'], key: 'v' },
  search: { modifiers: ['primary'], key: 'f' }
}

export const KEYBINDING_IDS: KeybindingId[] = Object.keys(
  DEFAULT_BINDINGS
) as KeybindingId[]

/** 键位动作名（语言相关：设置行名与冲突提示共用，查字典 keybinding.names.<id>） */
export const actionName = (id: string): string => t(`keybinding.names.${id}`)

/** 合法修饰键（顺序即规范化顺序，便于相等比较与文案拼接） */
const LEGAL_MODIFIERS = ['primary', 'shift', 'alt']

/** schema 校验（store 载入过滤与单测共用）：非对象/修饰键越界或重复/key 非法 → false。
 *  入参是 localStorage 反序列化产物（不可信输入），故为 any 并以类型守卫收窄 */
export const isValidBinding = (x: any): x is KeyBinding =>
  typeof x === 'object' &&
  x !== null &&
  Array.isArray(x.modifiers) &&
  x.modifiers.length <= LEGAL_MODIFIERS.length &&
  x.modifiers.every((m) => LEGAL_MODIFIERS.includes(m)) &&
  new Set(x.modifiers).size === x.modifiers.length &&
  typeof x.key === 'string' &&
  x.key.length > 0

/** 录制/判定事件的最小结构（KeyboardEvent 满足；测试可直接传普通对象，不耦合浏览器环境） */
export interface RecordableEvent {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

/** 键按下事件 → 绑定（录制归一）：Ctrl/⌘→primary、key 小写；单按修饰键返回 null（继续等组合） */
export const normalizeRecordedEvent = (event: RecordableEvent): KeyBinding | null => {
  const key = event.key.toLowerCase()
  if (['control', 'shift', 'alt', 'meta'].includes(key)) return null
  const modifiers: KeyBinding['modifiers'] = []
  if (event.ctrlKey || event.metaKey) modifiers.push('primary')
  if (event.shiftKey) modifiers.push('shift')
  if (event.altKey) modifiers.push('alt')
  return { modifiers, key }
}

/** 精确匹配：key 相同且列出的修饰键全按下、未列出的全未按（primary=ctrl/meta 任一） */
export const matchEvent = (event: RecordableEvent, binding: KeyBinding): boolean => {
  if (event.key.toLowerCase() !== binding.key) return false
  const want = binding.modifiers
  if (want.includes('primary') !== !!(event.ctrlKey || event.metaKey)) return false
  if (want.includes('shift') !== !!event.shiftKey) return false
  if (want.includes('alt') !== !!event.altKey) return false
  return true
}

/** 两个绑定是否同一组合（modifiers 视作集合，与顺序无关——手改存储乱序也稳） */
export const bindingEquals = (a: KeyBinding, b: KeyBinding): boolean =>
  a.key === b.key && [...a.modifiers].sort().join(',') === [...b.modifiers].sort().join(',')

/** 冲突检测：新绑定与其它键位撞车时返回占用者 id，无冲突 null */
export const findConflict = (
  bindings: Record<string, KeyBinding>,
  id: string,
  binding: KeyBinding
): string | null => {
  for (const otherId of Object.keys(bindings)) {
    if (otherId === id) continue
    if (bindingEquals(bindings[otherId], binding)) return otherId
  }
  return null
}

/** 文案用键名显示（设置行与冲突提示共用） */
const KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  escape: 'Esc'
}

/** 绑定显示文案：'Ctrl+Shift+S' / 'Delete' / '⌘+F'（primary 按平台渲染） */
export const formatBindingLabel = (binding: KeyBinding, isDarwin: boolean): string => {
  const parts = binding.modifiers.map((m) =>
    m === 'primary' ? (isDarwin ? '⌘' : 'Ctrl') : m[0].toUpperCase() + m.slice(1)
  )
  const k = binding.key
  parts.push(KEY_LABELS[k] ?? (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1)))
  return parts.join('+')
}

/**
 * 录制结果校验（返回拒绝原因文案，通过返回 null）：
 * - 黑名单：Esc（录制取消键）/ Tab（焦点移动键）/ F5 与 primary+R 系
 *   （主进程 before-input-event 拦截刷新，绑了也到不了渲染层）
 * - search 必须带至少一个修饰键：搜索无输入框守卫（浏览器 Ctrl+F 惯例，
 *   任何位置都触发），裸键会让任何输入框打字即弹搜索
 */
export const validateRecording = (id: string, binding: KeyBinding): string | null => {
  if (binding.key === 'escape') return t('keybinding.reject.esc')
  if (binding.key === 'tab') return t('keybinding.reject.tab')
  if (binding.key === 'f5') return t('keybinding.reject.f5')
  if (binding.modifiers.includes('primary') && binding.key === 'r')
    return t('keybinding.reject.ctrlR')
  if (id === 'search' && binding.modifiers.length === 0) return t('keybinding.reject.searchBare')
  return null
}
