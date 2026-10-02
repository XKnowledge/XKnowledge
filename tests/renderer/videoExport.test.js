import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  pickMimeType,
  composeFileName,
  formatLocalTimestamp,
  computeWatermarkStyle,
  createRecordingCanvas,
  createRecorder,
  saveVideoBlob
} from '../../src/renderer/src/utils/videoExport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('videoExport：视频导出纯函数', () => {
  it('pickMimeType：mp4 优先，逐级回退 webm vp9/vp8/裸 webm，返回 [mime, ext] 元组', () => {
    expect(pickMimeType(() => true)).toEqual(['video/mp4;codecs=avc1', 'mp4'])
    expect(pickMimeType((m) => m.startsWith('video/webm'))).toEqual([
      'video/webm;codecs=vp9',
      'webm'
    ])
    expect(pickMimeType((m) => m === 'video/webm;codecs=vp8')).toEqual([
      'video/webm;codecs=vp8',
      'webm'
    ])
    expect(pickMimeType((m) => m === 'video/webm')).toEqual(['video/webm', 'webm'])
  })

  it('pickMimeType：全不支持或无 MediaRecorder（默认参数）时为 null', () => {
    expect(pickMimeType(() => false)).toBeNull()
    // node 测试环境无 MediaRecorder，默认参数应安全返回 null
    expect(pickMimeType(undefined)).toBeNull()
  })

  it('formatLocalTimestamp：取本机本地时间分量拼装（toISOString 恒为 UTC，东八区文件名会慢 8 小时），个位补零', () => {
    // 本地构造器造时刻 → 期望就是该组本地分量，与跑测试机器所在时区无关
    expect(formatLocalTimestamp(new Date(2026, 9, 2, 1, 5, 9))).toBe('2026-10-02-01-05-09')
    expect(formatLocalTimestamp(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31-23-59-59')
  })

  it('composeFileName：xknowledge-<本地时间戳>.<ext>，时间取电脑当前时间（非 UTC）', () => {
    expect(composeFileName('mp4')).toMatch(/^xknowledge-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.mp4$/)
    expect(composeFileName('webm')).toMatch(/\.webm$/)
    // 锁定本地时间：fake 系统时间为本地 2026-10-02 01:05:09（其 UTC 表示是
    // 前一天 17 点）——实现若退回 toISOString 此处必红
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 9, 2, 1, 5, 9))
      expect(composeFileName('mp4')).toBe('xknowledge-2026-10-02-01-05-09.mp4')
    } finally {
      vi.useRealTimers()
    }
  })

  it('computeWatermarkStyle：字号 max(18, 高*0.022)、底部 95%、水平居中', () => {
    expect(computeWatermarkStyle(1920, 1080)).toEqual({ fontSize: 24, x: 960, y: 1026 })
    expect(computeWatermarkStyle(800, 400)).toEqual({ fontSize: 18, x: 400, y: 380 })
  })
})

describe('videoExport：离屏合成画布（水印单源）', () => {
  /** 造一个 2d 上下文 fake：属性赋值照收，方法调用记录 */
  const fakeCtx = () => {
    const calls = { drawImage: [], fillText: [] }
    const ctx = {
      font: '',
      fillStyle: '',
      textAlign: '',
      drawImage: (...args) => calls.drawImage.push(args),
      fillText: (...args) => calls.fillText.push(args)
    }
    return { ctx, calls }
  }

  it('画布尺寸继承源画布（录制缓冲与显示分辨率一致）', () => {
    const { ctx } = fakeCtx()
    let created
    vi.stubGlobal('document', {
      createElement: () => {
        created = { width: 0, height: 0, getContext: () => ctx }
        return created
      }
    })
    const src = { width: 1920, height: 1080 }
    createRecordingCanvas(src, '#fff')
    expect(created.width).toBe(1920)
    expect(created.height).toBe(1080)
  })

  it('draw()：源画布整幅贴入 + 按 computeWatermarkStyle 落水印（与 PNG 导出单源）', () => {
    const { ctx, calls } = fakeCtx()
    vi.stubGlobal('document', {
      createElement: () => ({ width: 1920, height: 1080, getContext: () => ctx })
    })
    const src = { width: 1920, height: 1080 }
    const { draw } = createRecordingCanvas(src, 'rgba(0,0,0,0.35)')
    draw()
    // 源帧整幅（0,0 起、无缩放参数）
    expect(calls.drawImage).toEqual([[src, 0, 0]])
    // 水印：computeWatermarkStyle(1920,1080) = { fontSize: 24, x: 960, y: 1026 }
    expect(calls.fillText).toEqual([['By XKnowledge', 960, 1026]])
    expect(ctx.font).toBe('bold 24px sans-serif')
    expect(ctx.fillStyle).toBe('rgba(0,0,0,0.35)')
    expect(ctx.textAlign).toBe('center')
  })
})

describe('videoExport：MediaRecorder 组装', () => {
  /** MediaRecorder fake：记录构造参数与 start timeslice，stop 同步触发 onstop */
  const makeRecorderClass = () => {
    class FakeMediaRecorder {
      constructor(stream, opts) {
        this.stream = stream
        this.opts = opts
        this.state = 'inactive'
        FakeMediaRecorder.instances.push(this)
      }
      start(timeslice) {
        this.startedWith = timeslice
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }
    }
    FakeMediaRecorder.instances = []
    return FakeMediaRecorder
  }

  const makeCanvas = (stream) => ({ captureStream: vi.fn(() => stream) })

  it('captureStream(fps)、mimeType/码率透传、start(250) 分片收集（长录屏内存平稳）', async () => {
    const track = { stop: vi.fn() }
    const stream = { getTracks: () => [track] }
    const canvas = makeCanvas(stream)
    const FakeMediaRecorder = makeRecorderClass()
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    const recorder = createRecorder({ canvas, mimeType: 'video/mp4;codecs=avc1' })
    const inner = FakeMediaRecorder.instances[0]
    expect(canvas.captureStream).toHaveBeenCalledWith(30)
    expect(inner.opts).toEqual({
      mimeType: 'video/mp4;codecs=avc1',
      videoBitsPerSecond: 16_000_000
    })
    expect(inner.startedWith).toBe(250)
    expect(inner.state).toBe('recording')

    // 塞两个非空分片（size 为 0 的空事件应被忽略）
    inner.ondataavailable({ data: new Blob(['abc']) })
    inner.ondataavailable({ data: { size: 0 } })
    inner.ondataavailable({ data: new Blob(['def']) })

    const blob = await recorder.stop()
    // Blob 类型取 mime 主类型（去掉 codecs 参数）
    expect(blob.type).toBe('video/mp4')
    expect(await blob.text()).toBe('abcdef')
    // stop 后释放轨道（不残留摄像头/画布流）
    expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('fps 与码率可自定义（1080p 提升后调用方覆盖默认值）', () => {
    const canvas = makeCanvas({ getTracks: () => [] })
    const FakeMediaRecorder = makeRecorderClass()
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    createRecorder({ canvas, mimeType: 'video/webm', fps: 60, bitsPerSecond: 8_000_000 })
    expect(canvas.captureStream).toHaveBeenCalledWith(60)
    expect(FakeMediaRecorder.instances[0].opts.videoBitsPerSecond).toBe(8_000_000)
  })

  it('stop() 幂等：录制已结束后再调不抛错、MediaRecorder.stop 不重复触发', async () => {
    const track = { stop: vi.fn() }
    const canvas = makeCanvas({ getTracks: () => [track] })
    const FakeMediaRecorder = makeRecorderClass()
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    const recorder = createRecorder({ canvas, mimeType: 'video/webm' })
    const inner = FakeMediaRecorder.instances[0]
    const innerStopCalls = []
    inner.stop = () => {
      innerStopCalls.push(1)
      FakeMediaRecorder.prototype.stop.call(inner)
    }

    await recorder.stop()
    await expect(recorder.stop()).resolves.toBeInstanceOf(Blob)
    // state 保护生效：底层 recorder.stop 只触发一次（track 释放每次都走，
    // MediaStreamTrack.stop 自身幂等，无害）
    expect(innerStopCalls).toHaveLength(1)
    expect(inner.state).toBe('inactive')
  })
})

describe('videoExport：落盘走主进程保存框', () => {
  it('saveVideoBlob：bytes 化后连同默认文件名/扩展名交主进程，返回值透传', async () => {
    const saveVideoFile = vi.fn(async () => ({ path: 'C:/out/x.mp4' }))
    vi.stubGlobal('window', { electronAPI: { saveVideoFile } })

    const blob = new Blob(['xyz'])
    const result = await saveVideoBlob(blob, 'mp4')

    expect(result).toEqual({ path: 'C:/out/x.mp4' })
    const [payload] = saveVideoFile.mock.calls[0]
    // Blob → ArrayBuffer → Uint8Array（ipc structured clone 可传）
    expect(payload.bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(payload.bytes)).toEqual([120, 121, 122])
    // 默认文件名对齐 PNG 命名（xknowledge-<本地时间戳>.mp4）
    expect(payload.defaultName).toMatch(/^xknowledge-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.mp4$/)
    expect(payload.ext).toBe('mp4')
  })
})
