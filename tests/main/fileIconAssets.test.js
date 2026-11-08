import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'

/**
 * 构建产物守护：build/xk-file.ico 与 build/xk-file.icns 是入库的二进制成品
 * （由 scripts/build-file-icon.mjs 生成，见 docs/development.md §2/§3）。
 *
 * 这里**不做**「与 SVG 源码逐像素一致」的比对——那需要再引一次 SVG 光栅化器
 * （ImageMagick / sharp），等于把打包链路重新绑上外部依赖。守护的是二进制
 * 本身的结构完整性：帧数、尺寸是否齐全、偏移是否越界、每帧负载是否合法、
 * 声明尺寸与实际像素是否一致。这些正是手工替换/截断/只渲染了一档尺寸时
 * 会破的地方，而 Windows 对残缺 ICO 的容忍方式是**静默**降级成应用图标 ——
 * 没有这条测试，问题只会在装机后由用户发现。
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ICO_PATH = path.join(APP_ROOT, 'build', 'xk-file.ico')
const ICNS_PATH = path.join(APP_ROOT, 'build', 'xk-file.icns')

// Windows 壳层实际取用的尺寸档（与生成脚本 ICO_SIZES 对齐）
const EXPECTED_ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

// ICNS 类型码 → 该块 PNG 的像素边长。两套命名（icp* 旧版、ic0* Retina 版）
// 都要有：老 Finder 认前者，Retina 取图靠后者
const EXPECTED_ICNS = {
  icp4: 16,
  icp5: 32,
  icp6: 64,
  ic07: 128,
  ic08: 256,
  ic09: 512,
  ic10: 1024,
  ic11: 32,
  ic12: 64,
  ic13: 256,
  ic14: 512
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** PNG 的 IHDR 紧跟在 8 字节签名 + 4 字节长度 + 4 字节类型之后 */
const pngSize = (buf, offset = 0) => ({
  width: buf.readUInt32BE(offset + 16),
  height: buf.readUInt32BE(offset + 20)
})

const isPng = (buf, offset = 0) => buf.slice(offset, offset + 8).equals(PNG_SIGNATURE)

/** 解析 ICO 目录：返回每帧的尺寸、位深、负载偏移与长度，并附四角 alpha
 *  与透明像素数（32 位 DIB 帧直接读 BGRA；PNG 帧无法在不引解码器的前提下
 *  逐像素判定，这两项按「不适用」置空，由 PNG 的 IHDR 通道位深兜底） */
const parseIco = (buf) => {
  expect(buf.readUInt16LE(0), 'ICO 保留字必须为 0').toBe(0)
  expect(buf.readUInt16LE(2), 'ICO 类型必须为 1（图标）').toBe(1)
  const count = buf.readUInt16LE(4)
  const frames = []
  for (let i = 0; i < count; i += 1) {
    const o = 6 + i * 16
    // 目录项里 0 表示 256（字段只有 1 字节）
    const width = buf[o] === 0 ? 256 : buf[o]
    const height = buf[o + 1] === 0 ? 256 : buf[o + 1]
    const frame = {
      width,
      height,
      bpp: buf.readUInt16LE(o + 6),
      size: buf.readUInt32LE(o + 8),
      offset: buf.readUInt32LE(o + 12)
    }
    if (!isPng(buf, frame.offset) && buf.readUInt16LE(frame.offset + 14) === 32) {
      // DIB 像素自下而上，每行 width*4 字节 BGRA
      const pixels = frame.offset + 40
      const rowBytes = width * 4
      const alphaAt = (x, y) => buf[pixels + (height - 1 - y) * rowBytes + x * 4 + 3]
      frame.alphaCorners = [
        alphaAt(0, 0),
        alphaAt(width - 1, 0),
        alphaAt(0, height - 1),
        alphaAt(width - 1, height - 1)
      ]
      let clear = 0
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) if (alphaAt(x, y) === 0) clear += 1
      }
      frame.clearPixels = clear
    }
    frames.push(frame)
  }
  return frames
}

/** 解析 ICNS 容器：类型码 → 负载 Buffer */
const parseIcns = (buf) => {
  expect(buf.toString('ascii', 0, 4), 'ICNS 魔数').toBe('icns')
  expect(buf.readUInt32BE(4), 'ICNS 头部声明长度必须等于文件实际长度').toBe(buf.length)
  const chunks = new Map()
  let offset = 8
  while (offset < buf.length) {
    const type = buf.toString('ascii', offset, offset + 4)
    const length = buf.readUInt32BE(offset + 4)
    expect(length, `${type} 块长度必须大于 8`).toBeGreaterThan(8)
    expect(offset + length, `${type} 块不得越过文件末尾`).toBeLessThanOrEqual(buf.length)
    chunks.set(type, buf.slice(offset + 8, offset + length))
    offset += length
  }
  expect(offset, 'ICNS 块应恰好铺满整个文件').toBe(buf.length)
  return chunks
}

describe('build/xk-file.ico：Windows 文件关联图标', () => {
  const buf = fs.readFileSync(ICO_PATH)
  const frames = parseIco(buf)

  it('九档尺寸齐全（缺档会让资源管理器在对应视图下静默降级）', () => {
    expect(frames.map((f) => f.width)).toEqual(EXPECTED_ICO_SIZES)
    // 每帧必须是正方形：非方形会被壳层按最小边裁切
    for (const f of frames) expect(f.height).toBe(f.width)
  })

  it('每帧带 32 位 alpha（无 alpha 的帧在深色任务栏下会出现白底方块）', () => {
    for (const f of frames) expect(f.bpp, `${f.width}px 帧位深`).toBe(32)
  })

  it('负载偏移与长度都落在文件内，且严格首尾相接不重叠', () => {
    let expected = 6 + frames.length * 16
    for (const f of frames) {
      expect(f.offset, `${f.width}px 帧偏移`).toBe(expected)
      expect(f.offset + f.size).toBeLessThanOrEqual(buf.length)
      expected = f.offset + f.size
    }
    // 末尾无冗余填充（文件被截断或尾部残留脏数据都会破这条）
    expect(expected).toBe(buf.length)
  })

  it('每帧负载是合法位图：PNG 或 40 字节头的 DIB，且声明尺寸与目录项一致', () => {
    for (const f of frames) {
      if (isPng(buf, f.offset)) {
        expect(pngSize(buf, f.offset), `${f.width}px 帧 PNG 尺寸`).toEqual({
          width: f.width,
          height: f.height
        })
        continue
      }
      // ICO 内嵌 DIB：第 4 字节起是 BITMAPINFOHEADER，其长度必须是 40
      expect(buf.readUInt32LE(f.offset), `${f.width}px 帧 DIB 头长度`).toBe(40)
      expect(buf.readInt32LE(f.offset + 4), `${f.width}px 帧 DIB 宽`).toBe(f.width)
      // DIB 高度含 XOR 图与 AND 掩码两层，是显示高度的两倍
      expect(buf.readInt32LE(f.offset + 8), `${f.width}px 帧 DIB 高`).toBe(f.height * 2)
    }
  })

  // 回归锁：曾因 `magick <svg> -background none` 顺序写反（-background 作用在
  // 输入之后，SVG 已被光栅化进无 alpha 的图），整块画布变成不透明白方块，
  // 资源管理器里文件图标套着一层白底。四角透明度是最直接的判据。
  it('每帧四角必须透明（白底会被整块画布压平，四角随之变成不透明）', () => {
    for (const f of frames) {
      expect(f.alphaCorners, `${f.width}px 帧四角 alpha`).toEqual([0, 0, 0, 0])
    }
  })

  it('每帧都保留可观的透明区（阈值只拦「整块压平」，不锁设计留白比例）', () => {
    for (const f of frames) {
      const ratio = f.clearPixels / (f.width * f.height)
      expect(ratio, `${f.width}px 帧透明像素占比`).toBeGreaterThan(0.02)
    }
  })
})

describe('build/xk-file.icns：macOS 文件关联图标', () => {
  const buf = fs.readFileSync(ICNS_PATH)
  const chunks = parseIcns(buf)

  it('两套命名的分块都齐（缺 ic0* 时 Retina 会取到低分图）', () => {
    expect([...chunks.keys()].sort()).toEqual(Object.keys(EXPECTED_ICNS).sort())
  })

  it('每块都是 PNG，且像素边长与类型码含义一致', () => {
    for (const [type, edge] of Object.entries(EXPECTED_ICNS)) {
      const payload = chunks.get(type)
      expect(isPng(payload), `${type} 块应为 PNG 负载`).toBe(true)
      expect(pngSize(payload), `${type} 块像素尺寸`).toEqual({ width: edge, height: edge })
      // IHDR：位深在偏移 24、颜色类型在 25。颜色类型 6 = 真彩 + alpha，
      // 丢了 alpha 通道（透明底被压平）时这里会是 2
      expect(payload[24], `${type} 块位深`).toBe(8)
      expect(payload[25], `${type} 块颜色类型（6=RGBA，需带 alpha 通道）`).toBe(6)
    }
  })
})
