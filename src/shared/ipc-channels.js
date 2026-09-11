/**
 * IPC 通道名单一处定义：主进程（src/main）与 preload 共同引用。
 * 业务代码禁止书写裸通道字符串，一律从本模块导入。
 * 命名约定：<域>:<动作>；各通道的参数与返回值约定见
 * docs/superpowers/specs/2026-09-11-ipc-refactor-design.md 的通道契约表。
 */
export const IPC = {
  // 文件域
  FILE_OPEN: 'file:open',
  FILE_SAVE: 'file:save',
  FILE_SAVE_AS: 'file:save-as',

  // 应用/窗口域
  APP_NEW_CHART_WINDOW: 'app:new-chart-window',
  APP_TAKE_PENDING_CHART: 'app:take-pending-chart',
  APP_ENTER_CHART_MODE: 'app:enter-chart-mode',
  APP_CLOSE_WINDOW: 'app:close-window',
  APP_CONFIRM_UNSAVED: 'app:confirm-unsaved',
  APP_REQUEST_CLOSE: 'app:request-close'
}
