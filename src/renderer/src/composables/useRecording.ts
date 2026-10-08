import { ref, type Ref } from 'vue'

/**
 * 视频导出/录屏状态机（ChartView 单一来源，经 composable 下发）：
 * 互斥由按钮 disabled 表达，组件层（XkGraph3D）仅兜底。
 * 状态归 ChartView，本模块只收状态机与动作——XkRecordingCard 的
 * paused 图标、菜单禁用态、属性面板 disabled 都读这里的单一来源。
 */

/** XkGraph3D 实例上录屏/导出相关的 expose 面（ref 持有组件实例） */
export interface Graph3DRecordingHandle {
  exportVideo?: () => Promise<void>
  startScreenRecording?: () => boolean
  stopScreenRecording?: () => Promise<void>
  pauseScreenRecording?: () => boolean
  resumeScreenRecording?: () => boolean
}

export function useRecording(graph3dRef: Ref<Graph3DRecordingHandle | null>) {
  const exportingVideo = ref(false)
  const screenRecording = ref(false)
  // 录屏暂停态（控制卡片 icon 切换依据）：与 screenRecording 同源同生命周期
  const screenPaused = ref(false)

  const onExportVideo = async () => {
    if (exportingVideo.value || screenRecording.value) return
    exportingVideo.value = true
    try {
      await graph3dRef.value?.exportVideo()
    } finally {
      exportingVideo.value = false
    }
  }

  const onToggleScreenRecord = async () => {
    if (screenRecording.value) {
      // 旗标复位走 finally：stopScreenRecording 内部最后一步是写盘
      // （编码器失败/磁盘错误会 reject），若复位写在 await 之后就会整段
      // 跳过，screenRecording 卡在 true——dispatch 黑名单随即吞掉全部
      // 编辑动作（建点/删除/粘贴/撤销）、菜单永远显示「停止录屏」、
      // 导出视频永久禁用、窗口尺寸锁不解除，用户只能重启应用。
      // 异常仍向上抛（调用方负责提示），只保证状态机自洽
      try {
        await graph3dRef.value?.stopScreenRecording()
      } finally {
        screenRecording.value = false
        screenPaused.value = false
      }
      return
    }
    if (exportingVideo.value) return
    screenRecording.value = graph3dRef.value?.startScreenRecording() ?? false
  }

  /** 录屏暂停/继续（控制卡片）：组件层 state 守卫幂等，转换成功才翻状态
   *  （重复暂停/未暂停就恢复时下层返回 false，状态不动） */
  const onToggleRecordPause = () => {
    const ok = screenPaused.value
      ? graph3dRef.value?.resumeScreenRecording()
      : graph3dRef.value?.pauseScreenRecording()
    if (ok) screenPaused.value = !screenPaused.value
  }

  return {
    exportingVideo,
    screenRecording,
    screenPaused,
    onExportVideo,
    onToggleScreenRecord,
    onToggleRecordPause
  }
}
