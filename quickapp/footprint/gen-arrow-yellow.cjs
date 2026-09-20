// 重新生成 arrow_right_yellow.png：扫描线填充三角形，绕向无关，必定有内容
const zlib = require('zlib')
const fs = require('fs')

const SS = 4          // 4x 超采样抗锯齿
const OUT = 28
const COLOR = [0xe7, 0xff, 0x00]
// 三角形顶点（右箭头）：左上、右尖、左下
const A = [7, 5], B = [23, 14], C = [7, 23]

const S = OUT * SS
const buf = Buffer.alloc(S * S * 4)
// 扫描线：对每个 y，求与三条边交点的 min/max x
for (let y = 0; y < S; y++) {
  const fy = y / SS
  const xs = []
  for (const [[x1, y1], [x2, y2]] of [[A, B], [B, C], [C, A]]) {
    if ((fy >= y1 && fy <= y2) || (fy >= y2 && fy <= y1)) {
      if (y1 === y2) { xs.push(x1, x2) } else { xs.push(x1 + ((fy - y1) * (x2 - x1)) / (y2 - y1)) }
    }
  }
  if (!xs.length) continue
  const xMin = Math.max(0, Math.floor(Math.min(...xs) * SS))
  const xMax = Math.min(S - 1, Math.ceil(Math.max(...xs) * SS))
  for (let x = xMin; x <= xMax; x++) {
    const i = (y * S + x) * 4
    buf[i] = COLOR[0]; buf[i + 1] = COLOR[1]; buf[i + 2] = COLOR[2]; buf[i + 3] = 255
  }
}

// 盒式降采样
const out = Buffer.alloc(OUT * OUT * 4)
for (let y = 0; y < OUT; y++) {
  for (let x = 0; x < OUT; x++) {
    let a = 0
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) a += buf[((y * SS + sy) * S + x * SS + sx) * 4 + 3]
    const al = a / (SS * SS)
    const i = (y * OUT + x) * 4
    out[i] = COLOR[0]; out[i + 1] = COLOR[1]; out[i + 2] = COLOR[2]; out[i + 3] = Math.round(al / 255 * 255)
  }
}

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
ihdr.writeUInt32BE(OUT, 0); ihdr.writeUInt32BE(OUT, 4); ihdr[8] = 8; ihdr[9] = 6
const raw = Buffer.alloc(OUT * (OUT * 4 + 1))
for (let y = 0; y < OUT; y++) out.copy(raw, y * (OUT * 4 + 1) + 1, y * OUT * 4, (y + 1) * OUT * 4)
fs.writeFileSync('src/assets/images/arrow_right_yellow.png', Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
]))

// 自检：数不透明像素，空图直接报错
let opaque = 0
for (let i = 3; i < out.length; i += 4) if (out[i] > 40) opaque++
if (opaque < 50) { console.error('FAIL: only', opaque, 'opaque pixels'); process.exit(1) }
console.log('arrow_right_yellow.png regenerated,', opaque, 'opaque pixels')
