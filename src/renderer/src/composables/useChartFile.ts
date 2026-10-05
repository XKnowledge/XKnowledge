import { ref, watch, type Ref } from 'vue'
import { message } from 'ant-design-vue'
import { locale } from '../store/localeStore.js'
import { t } from '../i18n.js'
import type { ChartData } from '../utils/graphData'

/** 路由的最小形状（closeFile 跳回首页用；useRouter() 代理结构满足） */
interface RouterLike {
  push: (to: string) => void
}

export interface UseChartFileOptions {
  /** 图谱文档数据（读 chartData 序列化落盘） */
  chartData: Ref<ChartData | null>
  /** 未保存标记（编排层单一持有，本模块只读 + 保存成功后清零） */
  saveNodeVisible: Ref<boolean>
  /** 路由（关闭文件跳回首页） */
  router: RouterLike
  /** 手动保存/另存成功后的 UI 重置（编排层的 resetSider/resetRefData） */
  resetSider: () => void
  resetRefData: () => void
}

/**
 * 文件生命周期：落盘/另存/打开/关闭、自动保存门控、窗口关闭确认与
 * 未保存状态上报。装载广播（initAttr/聚焦重置/搜索关闭等）属编排层
 * （loadChartData），本模块只提供 registerOpenedFile 维护文件身份。
 * persistFile 是无 UI 副作用的纯保存层（自动保存共用）；saveFile/saveAs
 * 在其上叠加用户主动动作预期的面板重置。
 */
export function useChartFile({
  chartData,
  saveNodeVisible,
  router,
  resetSider,
  resetRefData
}: UseChartFileOptions) {
  const filePath = ref('')
  // 图库名（示例副本无 path 时的显示名；见 loadChartData 的 name 登记）
  const chartName = ref('')
  // 文件冲突后暂停自动保存，避免每分钟重复报错
  const autoSaveSuspended = ref(false)

  let autoSaveTimer: ReturnType<typeof setInterval> | null = null
  let offRequestClose: (() => void) | null = null

  // 未保存状态上报主进程：窗口标题加/去圆点（标题条文件名后、任务栏标题前）。
  // 现有置位/清零点（编辑、属性开关、保存、另存、装载）全部照旧翻转
  // saveNodeVisible，这里统一上报；红条警示已删，标题圆点是唯一未保存提示
  watch(saveNodeVisible, (v) => {
    window.electronAPI.fileDirty({ dirty: v }).catch((err) => {
      console.error('未保存状态上报失败', err)
    })
  })

  // 语言切换重报当前未保存状态：主进程 refreshTitles 只覆盖已登记文件窗口，
  // 未命名窗口（无登记项）靠这条重报走 file:dirty 的未命名标题分支，
  // 「未保存圆点 + 新语言标题」才能即时刷新（与 dirty 翻转共用同一条管道）
  watch(locale, () => {
    window.electronAPI.fileDirty({ dirty: saveNodeVisible.value }).catch((err) => {
      console.error('未保存状态上报失败', err)
    })
  })

  /** 装载/换图后维护文件身份并向主进程登记（path 为空表示未命名，只清不登） */
  const registerOpenedFile = (path: string, name?: unknown) => {
    filePath.value = path
    // 图库名（示例副本 path 为空时唯一可用的图名，导出 HTML 标题用）；
    // 打开本地文件/另存后有 filePath，标题以文件名优先
    chartName.value = typeof name === 'string' ? name : ''
    window.electronAPI.fileOpened({ path }).catch((err) => {
      console.error('登记文件打开状态失败', err)
    })
  }

  /** 保存核心层：写盘 + 路径/登记/脏标记维护与错误处理，无任何 UI 重置
   *  副作用。60 秒自动保存与手动保存共用——后台保存必须隐形，清表单/
   *  跳属性页会打断正在编辑的用户。返回是否保存成功。 */
  const persistFile = async (): Promise<boolean> => {
    if (!chartData.value) {
      // 装载失败的窗口没有可保存内容，禁止把字面量 "null" 写成损坏文件
      message.error(t('chart.nothingToSave'))
      return false
    }
    try {
      const res = await window.electronAPI.saveFile({
        path: filePath.value,
        content: JSON.stringify(chartData.value)
      })
      if (res.canceled) return false
      filePath.value = res.path ?? ''
      autoSaveSuspended.value = false
      // 首次保存（原 path 为空）后文件有了路径，更新登记
      window.electronAPI.fileOpened({ path: filePath.value }).catch(() => {})
      saveNodeVisible.value = false
      return true
    } catch (err) {
      console.error('保存失败', err)
      // invoke 错误边界只保留 message（code 属性跨 IPC 丢失），
      // 按主进程错误里的稳定 token 区分冲突场景
      if (String(err?.message).includes('[FILE_CONFLICT]')) {
        autoSaveSuspended.value = true // 冲突未解决前不再自动保存，避免每分钟重复报错
        message.error(t('chart.fileConflictHint'))
      } else if (String(err?.message).includes('[EXAMPLE_PROTECTED]')) {
        // 另存对话框里选到了示例目录内（示例是内置资产，不允许覆盖）
        message.error(t('chart.exampleProtectedHint'))
      } else {
        message.error(t('chart.saveFailed'))
      }
      saveNodeVisible.value = true
      return false
    }
  }

  /** 手动保存（Ctrl/⌘+S/菜单/关闭前保存）：在 persistFile 之上叠加 UI 重置
   *  ——保存成功后回到干净的属性面板，这是用户主动动作的预期反馈。
   *  返回是否保存成功（供退出流程使用）。 */
  const saveFile = async (): Promise<boolean> => {
    const ok = await persistFile()
    if (ok) {
      resetSider()
      resetRefData()
    }
    return ok
  }

  /** 另存为。 */
  const saveAs = async (): Promise<void> => {
    if (!chartData.value) {
      message.error(t('chart.nothingToSave'))
      return
    }
    try {
      const res = await window.electronAPI.saveFileAs({
        content: JSON.stringify(chartData.value)
      })
      if (res.canceled) return
      filePath.value = res.path ?? ''
      autoSaveSuspended.value = false // 换了新文件，恢复自动保存
      // 另存为换了路径：更新登记，旧文件不再聚焦到本窗口
      window.electronAPI.fileOpened({ path: filePath.value }).catch(() => {})
      saveNodeVisible.value = false
      resetSider()
      resetRefData()
    } catch (err) {
      console.error('另存为失败', err)
      if (String(err?.message).includes('[EXAMPLE_PROTECTED]')) {
        message.error(t('chart.exampleProtectedHint'))
      } else {
        message.error(t('chart.saveAsFailed'))
      }
    }
  }

  /** 新建文件：新窗口装载空白图谱（未存盘，path 为空） */
  const createNewFile = (): void => {
    window.electronAPI
      .newChartWindow({ content: JSON.stringify({ version: 2, nodes: [], links: [] }), path: '' })
      .catch((err) => {
        console.error('新建图表窗口失败', err)
        message.error(t('chart.newWindowFailed'))
      })
  }

  /** 打开文件：读取成功后在新窗口打开（保持新窗口的保存直接写回原文件）。
   *  同一文件已在其他窗口打开时，主进程会聚焦那个窗口并返回 alreadyOpen。 */
  const openFile = async (): Promise<void> => {
    try {
      const res = await window.electronAPI.openFile()
      if (res.canceled) return
      if (res.alreadyOpen) {
        message.info(t('chart.alreadyOpen'))
        return
      }
      window.electronAPI.newChartWindow({ content: res.content, path: res.path }).catch((err) => {
        console.error('打开失败', err)
        message.error(t('chart.openFailed'))
      })
    } catch (err) {
      console.error('打开失败', err)
      // 不解析 err.message（跨 IPC 边界后文案不可靠），使用固定中文提示
      message.error(t('common.openFailedDetail'))
    }
  }

  /** 关闭文件：未保存确认与窗口关闭按钮同款（保存/放弃/取消），通过后
   *  清掉主进程的打开登记再跳回首页，其余清理由 unmountFileLifecycle 完成 */
  const closeFile = async (): Promise<void> => {
    if (saveNodeVisible.value) {
      let choice
      try {
        choice = await window.electronAPI.confirmUnsaved()
      } catch (err) {
        console.error('关闭文件确认失败', err)
        return // 确认框失败按“取消”处理，避免误丢用户数据
      }
      if (choice === 'cancel') return
      if (choice === 'save') {
        const ok = await saveFile()
        if (!ok) return // 保存失败留在图表页（报错沿用 saveFile 现有分支）
      }
    }
    // 清掉本窗口的打开登记（空路径只清不登）：不清的话，再次打开同一文件
    // 会“聚焦”到这个实际已回到首页的窗口
    window.electronAPI.fileOpened({ path: '' }).catch((err) => {
      console.error('清除打开登记失败', err)
    })
    router.push('/')
  }

  /** 挂载文件生命周期（编排层 onMounted 调用）：解锁窗口注册关闭确认 +
   *  60 秒自动保存（走 persistFile 纯保存，不重置侧边栏——后台保存必须
   *  隐形，清表单/跳属性页会打断正在编辑的用户，也不借用 shortcutActive
   *  分发，避免占用菜单按钮的 v-model 状态） */
  const mountFileLifecycle = (): void => {
    window.electronAPI.enterChartMode().catch((err) => {
      console.error('进入图表模式失败', err)
    })
    autoSaveTimer = setInterval(() => {
      if (!autoSaveSuspended.value && saveNodeVisible.value && filePath.value !== '') {
        persistFile()
      }
    }, 60000)
    // 用户点击窗口关闭按钮：主进程拦截 close 后推送本事件，由本页面决定
    // 是否可以关闭
    offRequestClose = window.electronAPI.onRequestClose(async () => {
      if (!saveNodeVisible.value) {
        window.electronAPI.closeWindow()
        return
      }
      let choice
      try {
        choice = await window.electronAPI.confirmUnsaved()
      } catch (err) {
        console.error('退出确认失败', err)
        return // 确认框失败按“取消”处理，避免误丢用户数据
      }
      if (choice === 'cancel') return
      if (choice === 'discard') {
        window.electronAPI.closeWindow()
        return
      }
      // choice === 'save'：保存成功才关闭；失败留在当前页面
      const ok = await saveFile()
      if (ok) window.electronAPI.closeWindow()
    })
  }

  /** 卸载文件生命周期（编排层 onUnmounted 调用）：释放定时器/监听并解除
   *  主进程的窗口锁定与关闭拦截（与 mount 的 enterChartMode 对称） */
  const unmountFileLifecycle = (): void => {
    if (autoSaveTimer) clearInterval(autoSaveTimer)
    if (offRequestClose) offRequestClose()
    window.electronAPI.exitChartMode().catch((err) => {
      console.error('退出图表模式失败', err)
    })
  }

  return {
    filePath,
    chartName,
    autoSaveSuspended,
    registerOpenedFile,
    persistFile,
    saveFile,
    saveAs,
    createNewFile,
    openFile,
    closeFile,
    mountFileLifecycle,
    unmountFileLifecycle
  }
}
