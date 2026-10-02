import { describe, it, expect } from 'vitest'
import {
  pickMimeType,
  composeFileName,
  computeWatermarkStyle
} from '../../src/renderer/src/utils/videoExport.js'

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

  it('composeFileName：对齐 PNG 命名 xknowledge-<ISO 时间戳>.<ext>', () => {
    expect(composeFileName('mp4')).toMatch(
      /^xknowledge-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.mp4$/
    )
    expect(composeFileName('webm')).toMatch(/\.webm$/)
  })

  it('computeWatermarkStyle：字号 max(18, 高*0.022)、底部 95%、水平居中', () => {
    expect(computeWatermarkStyle(1920, 1080)).toEqual({ fontSize: 24, x: 960, y: 1026 })
    expect(computeWatermarkStyle(800, 400)).toEqual({ fontSize: 18, x: 400, y: 380 })
  })
})
