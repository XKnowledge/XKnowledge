// useRecording 单测：视频导出/录屏状态机的互斥与复位——exportingVideo 的
// try/finally 复位（exportVideo 抛错也不卡旗标）、录屏启停与暂停态翻转、
// 下层返回 false 时状态不动（幂等守卫在组件层，这里只锁「转换成功才翻」）、
// graph3dRef 空实例的容错（exportVideo 为可选 expose）。
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useRecording } from '../../src/renderer/src/composables/useRecording'

/** 可控时序的图实例桩：exportVideo 用手动 resolve 的 Promise 挂起 */
const makeGraph = (overrides = {}) => ({
  exportVideo: vi.fn(() => new Promise(() => {})),
  startScreenRecording: vi.fn(() => true),
  stopScreenRecording: vi.fn(() => Promise.resolve()),
  pauseScreenRecording: vi.fn(() => true),
  resumeScreenRecording: vi.fn(() => true),
  ...overrides
})

describe('useRecording（录制状态机）', () => {
  it('onExportVideo：exportingVideo 在执行期间为 true，结束复位', async () => {
    let release
    const graph = makeGraph({ exportVideo: vi.fn(() => new Promise((r) => (release = r))) })
    const { exportingVideo, onExportVideo } = useRecording(ref(graph))
    const pending = onExportVideo()
    expect(exportingVideo.value).toBe(true)
    release()
    await pending
    expect(exportingVideo.value).toBe(false)
  })

  it('onExportVideo：exportVideo 抛错也复位（finally），异常向上传播', async () => {
    const graph = makeGraph({ exportVideo: vi.fn(() => Promise.reject(new Error('boom'))) })
    const { exportingVideo, onExportVideo } = useRecording(ref(graph))
    await expect(onExportVideo()).rejects.toThrow('boom')
    expect(exportingVideo.value).toBe(false)
  })

  it('互斥：导出中不响应第二次导出，录屏中不响应导出', async () => {
    let release
    const graph = makeGraph({ exportVideo: vi.fn(() => new Promise((r) => (release = r))) })
    const { onExportVideo } = useRecording(ref(graph))
    onExportVideo()
    await onExportVideo() // 第二次：旗标已立 → 直接返回
    expect(graph.exportVideo).toHaveBeenCalledTimes(1)
    release()
    await new Promise((r) => setTimeout(r))

    // 录屏中立导出旗标 → 直接返回
    const g2 = makeGraph()
    const rec = useRecording(ref(g2))
    await rec.onToggleScreenRecord()
    expect(rec.screenRecording.value).toBe(true)
    await rec.onExportVideo()
    expect(g2.exportVideo).not.toHaveBeenCalled()
    expect(rec.exportingVideo.value).toBe(false)
  })

  it('onToggleScreenRecord 开启：下层返回 true 才立旗标', async () => {
    const graph = makeGraph({ startScreenRecording: vi.fn(() => false) })
    const { screenRecording, onToggleScreenRecord } = useRecording(ref(graph))
    await onToggleScreenRecord()
    expect(screenRecording.value).toBe(false)

    const ok = makeGraph()
    const rec2 = useRecording(ref(ok))
    await rec2.onToggleScreenRecord()
    expect(rec2.screenRecording.value).toBe(true)
  })

  it('onToggleScreenRecord 停止：等待 stop 完成后复位录屏与暂停态', async () => {
    const graph = makeGraph()
    const { screenRecording, screenPaused, onToggleScreenRecord, onToggleRecordPause } =
      useRecording(ref(graph))
    await onToggleScreenRecord()
    onToggleRecordPause() // 暂停中停止：两个旗标都要复位
    expect(screenPaused.value).toBe(true)
    await onToggleScreenRecord()
    expect(graph.stopScreenRecording).toHaveBeenCalledTimes(1)
    expect(screenRecording.value).toBe(false)
    expect(screenPaused.value).toBe(false)
  })

  it('互斥：导出中不能开录屏', async () => {
    let release
    const graph = makeGraph({ exportVideo: vi.fn(() => new Promise((r) => (release = r))) })
    const { onExportVideo, onToggleScreenRecord, screenRecording } = useRecording(ref(graph))
    onExportVideo()
    await onToggleScreenRecord()
    expect(graph.startScreenRecording).not.toHaveBeenCalled()
    expect(screenRecording.value).toBe(false)
    release()
    await new Promise((r) => setTimeout(r))
  })

  it('onToggleRecordPause：转换成功才翻状态，失败保持', () => {
    const graph = makeGraph({ pauseScreenRecording: vi.fn(() => false) })
    const { screenPaused, onToggleRecordPause } = useRecording(ref(graph))
    onToggleRecordPause()
    expect(screenPaused.value).toBe(false) // 暂停失败：状态不动
    graph.pauseScreenRecording.mockReturnValue(true)
    onToggleRecordPause()
    expect(screenPaused.value).toBe(true)
    graph.resumeScreenRecording.mockReturnValue(false)
    onToggleRecordPause()
    expect(screenPaused.value).toBe(true) // 恢复失败：保持暂停
    graph.resumeScreenRecording.mockReturnValue(true)
    onToggleRecordPause()
    expect(screenPaused.value).toBe(false)
  })

  it('graph3dRef 为 null：导出/开录不抛，旗标不立', async () => {
    const { exportingVideo, screenRecording, onExportVideo, onToggleScreenRecord } = useRecording(
      ref(null)
    )
    await onExportVideo()
    expect(exportingVideo.value).toBe(false)
    await onToggleScreenRecord()
    expect(screenRecording.value).toBe(false)
  })
})
