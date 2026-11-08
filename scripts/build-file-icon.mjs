/*
 * .xk 文件图标生成器：唯一源是下面几段 SVG 几何，产物全部由本脚本渲染，
 * 手工改 PNG/ICO 会在下次生成时被覆盖。
 *
 * 设计语言与应用图标（resources/XKnowledge.ico）同族：
 *   紫色渐变（#8F56ED → #6926D0）+ 白色「分子节点」记号（四角节点 + 中心节点）
 * 文件图标在此之上加「纸页」轮廓与右上折角，使资源管理器里一眼可辨
 * 「这是 XKnowledge 的文档」而非「这是应用快捷方式」。
 *
 * 关键取舍：每个尺寸单独渲染 SVG，不做大图缩放。缩放在 16/24/32 上会
 * 把折角糊成一团、节点糊成紫斑；按尺寸单独出图才能针对小尺寸加粗描边、
 * 放大记号（见 COMPACT_* 常量）——Windows 资源管理器 16px 是最高频场景。
 *
 * 依赖 ImageMagick（librsvg 代理渲染 SVG）与 Node 内置能力：
 *   node scripts/build-file-icon.mjs            # 生成 build/xk-file.ico + .icns
 *   node scripts/build-file-icon.mjs --preview  # 另出各尺寸预览图（.artifacts/file-icon/）
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// 中间产物（各尺寸 PNG/SVG、预览图）统一落 .artifacts：只有 .ico/.icns 是
// 需要入库的成品，预览图随时可重出，不进 git
const OUT_DIR = join(ROOT, '.artifacts', 'file-icon')
const BUILD_DIR = join(ROOT, 'build')

// Windows 壳层实际会取用的尺寸：16/20/24/32 为列表与小图标视图，
// 40/48 为中图标，64/128/256 大图标与超大图标
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

// ===== 调色板（与应用图标同源）=====
const PURPLE_TOP = '#8F56ED'
const PURPLE_BOTTOM = '#6926D0'
const PAGE_FILL = '#FFFFFF'
const PAGE_EDGE = '#D2C0F7'
const FOLD_TOP = '#CBB4F9'
const FOLD_BOTTOM = '#9C79EC'

// 1024 坐标系内的几何。小尺寸变体放大记号、加粗页缘：
// 16px 下 1 像素 = 64 单位，按比例画的细线必然消失，只能靠体块传达形状。
// 页缘按「设备像素」给值（edgePx）再换算成坐标单位，各尺寸观感一致。
const PAGE = { x: 112, y: 72, w: 800, h: 880, r: 80, fold: 252 }

const DETAIL = {
  // 40px 以上：正常比例，留白充分。几何中心略低于页面中心——右上折角
  // 占掉视觉重量，记号下移才不头重脚轻
  full: { edgePx: 2.2, bar: 54, node: 66, hub: 78, span: 224, cy: 560 },
  // 32px 以下：记号加粗放大一档，页缘按 1.7 设备像素（16px 下约 1.7px，
  // 白页在白色资源管理器里仍有一圈可见轮廓）
  compact: { edgePx: 1.7, bar: 74, node: 74, hub: 86, span: 218, cy: 566 }
}

const pagePath = ({ x, y, w, h, r, fold }) =>
  [
    `M ${x + r} ${y}`,
    `H ${x + w - fold}`,
    `L ${x + w} ${y + fold}`,
    `V ${y + h - r}`,
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `Q ${x} ${y + h} ${x} ${y + h - r}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    'Z'
  ].join(' ')

// 折角：纸页缺角后露出的内侧背面，三角形两直角边贴页缘
const foldPath = ({ x, y, w, fold }) =>
  `M ${x + w - fold} ${y} L ${x + w} ${y + fold} L ${x + w - fold} ${y + fold} Z`

/**
 * 分子节点记号：四角节点 + 中心节点 + 八向连杆。
 * 连杆先画、节点压上，圆头端点让连杆末端藏在节点圆心处不外露。
 */
const motif = (d, cx) => {
  const k = d.span * Math.SQRT1_2
  const corners = [
    [cx - k, d.cy - k],
    [cx + k, d.cy - k],
    [cx - k, d.cy + k],
    [cx + k, d.cy + k]
  ]
  const links = corners
    .map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${cx}" y2="${d.cy}"/>`)
    .join('')
  const nodes = corners.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${d.node}"/>`).join('')
  return (
    `<g stroke="url(#ink)" stroke-width="${d.bar}" stroke-linecap="round" fill="none">${links}</g>` +
    `<g fill="url(#ink)">${nodes}<circle cx="${cx}" cy="${d.cy}" r="${d.hub}"/></g>`
  )
}

const buildSvg = (size, variant) => {
  const d = DETAIL[variant]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PURPLE_TOP}"/>
      <stop offset="1" stop-color="${PURPLE_BOTTOM}"/>
    </linearGradient>
    <linearGradient id="fold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${FOLD_TOP}"/>
      <stop offset="1" stop-color="${FOLD_BOTTOM}"/>
    </linearGradient>
  </defs>
  <path d="${pagePath(PAGE)}" fill="${PAGE_FILL}"
        stroke="${PAGE_EDGE}" stroke-width="${(d.edgePx * 1024) / size}"
        stroke-linejoin="round"/>
  <path d="${foldPath(PAGE)}" fill="url(#fold)" stroke-linejoin="round"/>
  ${motif(d, PAGE.x + PAGE.w / 2)}
</svg>
`
}

const magick = (args) => execFileSync('magick', args, { stdio: ['ignore', 'pipe', 'pipe'] })

const renderPng = (size, variant, outPath) => {
  const svgPath = join(OUT_DIR, `xk-${variant}-${size}.svg`)
  writeFileSync(svgPath, buildSvg(size, variant), 'utf-8')
  // 直接由 SVG 在目标像素尺寸栅格化：librsvg 按 width/height 出图，无重采样。
  // -background none 必须写在输入文件**之前**：写在后面只影响后续操作，SVG
  // 已被光栅化进一张无 alpha 的图（实测 corner=srgb 无 a 通道），透明底丢失后
  // 整个画布会变成不透明的白方块——资源管理器里就是一个白色底板
  magick([`-background`, `none`, svgPath, `png32:${outPath}`])
}

/* ===== ICNS 封装（ImageMagick 不支持写 icns，PNG 负载按格式直接拼）===== */
const ICNS_TYPE = {
  // 类型码 → 边长：macOS 沿用的两套命名（icp* 旧版、ic0* Retina 版）都填，
  // 兼容老版本 Finder 与散列缓存
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

const buildIcns = async (pngFor) => {
  const chunks = []
  for (const [type, size] of Object.entries(ICNS_TYPE)) {
    const png = await pngFor(size)
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    chunks.push(header, png)
  }
  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([head, body])
}

const main = async () => {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(BUILD_DIR, { recursive: true })

  const pngCache = new Map()
  const pngFor = (size) => {
    if (!pngCache.has(size)) {
      const variant = size <= 32 ? 'compact' : 'full'
      const p = join(OUT_DIR, `xk-${size}.png`)
      renderPng(size, variant, p)
      pngCache.set(size, p)
    }
    return pngCache.get(size)
  }

  // ICO：ImageMagick 多帧写入，每帧保留自身尺寸（不 -define icon:auto-resize，
  // 该参数会把单图重采样成多帧，正是要避免的模糊来源）
  for (const size of ICO_SIZES) pngFor(size)
  const icoPath = join(BUILD_DIR, 'xk-file.ico')
  magick([...ICO_SIZES.map((s) => pngCache.get(s)), icoPath])

  const icnsPath = join(BUILD_DIR, 'xk-file.icns')
  writeFileSync(
    icnsPath,
    await buildIcns(async (size) => {
      const p = pngFor(size)
      return execFileSync('magick', [p, '-strip', 'png32:-'], { maxBuffer: 64 << 20 })
    })
  )

  if (process.argv.includes('--preview')) {
    for (const bg of [
      ['light', '#FFFFFF'],
      ['tint', '#F1EDFA'],
      ['dark', '#1E1E1E']
    ]) {
      const [name, color] = bg
      // 等比并排：按 1x 像素尺寸铺开，模拟资源管理器中的实际观感
      const args = []
      for (const size of [16, 24, 32, 48, 64, 128, 256]) {
        args.push(
          '(',
          pngFor(size),
          '-background',
          color,
          '-gravity',
          'center',
          '-extent',
          `${256}x${Math.max(256, size + 40)}`,
          ')'
        )
      }
      magick([
        ...args,
        '-background',
        color,
        '-gravity',
        'center',
        '+append',
        join(OUT_DIR, `preview-${name}.png`)
      ])
    }
  }

  console.log(`ico  ${icoPath}\nicns ${icnsPath}`)
}

main().catch((err) => {
  console.error(err?.stderr?.toString?.() || err)
  process.exit(1)
})
