import { sep } from 'path'

export const DEFAULT_TITLE = 'XKnowledge'
export const UNTITLED_TITLE = '未命名 — XKnowledge'

// Electron 对话框在 Windows 返回 \ 分隔路径，dev/测试常见 /，两种都按分隔符切
const segmentsOf = (p) => p.split(/[\\/]/).filter(Boolean)

// 展示名：文件名（去 .xk）+ 从父目录向上 k 级目录链（k=0 不带目录）
const displayOf = (p, k) => {
  const segs = segmentsOf(p)
  const name = (segs[segs.length - 1] || p).replace(/\.xk$/, '')
  const dirs = segs.slice(Math.max(0, segs.length - 1 - k), segs.length - 1)
  return dirs.length ? `${name} — ${dirs.join(sep)}` : name
}

/**
 * 由 openedFiles 登记簿快照计算各窗口标题。
 * 同 basename（含扩展名）组内唯一显示纯文件名；组内多个时迭代加深目录链
 * （展示名仍冲突的成员 k+1）直至互不相同——不同绝对路径必在有限层内区分，
 * 循环必然终止。返回 Map<webContentsId, '文件名[ — 目录链] — XKnowledge'>。
 */
export const computeTitles = (entries) => {
  const groups = new Map()
  for (const e of entries) {
    const segs = segmentsOf(e.path)
    const base = segs[segs.length - 1] || e.path
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base).push({ ...e, k: 0 })
  }

  const titles = new Map()
  for (const group of groups.values()) {
    if (group.length === 1) {
      titles.set(group[0].webContentsId, `${displayOf(group[0].path, 0)} — ${DEFAULT_TITLE}`)
      continue
    }
    for (const m of group) m.k = 1
    for (;;) {
      const names = group.map((m) => displayOf(m.path, m.k))
      const dup = new Set(names.filter((n, i) => names.indexOf(n) !== i))
      if (dup.size === 0) break
      group.forEach((m, i) => {
        if (dup.has(names[i])) m.k++
      })
    }
    for (const m of group) {
      titles.set(m.webContentsId, `${displayOf(m.path, m.k)} — ${DEFAULT_TITLE}`)
    }
  }
  return titles
}
