import { BrowserWindow, Menu, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { DEFAULT_TITLE, UNTITLED_TITLE } from './titleService'
import { IPC } from '../shared/ipc-channels'

// 会话内最近生效主题：新窗口 backgroundColor 预设依据
let lastEffectiveTheme = 'light'

/** 深浅两套原生标题栏（Windows titleBarOverlay）配色，浅色套与创建时配置一致 */
const OVERLAY_COLORS = {
  light: { color: '#ffffff', symbolColor: '#74b1be' },
  dark: { color: '#141414', symbolColor: '#a1a8b0' }
}

/** 单窗口应用：换原生标题栏配色；平台不支持时静默 */
const applyThemeToWindow = (win) => {
  if (!win || win.isDestroyed()) return
  try {
    win.setTitleBarOverlay(OVERLAY_COLORS[lastEffectiveTheme])
  } catch {
    /* Linux 无此 API：渲染层主题不受影响 */
  }
}

/**
 * 渲染层上报主题变化后统一应用：
 * - nativeTheme.themeSource：auto→system、强制模式直译。渲染层
 *   prefers-color-scheme 媒体查询与原生部件（右键菜单等）随之一致，
 *   主题模块只需监听 matchMedia 一个信号源
 * - 全部窗口的原生标题栏配色
 * - 缓存生效主题，供新窗口 backgroundColor 预设
 */
export const applyTheme = ({ mode: themeMode, effective }) => {
  lastEffectiveTheme = effective === 'dark' ? 'dark' : 'light'
  nativeTheme.themeSource =
    themeMode === 'dark' ? 'dark' : themeMode === 'light' ? 'light' : 'system'
  for (const win of BrowserWindow.getAllWindows()) applyThemeToWindow(win)
}

/**
 * 创建应用主窗口。onWindowClosed 在窗口销毁时回调（webContents.id 作参数），
 * 供 ipc 层清理按窗口记录的状态。
 */
export const createWindow = (onWindowClosed, route = '') => {
  const current_window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    resizable: false, // 不允许用户调整窗口大小
    maximizable: false, // 禁止最大化
    minimizable: false, // 禁止最小化
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      webviewTag: false, // 禁用 webview 标签
      // preload 只使用 contextBridge/ipcRenderer，沙箱模式下完全可用，
      // 保持默认开启以缩小攻击面（Electron 安全清单建议）
      sandbox: true
      // 注意：webPreferences 没有 accelerator 键，此前在此禁用 Ctrl+R 的
      // 配置从未生效，刷新拦截改由下方 before-input-event 实现
    },
    trafficLightPosition: { x: 20, y: 18 },
    autoHideMenuBar: true,
    // 会话内已切深色时新窗口预铺深底避免闪白；重启后主进程未知（偏好存
    // 渲染层 localStorage），首窗口白底一帧，已接受的取舍（见设计文档）
    backgroundColor: lastEffectiveTheme === 'dark' ? '#141414' : '#ffffff',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#74b1be'
    },
    title: 'XKnowledge'
  })
  Menu.setApplicationMenu(null)

  // 窗口销毁后通知调用方清理其按窗口记录的状态，避免Map持续增长。
  // 注意：closed 事件触发时 webContents 已销毁，届时再读 .id 会抛
  // "Object has been destroyed"，因此必须在创建时先捕获 id。
  const webContentsId = current_window.webContents.id
  current_window.on('closed', () => {
    if (onWindowClosed) onWindowClosed(webContentsId)
  })

  current_window.on('ready-to-show', () => {
    current_window.show()
  })

  // 控制台只在开发模式打开：生产环境弹出 DevTools 会暴露 IPC 桥接接口
  if (process.env['ELECTRON_RENDERER_URL']) {
    current_window.webContents.openDevTools({ mode: 'detach' })
  }

  // 禁止刷新（Ctrl+R / Ctrl+Shift+R / Ctrl+F5 / F5）：图表窗口的
  // pending-chart 数据取后即清，刷新页面会让图表内容直接丢失且无提示
  current_window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    const isRefresh = key === 'f5' || ((input.control || input.meta) && key === 'r')
    if (isRefresh) event.preventDefault()
  })

  /*
  设置窗口打开行为的处理程序。
  当在应用程序中点击某些链接时，会触发打开新窗口的行为。
  这里的代码是告诉 Electron 当有新窗口打开请求时，使用默认的浏览器打开这个链接，并返回 { action: 'deny' } 来阻止 Electron 打开新窗口。
  仅放行 http/https：其他协议（file:、smb:、ms-settings: 等）交给系统
  默认处理器会成为攻击入口。
  */
  current_window.webContents.setWindowOpenHandler((details) => {
    try {
      const { protocol } = new URL(details.url)
      if (protocol === 'http:' || protocol === 'https:') {
        shell.openExternal(details.url).catch(() => {}) // 无关联处理器时避免 unhandled rejection
      }
    } catch {
      // 无效 URL，忽略
    }
    return { action: 'deny' }
  })

  /*
  在基于 electron-vite CLI 的渲染器热模块替换。
  在开发时加载远程 URL，或在生产时加载本地 HTML 文件。
  */
  if (process.env['ELECTRON_RENDERER_URL']) {
    // 注意：Electron 28 的 loadURL 不支持 { hash } 选项（仅 loadFile 支持），
    // dev 模式下需手动拼接 hash 才能直达对应路由。
    if (route) {
      current_window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${route}`)
    } else {
      current_window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    }
  } else {
    const loadOptions = route ? { hash: route } : undefined
    current_window.loadFile(join(__dirname, '../renderer/index.html'), loadOptions)
  }

  return current_window
}

// 新窗口待装载的图表数据：webContents.id -> content（窗口closed时清理）
const pendingCharts = new Map()

/**
 * 为新窗口暂存图表数据，渲染端通过 take-pending-chart 通道取走（取后即清）。
 * 仅 createChartWindow 使用，不对外导出。
 */
const stashPendingChart = (webContentsId, content) => {
  pendingCharts.set(webContentsId, content)
}

export const takePendingChart = (webContentsId) => {
  const content = pendingCharts.get(webContentsId) ?? null
  pendingCharts.delete(webContentsId)
  return content
}

/**
 * 创建图表窗口：直接加载 #/chart 路由并暂存待装载数据。
 * content 为图表 JSON 文本，path 为来源文件路径（新图表为 ''），
 * 传入 path 使新窗口的保存直接写回原文件而非另存为。
 * chartModeWindows 的清理由 enterChartMode 自行注册的 closed 钩子负责，
 * 这里只清 pendingCharts。
 */
export const createChartWindow = ({ content, path = '' }) => {
  const new_window = createWindow((webContentsId) => {
    pendingCharts.delete(webContentsId)
  }, 'chart')
  stashPendingChart(new_window.webContents.id, { content, path })
  return new_window
}

// 已进入图表模式的窗口：id -> 事件处理器引用（退出时需 removeListener）。
// 保证解锁与 close 拦截只注册一次。
const chartModeWindows = new Map()

/**
 * 解锁窗口尺寸：图表页与世界树页共用（放开最大化/最小化/缩放，
 * 最小尺寸基线与创建时默认尺寸一致）。
 */
const unlockSizing = (current_window) => {
  current_window.setMaximizable(true)
  current_window.setMinimizable(true)
  current_window.setResizable(true)
  current_window.setMinimumSize(900, 670)
}

/**
 * 锁回窗口尺寸，与 unlockSizing 对称：取消最大化、回退最小尺寸、
 * 恢复默认 900x670。unmaximize 对非最大化窗口是无害空操作，
 * 无须条件判断；必须先 unmaximize 再 setSize（最大化中的窗口
 * 直接 setSize 不生效）。
 */
const lockSizing = (current_window) => {
  current_window.setMaximizable(false)
  current_window.setMinimizable(false)
  current_window.setResizable(false)
  current_window.unmaximize()
  current_window.setMinimumSize(0, 0)
  current_window.setSize(900, 670)
}

/**
 * 设置窗口标题并同步推送渲染端自绘标题栏。两个字符串分工：setTitle 只影响
 * 任务栏/Alt-Tab（titleBarOverlay 仅绘制窗口控制按钮，不画标题文字），
 * 应用内标题条由 BasicLayout 订阅 app:title-changed 渲染——未保存圆点在
 * 两处位置不同（标题条在文件名后、任务栏在标题前），故拆双参；单参调用
 * （默认/未命名/恢复标题）两值天然一致。判销毁：close 竞态下 win 或
 * webContents 可能已销毁。
 */
export const setWindowTitle = (win, display, taskbar = display) => {
  if (!win || win.isDestroyed()) return
  win.setTitle(taskbar)
  if (win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send(IPC.APP_TITLE_CHANGED, display)
  }
}

/**
 * 进入图表模式：解锁窗口尺寸限制，并注册"关闭前确认"拦截。
 * 由图表页挂载时 invoke app:enter-chart-mode 触发；幂等。
 * 与 exitChartMode 对称，图表页卸载（同窗口跳回其他页面）时调用。
 */
export const enterChartMode = (current_window) => {
  if (!current_window) return // sender 窗口已销毁（见 ipc.js senderWindow 说明）
  const { id } = current_window
  if (chartModeWindows.has(id)) return

  const closeHandler = (e) => {
    e.preventDefault() //先阻止一下默认行为，不然直接关了，提示框只会闪一下
    current_window.webContents.send(IPC.APP_REQUEST_CLOSE)
  }
  const closedHandler = () => chartModeWindows.delete(id)
  // 渲染进程崩溃后无人响应 request-close，不解除拦截会导致窗口永远关不掉
  const goneHandler = () => {
    current_window.removeListener('close', closeHandler)
    chartModeWindows.delete(id)
  }
  // 渲染进程假死（JS 死循环等）同样无人响应 request-close：解除拦截让
  // 用户点 X 能直接关掉；恢复响应后重新启用关闭确认（同一函数引用，
  // EventEmitter 对重复注册同一引用会去重，天然幂等）
  const unresponsiveHandler = () => {
    current_window.removeListener('close', closeHandler)
  }
  const responsiveHandler = () => {
    current_window.on('close', closeHandler)
  }

  chartModeWindows.set(id, {
    closeHandler,
    closedHandler,
    goneHandler,
    unresponsiveHandler,
    responsiveHandler
  })

  unlockSizing(current_window)
  // 进图表页先给默认标题；装载/保存上报路径后由 ipc 层按登记簿覆盖为文件名。
  // 放这里而非渲染端：标题消歧需要跨窗口全局视角
  setWindowTitle(current_window, UNTITLED_TITLE)

  current_window.on('close', closeHandler)
  current_window.on('closed', closedHandler)
  current_window.on('render-process-gone', goneHandler)
  current_window.on('unresponsive', unresponsiveHandler)
  current_window.on('responsive', responsiveHandler)
}

/**
 * 退出图表模式：解除"关闭前确认"拦截并恢复窗口锁定，与 enterChartMode 对称。
 * 由图表页卸载时 invoke app:exit-chart-mode 触发；未在图表模式时为空操作。
 */
export const exitChartMode = (current_window) => {
  if (!current_window || current_window.isDestroyed()) return
  const { id } = current_window
  const handlers = chartModeWindows.get(id)
  if (!handlers) return

  current_window.removeListener('close', handlers.closeHandler)
  current_window.removeListener('closed', handlers.closedHandler)
  current_window.removeListener('render-process-gone', handlers.goneHandler)
  current_window.removeListener('unresponsive', handlers.unresponsiveHandler)
  current_window.removeListener('responsive', handlers.responsiveHandler)
  chartModeWindows.delete(id)

  lockSizing(current_window)
  // 与 enterChartMode 的标题设置对称：图表页卸载（回首页/关窗）恢复默认标题
  setWindowTitle(current_window, DEFAULT_TITLE)
}

// 已进入世界树模式的窗口：id -> closed 清理器（退出时移除）
const worldModeWindows = new Map()

/**
 * 进入世界树模式：仅解锁窗口尺寸（世界页是只读派生视图，无未保存态，
 * 故不注册「关闭前确认」拦截，也不改窗口标题——与 enterChartMode 的
 * 两点差异）。由世界页挂载时 invoke app:enter-world-mode 触发；幂等。
 */
export const enterWorldMode = (current_window) => {
  if (!current_window) return // sender 窗口已销毁（见 ipc.js senderWindow 说明）
  const { id } = current_window
  if (worldModeWindows.has(id)) return
  const closedHandler = () => worldModeWindows.delete(id)
  worldModeWindows.set(id, { closedHandler })
  current_window.on('closed', closedHandler)
  unlockSizing(current_window)
}

/**
 * 退出世界树模式：恢复窗口锁定，与 enterWorldMode 对称。
 * 由世界页卸载时 invoke app:exit-world-mode 触发；未在世界树模式时为空操作。
 */
export const exitWorldMode = (current_window) => {
  if (!current_window || current_window.isDestroyed()) return
  const { id } = current_window
  const handlers = worldModeWindows.get(id)
  if (!handlers) return
  current_window.removeListener('closed', handlers.closedHandler)
  worldModeWindows.delete(id)
  lockSizing(current_window)
}
