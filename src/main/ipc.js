import { BrowserWindow, clipboard, dialog, ipcMain, webContents } from 'electron'
import * as fileService from './fileService'
import { listExamples, openExample } from './exampleService'
import * as worldIndex from './worldIndex'
import { isExamplePath } from './examplePaths'
import {
  applyTheme,
  createChartWindow,
  enterChartMode,
  exitChartMode,
  enterWorldMode,
  exitWorldMode,
  takePendingChart,
  setRecordingLock,
  setWindowTitle
} from './windowManager'
import { computeTitles, composeWindowTitles } from './titleService'
import { saveHtmlFile } from './exportHtml'
import { setCurrentLocale, t } from './i18nMain'
import { IPC } from '../shared/ipc-channels'

/**
 * sender 对应窗口可能已销毁（invoke 执行瞬间用户恰好关窗），
 * fromWebContents 返回 null。dialog 的 parent 参数接受 undefined
 * （表示不绑定父窗口），enterChartMode/exitChartMode 内部自行判空。
 */
const senderWindow = (event) => BrowserWindow.fromWebContents(event.sender) ?? undefined

/**
 * 已装载文件的登记簿：文件路径 -> 装载它的窗口 webContents.id。
 * 用于"打开同一文件时聚焦已有窗口，不再重复开窗"。渲染端在装载文件
 * 与保存/另存换路径后经 file:opened 上报，窗口 closed 时自动清理。
 */
const openedFiles = new Map()

/**
 * 有未保存修改的窗口：webContents.id 集合。渲染端翻转 saveNodeVisible 时经
 * file:dirty 上报维护；file:opened 上报（含空路径）重置——装载即干净；
 * 窗口 closed 时随登记簿一并清理（未命名窗口同样挂 closed 监听）。
 */
const dirtyWindows = new Set()

// 已挂 closed 清理监听器的窗口。渲染端在装载文件与每次保存/另存成功后都会
// 上报 file:opened，若每次都新注册 once('closed') 会在长会话下无上限累积
// （MaxListenersExceededWarning），故每个窗口只挂一个，关闭时清其全部记录。
const cleanupAttached = new WeakSet()

/**
 * 登记簿里的 id 是 webContents.id（见 openedFiles/dirtyWindows 说明），而
 * BrowserWindow.fromId 收的是 BrowserWindow id——两套计数器彼此独立
 * （Electron 文档分列，且 dev 模式 detach 的 DevTools 只占 webContents id），
 * 直接互查会返回 null（标题静默不更新）或命中无关窗口。统一经这一层解析。
 */
const windowByWebContentsId = (id) => {
  const wc = webContents.fromId(id)
  return wc ? BrowserWindow.fromWebContents(wc) : null
}

/**
 * 按 openedFiles 登记簿重算所有已登记窗口的标题（setWindowTitle：任务栏 +
 * 渲染端自绘标题栏同步）。同名文件的开/关/换名都要联动（后来者补目录链、
 * 冲突解除恢复短名），故登记变化处（file:opened 与 closed 清理）统一走这里。
 * fromId 为空或窗口已销毁时 setWindowTitle 自行跳过——登记清理依赖 closed
 * 事件，重算发生在窗口销毁竞态窗口期是正常的。
 */
const refreshTitles = () => {
  const entries = [...openedFiles].map(([path, webContentsId]) => ({
    path,
    webContentsId,
    dirty: dirtyWindows.has(webContentsId)
  }))
  for (const [id, titles] of computeTitles(entries)) {
    setWindowTitle(windowByWebContentsId(id), titles.display, titles.taskbar)
  }
}

export const registerIpc = () => {
  ipcMain.handle(IPC.FILE_SAVE, async (event, { path, content }) => {
    // 示例文件永不写回：path 指向 examples 内时视同无路径，弹另存让用户存副本
    if (!path || isExamplePath(path)) {
      return fileService.saveChartFileAs(senderWindow(event), content, t('dialog.saveTo'))
    }
    return fileService.writeChartFile(path, content)
  })

  ipcMain.handle(IPC.FILE_SAVE_AS, async (event, { content }) => {
    return fileService.saveChartFileAs(senderWindow(event), content, t('dialog.saveAsTo'))
  })

  ipcMain.handle(IPC.VIDEO_SAVE, (event, { bytes, defaultName, ext }) =>
    // 渲染层传 Uint8Array（结构化克隆），转 Buffer 后写盘
    fileService.saveVideoFile(senderWindow(event), Buffer.from(bytes), defaultName, ext)
  )

  ipcMain.handle(IPC.EXPORT_HTML_SAVE, (event, payload) =>
    // 一次性导出产物：读 viewer 模板拼装（数据注入）后弹保存框写盘
    saveHtmlFile(senderWindow(event), payload)
  )

  // 剪贴板透传：序列化/解析在渲染层走 shared/graphClipboard，主进程只做
  // 系统剪贴板读写。Electron 44 的 clipboard API 是异步的（readText 返回
  // Promise）：handler 必须 await 后返回纯值——同步返回 { text: Promise }
  // 会在结构化克隆时失败，渲染端 invoke 永久挂起（不 reject）。writeText
  // 同样 await：连续写后立即读的竞态下保证读到新值
  ipcMain.handle(IPC.CLIPBOARD_WRITE_GRAPH, async (_event, { text }) => {
    await clipboard.writeText(typeof text === 'string' ? text : '')
  })

  ipcMain.handle(IPC.CLIPBOARD_READ_GRAPH, async () => ({ text: await clipboard.readText() }))

  ipcMain.handle(IPC.FILE_OPEN, async (event) => {
    const res = await fileService.showOpenDialog(senderWindow(event))
    if (res.canceled) return { canceled: true }
    const path = res.filePaths[0]

    // 同一文件已在某窗口打开：把该窗口提到最上层，不再重复装载。
    // show + focus 组合对付 Windows 前台锁定（单独 focus 可能只闪任务栏）。
    // 持有者按 webContents id 登记，解析必须同空间——混用会聚焦到无关
    // 窗口并返回 alreadyOpen，用户选的文件永远打不开
    const holderId = openedFiles.get(path)
    if (holderId !== undefined) {
      const holder = windowByWebContentsId(holderId)
      if (holder && !holder.isDestroyed()) {
        if (holder.isMinimized()) holder.restore()
        holder.show()
        holder.focus()
        return { alreadyOpen: true }
      }
      openedFiles.delete(path) // 记录指向已销毁窗口，清掉
    }

    // readChartFile 失败时 throw，经 invoke 自动变为渲染端 reject
    const read = await fileService.readChartFile(path)
    // 用户经"打开文件"对话框打开了 examples 内的示例：视同图库打开，
    // 置空 path 走副本语义，保存必弹"另存为"（示例永不被写坏）
    if (isExamplePath(path)) {
      return { content: read.content, path: '' }
    }
    return read
  })

  ipcMain.handle(IPC.FILE_OPENED, (event, payload) => {
    // path 防御性归一：truthy 非字符串被当 Map 键存下会毒化登记簿——
    // refreshTitles → segmentsOf 的 p.split 直接抛错，此后任何窗口的任何
    // 标题更新全炸；无 payload 的裸调用（解构即抛）同样归一为未命名上报
    const path = typeof payload?.path === 'string' ? payload.path : ''
    const id = event.sender.id
    // 装载/换文件即干净：防「关闭文件回首页、同窗口再开新文件」残留旧圆点
    dirtyWindows.delete(id)
    // 一个窗口同时只编辑一个文件：清掉本窗口的其他文件记录
    // （另存为换路径后旧文件不应再聚焦到本窗口）
    for (const [recorded, holderId] of openedFiles) {
      if (holderId === id && recorded !== path) openedFiles.delete(recorded)
    }
    if (path) {
      openedFiles.set(path, id)
    }
    // closed 清理对未命名窗口同样注册（它们没有 path，dirty 条目一样要清，
    // 否则死 id 堆积到进程退出）；去重经 cleanupAttached
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !cleanupAttached.has(win)) {
      cleanupAttached.add(win)
      win.once('closed', () => {
        // 清掉本窗口登记的全部记录（换文件后旧记录已即时清过，正常只有一条；
        // 按窗口 id 而非按 path 判断，别的窗口覆盖登记的文件不受影响）
        for (const [recorded, holderId] of openedFiles) {
          if (holderId === id) openedFiles.delete(recorded)
        }
        dirtyWindows.delete(id)
        // 本窗口关闭后，与其同名的其他窗口可恢复短标题
        refreshTitles()
      })
    }
    // 有路径与空路径上报都重算：登记变化可能影响其他同名窗口的标题
    refreshTitles()
    return { ok: true }
  })

  ipcMain.handle(IPC.FILE_DIRTY, (event, { dirty }) => {
    const id = event.sender.id
    dirty ? dirtyWindows.add(id) : dirtyWindows.delete(id)
    const registered = [...openedFiles.values()].includes(id)
    if (registered) {
      // 有文件登记：走登记簿统一重算（同名窗口联动）
      refreshTitles()
    } else {
      // 未命名窗口没有登记项：直接设未命名标题（干净/带圆点）
      const { display, taskbar } = composeWindowTitles(t('common.untitled'), !!dirty)
      setWindowTitle(BrowserWindow.fromWebContents(event.sender), display, taskbar)
    }
    return { ok: true }
  })

  ipcMain.handle(IPC.EXAMPLE_LIST, async () => ({ examples: await listExamples() }))

  // openExample 失败时 throw（非法文件名/读取损坏），经 invoke 变为渲染端
  // reject，由渲染端按固定文案提示
  ipcMain.handle(IPC.EXAMPLE_OPEN, (event, { fileName }) => openExample(fileName))

  ipcMain.handle(IPC.APP_CLOSE_WINDOW, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.destroy()
    return { ok: true }
  })

  // ===== 自绘窗口控制按钮（XkWindowControls）=====
  // 最小化/最大化切换为直接动作；关闭请求走 close()：图表页的
  // 「未保存确认」拦截（enterChartMode 注册的 close 监听）照常生效，
  // 与移除前的原生 titleBarOverlay X 按钮行为等价
  ipcMain.handle(IPC.APP_WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_WINDOW_MAXIMIZE_TOGGLE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { ok: true }
    // 尺寸冻结期间（录制锁/首页锁）不切换：isResizable 即冻结态
    if (!win.isResizable()) return { ok: true }
    win.isMaximized() ? win.unmaximize() : win.maximize()
    return { ok: true }
  })

  // 录制期间冻结窗口尺寸：渲染层录制状态机（XkGraph3D）在开录/收尾对称
  // 调用。payload 缺省的 invoke 在解构 undefined 时会抛 TypeError（转为
  // invoke 拒绝、被渲染层 catch 吞掉无症状），防御性归一
  ipcMain.handle(IPC.APP_RECORDING_LOCK, (event, payload) => {
    setRecordingLock(BrowserWindow.fromWebContents(event.sender), !!payload?.lock)
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_CLOSE_WINDOW_REQUEST, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_ENTER_CHART_MODE, (event) => {
    enterChartMode(BrowserWindow.fromWebContents(event.sender))
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_EXIT_CHART_MODE, (event) => {
    exitChartMode(BrowserWindow.fromWebContents(event.sender))
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_ENTER_WORLD_MODE, (event) => {
    enterWorldMode(BrowserWindow.fromWebContents(event.sender))
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_EXIT_WORLD_MODE, (event) => {
    exitWorldMode(BrowserWindow.fromWebContents(event.sender))
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_NEW_CHART_WINDOW, (event, { content, path }) => {
    createChartWindow({ content, path })
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_TAKE_PENDING_CHART, (event) => {
    // takePendingChart 返回 { content, path } 或 null，原样透传
    // （不得再包一层，否则渲染端拿到的 content 是对象而非 JSON 文本）
    return takePendingChart(event.sender.id)
  })

  ipcMain.handle(IPC.APP_CONFIRM_UNSAVED, async (event) => {
    // 绑定父窗口使确认框模态于触发窗口：多窗口并排时避免用户在
    // A 窗口的确认框上误关掉 B 窗口的修改
    const { response } = await dialog.showMessageBox(senderWindow(event), {
      type: 'info',
      title: t('dialog.confirmExit'),
      message: t('dialog.unsavedExit'),
      buttons: [t('common.save'), t('common.discard'), t('common.cancel')],
      cancelId: 2 // 直接关闭提示框视为"取消"
    })
    return ['save', 'discard', 'cancel'][response]
  })

  ipcMain.handle(IPC.APP_THEME_APPLIED, (event, payload) => {
    applyTheme(payload)
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_LOCALE_APPLIED, (event, { locale } = {}) => {
    setCurrentLocale(locale)
    refreshTitles() // 已登记窗口标题重算（「未命名」等语言相关）
    return { ok: true }
  })

  // 世界域：主进程 throw（路径拒绝/读取损坏）经 invoke 自动变渲染端 reject
  ipcMain.handle(IPC.WORLD_LOAD_INDEX, () => worldIndex.loadWorldIndex())
  ipcMain.handle(IPC.WORLD_READ_GRAPH, (event, { id }) => worldIndex.readWorldGraph(id))
  ipcMain.handle(IPC.WORLD_SET_USER_DIR, (event, { dir }) =>
    worldIndex.setWorldUserDir(dir, senderWindow(event))
  )
}
