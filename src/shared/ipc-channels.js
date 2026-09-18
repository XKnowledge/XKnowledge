/**
 * IPC 通道名单一处定义：主进程（src/main）与 preload 共同引用。
 * 业务代码禁止书写裸通道字符串，一律从本模块导入。
 * 命名约定：<域>:<动作>；各通道的参数与返回值以调用处（src/main 与 preload）为准。
 */
export const IPC = {
  // 文件域
  FILE_OPEN: 'file:open',
  FILE_OPENED: 'file:opened',
  FILE_SAVE: 'file:save',
  FILE_SAVE_AS: 'file:save-as',

  // 内置示例域（examples/ 目录即图库）
  EXAMPLE_LIST: 'example:list',
  EXAMPLE_OPEN: 'example:open',

  // 应用/窗口域
  APP_NEW_CHART_WINDOW: 'app:new-chart-window',
  APP_TAKE_PENDING_CHART: 'app:take-pending-chart',
  APP_ENTER_CHART_MODE: 'app:enter-chart-mode',
  APP_EXIT_CHART_MODE: 'app:exit-chart-mode',
  APP_CLOSE_WINDOW: 'app:close-window',
  APP_CONFIRM_UNSAVED: 'app:confirm-unsaved',
  APP_REQUEST_CLOSE: 'app:request-close'
}
