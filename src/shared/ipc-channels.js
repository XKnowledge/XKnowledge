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
  FILE_DIRTY: 'file:dirty',

  // 内置示例域（examples/ 目录即图库）
  EXAMPLE_LIST: 'example:list',
  EXAMPLE_OPEN: 'example:open',

  // 应用/窗口域
  APP_NEW_CHART_WINDOW: 'app:new-chart-window',
  APP_TAKE_PENDING_CHART: 'app:take-pending-chart',
  APP_ENTER_CHART_MODE: 'app:enter-chart-mode',
  APP_EXIT_CHART_MODE: 'app:exit-chart-mode',
  APP_ENTER_WORLD_MODE: 'app:enter-world-mode',
  APP_EXIT_WORLD_MODE: 'app:exit-world-mode',
  APP_CLOSE_WINDOW: 'app:close-window',
  APP_CONFIRM_UNSAVED: 'app:confirm-unsaved',
  APP_REQUEST_CLOSE: 'app:request-close',
  APP_TITLE_CHANGED: 'app:title-changed',
  APP_THEME_APPLIED: 'app:theme-applied',
  APP_OVERLAY_DIM: 'app:overlay-dim',

  // 世界域（分层聚合世界树：只读派生视图）
  WORLD_LOAD_INDEX: 'world:load-index',
  WORLD_READ_GRAPH: 'world:read-graph',
  WORLD_SET_USER_DIR: 'world:set-user-dir'
}
