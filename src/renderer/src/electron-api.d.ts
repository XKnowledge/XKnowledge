/**
 * preload 暴露的渲染进程 IPC 契约（与 src/preload/index.js 一一对应；
 * 返回形状按 src/main/ipc.js 的 handler 实际返回登记）。
 * 请求-响应走 invoke（主进程失败时 reject）；主进程推送有三个：
 * onRequestClose / onTitleChanged / onMaximizeChanged，均返回解绑函数，
 * 组件卸载时必须调用，否则监听器随挂载次数叠加。
 */
import type { Stitch, WorldGraphCard } from './utils/worldGraph'

/** 保存类 invoke 的返回：用户取消（canceled，无 path）或成功（path 为最终落盘路径）；失败经 reject */
export interface SaveResult {
  canceled?: boolean
  path?: string
}

/** 图库卡片元数据（listExamples 产物，prebuild 生成的 examples.manifest.json） */
export interface ExampleCardMeta {
  title: string
  fileName: string
  description?: string
  categories?: string[]
}

/** 世界索引项（跨库同名可搜索单位，归属某图） */
export interface WorldIndexNode {
  graphId: string
  name?: string
  des?: string
  category?: string
}

/** 世界索引（worldLoadIndex 产物） */
export interface WorldIndex {
  graphs: WorldGraphCard[]
  nodes: WorldIndexNode[]
  stitches: Stitch[]
  brokenCount: number
  userDir: string | null
}

export interface ElectronApi {
  /** 打开对话框并读取：取消 { canceled }；同文件已在别窗打开 { alreadyOpen }（已聚焦该窗）；
   *  示例文件 path 置空走副本语义（保存必弹另存）。返回形状按分支互斥，调用方渐进判属性 */
  openFile(): Promise<{ canceled?: boolean; alreadyOpen?: boolean; content?: string; path?: string }>
  /** 装载/换文件上报（path 为空表示未命名）：主进程登记簿 + 标题联动 */
  fileOpened(payload: { path: string }): Promise<{ ok: true }>
  /** 未保存状态上报（窗口标题圆点） */
  fileDirty(payload: { dirty: boolean }): Promise<{ ok: true }>
  listExamples(): Promise<{ examples: ExampleCardMeta[] }>
  /** 打开示例（非法文件名/读取损坏经 reject） */
  openExample(payload: { fileName: string }): Promise<{ content: string }>
  saveFile(payload: { path: string; content: string }): Promise<SaveResult>
  saveFileAs(payload: { content: string }): Promise<SaveResult>
  saveVideoFile(payload: { bytes: Uint8Array; defaultName: string; ext: string }): Promise<SaveResult>
  exportHtmlFile(payload: { data: string; defaultName: string }): Promise<SaveResult>
  /** 系统剪贴板读写（序列化/解析在渲染层走 shared/graphClipboard） */
  writeGraphClipboard(text: string): Promise<void>
  readGraphClipboard(): Promise<{ text: string }>
  newChartWindow(payload: { content: string; path: string }): Promise<{ ok: true }>
  /** 领取待打开图表（世界域「在图表页打开」）：无待开返回 null */
  takePendingChart(): Promise<{ content: string; path: string } | null>
  enterChartMode(): Promise<{ ok: true }>
  exitChartMode(): Promise<{ ok: true }>
  enterWorldMode(): Promise<{ ok: true }>
  exitWorldMode(): Promise<{ ok: true }>
  closeWindow(): Promise<{ ok: true }>
  /** 未保存确认（模态于触发窗口）：保存/放弃/取消 */
  confirmUnsaved(): Promise<'save' | 'discard' | 'cancel'>
  themeApplied(payload: { mode: string; effective: string }): Promise<{ ok: true }>
  localeApplied(payload: { locale: string }): Promise<{ ok: true }>
  worldLoadIndex(): Promise<WorldIndex>
  worldReadGraph(id: string): Promise<{ content: string }>
  /** 重设世界库目录（'pick' 弹目录选择框） */
  worldSetUserDir(dir: string): Promise<{ ok: boolean; userDir?: string | null }>
  /** process.platform（macOS 隐藏自绘关闭钮等平台分流用） */
  platform: string
  minimizeWindow(): Promise<{ ok: true }>
  toggleMaximizeWindow(): Promise<{ ok: true }>
  /** 走 close()：图表页的未保存确认拦截照常生效 */
  closeWindowRequest(): Promise<{ ok: true }>
  onRequestClose(callback: () => void): () => void
  onTitleChanged(callback: (title: string) => void): () => void
  onMaximizeChanged(callback: (maximized: boolean) => void): () => void
}

declare global {
  interface Window {
    electronAPI: ElectronApi
  }
}
