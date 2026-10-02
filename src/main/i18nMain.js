import { app } from 'electron'
import { zhCN } from '../shared/locales/zh-CN.js'
import { enUS } from '../shared/locales/en-US.js'
import { resolveSystemLocale } from '../shared/localeUtil.js'

/** 字典注册表；加语言 = 此处加一行 + locales/ 加一份文件 */
const DICTS = { 'zh-CN': zhCN, 'en-US': enUS }

/** 生效语言必须是字典键（auto 在派生层已消解） */
const normalizeLocale = (v) => (DICTS[v] ? v : 'zh-CN')

// 启动即取系统语言：首帧对话框/标题正确（用户偏好由渲染层 mount 前
// 经 app:locale-applied 上报覆盖，与主题 lastEffectiveTheme 同模式）
let currentLocale = resolveSystemLocale(app.getLocale())

export const getCurrentLocale = () => currentLocale
export const setCurrentLocale = (v) => {
  currentLocale = normalizeLocale(v)
}

/**
 * 查表（嵌套 key + {name} 插值 + 缺 key 回落 zh-CN 再回落 key 本身）。
 * 主进程消息无复数条目，插值只做字面替换（与渲染层 vue-i18n 同语法）。
 */
export const t = (key, params) => {
  const lookup = (dict) =>
    key.split('.').reduce((node, seg) => (node == null ? undefined : node[seg]), dict)
  let text = lookup(DICTS[currentLocale])
  if (typeof text !== 'string') text = lookup(zhCN) // fallback 与渲染层 fallbackLocale 一致
  if (typeof text !== 'string') return key
  if (params) {
    for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v))
  }
  return text
}
