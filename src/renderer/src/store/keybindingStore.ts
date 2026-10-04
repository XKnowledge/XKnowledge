import { computed, ref } from 'vue'
import {
  DEFAULT_BINDINGS,
  KEYBINDING_IDS,
  bindingEquals,
  isValidBinding,
  type KeyBinding,
  type KeybindingId
} from '../utils/keybindings.js'

/**
 * 快捷键用户自定义（对齐 themeStore 模式）：localStorage（xk-keybindings）
 * 只存改过的键位，生效视图 = 默认 ⊕ 覆盖；storage 事件跨窗口实时同步
 * （同 session 所有窗口）。模块加载期除 localStorage 读取（try-catch 兜底）
 * 外无副作用，node 测试环境可直接 import。
 */
export const STORAGE_KEY = 'xk-keybindings'

/** 覆盖表：只含用户改过的键位（缺省回落 DEFAULT_BINDINGS） */
export type BindingOverrides = Partial<Record<KeybindingId, KeyBinding>>

/** 修饰键规范化顺序（keybindings.LEGAL_MODIFIERS 同序，手改存储乱序时归一） */
const MODIFIER_ORDER: Record<'primary' | 'shift' | 'alt', number> = { primary: 0, shift: 1, alt: 2 }

const normalizeModifiers = (modifiers: KeyBinding['modifiers']): KeyBinding['modifiers'] =>
  [...modifiers].sort((a, b) => MODIFIER_ORDER[a] - MODIFIER_ORDER[b])

/** 存储原文 → 合法覆盖表：坏 JSON/非法绑定/未知键位一律丢弃（该项回落默认） */
export const loadOverrides = (raw: string | null): BindingOverrides => {
  let parsed: any
  try {
    parsed = JSON.parse(raw as string)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const overrides: BindingOverrides = {}
  for (const id of KEYBINDING_IDS) {
    if (isValidBinding(parsed[id])) {
      overrides[id] = { key: parsed[id].key, modifiers: normalizeModifiers(parsed[id].modifiers) }
    }
  }
  return overrides
}

/** 生效视图（纯函数）：默认 ⊕ 覆盖 */
export const mergeBindings = (overrides: BindingOverrides): Record<KeybindingId, KeyBinding> => {
  const merged = {} as Record<KeybindingId, KeyBinding>
  for (const id of KEYBINDING_IDS) merged[id] = overrides[id] ?? DEFAULT_BINDINGS[id]
  return merged
}

const readStoredOverrides = (): BindingOverrides => {
  try {
    return loadOverrides(localStorage.getItem(STORAGE_KEY))
  } catch {
    return {} // localStorage 受限/损坏：回默认，不阻塞启动
  }
}

const overrides = ref(readStoredOverrides())

/** 全量键位生效视图（ChartView 判定 / XkSettings 展示 / XkMenu 标注共用） */
export const bindings = computed(() => mergeBindings(overrides.value))

const persist = (): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides.value)) // 其他窗口经 storage 事件跟随
  } catch {
    /* 持久化失败仅影响记忆，本窗口仍生效 */
  }
}

/** 设置键位（非法入参静默拒绝；录回默认组合也照存，isCustomized 判等自然为 false） */
export const setBinding = (id: KeybindingId, binding: KeyBinding): void => {
  if (!KEYBINDING_IDS.includes(id) || !isValidBinding(binding)) return
  overrides.value = { ...overrides.value, [id]: binding }
  persist()
}

/** 单键位恢复默认（未改过则无操作） */
export const resetBinding = (id: KeybindingId): void => {
  if (!(id in overrides.value)) return
  const next = { ...overrides.value }
  delete next[id]
  overrides.value = next
  persist()
}

/** 全部恢复默认 */
export const resetAll = (): void => {
  overrides.value = {}
  persist()
}

/** 该键位当前生效值是否异于默认（「恢复默认」按钮点亮依据） */
export const isCustomized = (id: KeybindingId): boolean =>
  !bindingEquals(bindings.value[id], DEFAULT_BINDINGS[id])

let inited = false

/** 挂 storage 监听（main.ts 在 mount 前调用一次）：其他窗口改键本窗口跟随。幂等。 */
export const initKeybindingSync = (): void => {
  if (inited) return
  inited = true
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    overrides.value = loadOverrides(e.newValue)
  })
}
