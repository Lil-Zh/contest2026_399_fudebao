// 生成 chevron_down 图标：4x 超采样画 V 形折线，盒式降采样抗锯齿，输出 44x44 RGBA PNG
const zlib = require('zlib')
const fs = require('fs')

const SS = 4                       // 超采样倍数
const SIZE = 44 * SS               // 176x176 画布
const THICK = 4.5 * SS             // 线宽
const COLOR = [0x9d, 0x9d, 0x95]   // #9d9d95 弱提示灰
const buf = new Uint8Array(SIZE * SIZE * 4)

// 折线：(10,17) -> (22,29) -> (34,17)，对每像素求到线段最近距离
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  const cx = x1 + t * dx, cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}
const pts = [[10 * SS, 17 * SS], [22 * SS, 29 * SS], [34 * SS, 17 * SS]]
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const d = Math.min(distToSeg(x, y, ...pts[0], ...pts[1]), distToSeg(x, y, ...pts[1], ...pts[2]))
    const a = Math.max(0, Math.min(1, THICK / 2 - d))
    const i = (y * SIZE + x) * 4
    buf[i] = COLOR[0]; buf[i + 1] = COLOR[1]; buf[i + 2] = COLOR[2]; buf[i + 3] = Math.round(a * 255)
  }
}

// 盒式降采样到 44x44
const OUT = 44
const out = Buffer.alloc(OUT * OUT * 4)
for (let y = 0; y < OUT; y++) {
  for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const i = ((y * SS + sy) * SIZE + x * SS + sx) * 4
      const al = buf[i + 3] / 255
      r += buf[i] * al; g += buf[i + 1] * al; b += buf[i + 2] * al; a += al
    }
    const n = SS * SS
    const al = a / n
    const i = (y * OUT + x) * 4
    out[i] = a ? Math.round(r / a) : 0
    out[i + 1] = a ? Math.round(g / a) : 0
    out[i + 2] = a ? Math.round(b / a) : 0
    out[i + 3] = Math.round(al * 255)
  }
}

// 无依赖 PNG 编码（RGBA8，filter 0）
function crc32(b) {
  let c, table = []
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 }
  let crc = 0xffffffff
  for (const byte of b) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(OUT, 0); ihdr.writeUInt32BE(OUT, 4)
ihdr[8] = 8; ihdr[9] = 6  // 8-bit RGBA
const raw = Buffer.alloc(OUT * (OUT * 4 + 1))
for (let y = 0; y < OUT; y++) {
  out.copy(raw, y * (OUT * 4 + 1) + 1, y * OUT * 4, (y + 1) * OUT * 4)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])
const dest = 'src/assets/images/chevron_down_offwhite.png'
fs.writeFileSync(dest, png)
console.log('written', dest, png.length, 'bytes')
