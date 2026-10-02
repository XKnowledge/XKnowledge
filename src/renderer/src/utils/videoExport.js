// 视频导出管线（渲染层自闭环）：three canvas --rAF--> 离屏合成 canvas
//（画布帧 + 水印，与 exportPng 单源）--> captureStream(30) --> MediaRecorder
// --> Blob --> <a download>。格式探测 mp4 优先、逐级回退 webm（Electron 44
// Chromium 支持 mp4 H.264 录制；全不支持时上层 toast 降级）
const MIME_CANDIDATES = [
  ['video/mp4;codecs=avc1', 'mp4'],
  ['video/mp4', 'mp4'],
  ['video/webm;codecs=vp9', 'webm'],
  ['video/webm;codecs=vp8', 'webm'],
  ['video/webm', 'webm']
]

/** 探测当前环境支持的录制格式，返回 [mimeType, ext] 元组；无 MediaRecorder
 *  或全不支持返回 null。isSupported 参数化注入便于单测（node 环境无全局） */
export const pickMimeType = (
  isSupported = globalThis.MediaRecorder?.isTypeSupported?.bind(globalThis.MediaRecorder)
) => {
  if (!isSupported) return null
  return MIME_CANDIDATES.find(([mime]) => isSupported(mime)) ?? null
}

/** 导出文件名：与 exportPng 的 PNG 命名同构 */
export const composeFileName = (ext) =>
  `xknowledge-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`

/** 水印样式纯计算（PNG 导出与视频合成共用单源）：粗体、水平居中、底部约
 *  5% 处；字号下限 18 防小画布看不见 */
export const computeWatermarkStyle = (w, h) => ({
  fontSize: Math.max(18, Math.round(h * 0.022)),
  x: w / 2,
  y: h * 0.95
})

/** 离屏合成 canvas：draw() = 源画布当前帧 + 水印。视频每帧 rAF 调 draw，
 *  PNG 导出调一次后 toDataURL——水印绘制单源 */
export const createRecordingCanvas = (srcCanvas, watermarkColor) => {
  const canvas = document.createElement('canvas')
  canvas.width = srcCanvas.width
  canvas.height = srcCanvas.height
  const ctx = canvas.getContext('2d')
  const draw = () => {
    ctx.drawImage(srcCanvas, 0, 0)
    const { fontSize, x, y } = computeWatermarkStyle(canvas.width, canvas.height)
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.fillStyle = watermarkColor
    ctx.textAlign = 'center'
    ctx.fillText('By XKnowledge', x, y)
  }
  return { canvas, draw }
}

/** 组装 MediaRecorder（canvas.captureStream）。timeslice 250ms 分片收集让
 *  长录屏内存平稳；stop() 幂等并释放轨道，返回完整 Blob */
export const createRecorder = ({ canvas, mimeType, fps = 30, bitsPerSecond = 8_000_000 }) => {
  const stream = canvas.captureStream(fps)
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond })
  const chunks = []
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data)
  }
  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve
  })
  recorder.start(250)
  return {
    stop: async () => {
      if (recorder.state !== 'inactive') recorder.stop()
      await stopped
      stream.getTracks().forEach((track) => track.stop())
      return new Blob(chunks, { type: mimeType.split(';')[0] })
    }
  }
}

/** 触发下载（与 exportPng 的 <a download> 同通路）；revoke 延迟——click 触发
 *  的取数是异步的，立即回收会有竞态空文件 */
export const downloadBlob = (blob, ext) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = composeFileName(ext)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
