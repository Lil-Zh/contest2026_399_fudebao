// 生成状态面板 5 个线性图标（44x44 RGBA PNG，4x 超采样抗锯齿，#9d9d95）
// 形状用「线段折线 + 圆环 + 圆弧」的距离场表示，任一点 alpha = clamp(半线宽 - 最近距离)
const zlib = require('zlib')
const fs = require('fs')

const SS = 4
const SIZE = 44
const THICK = 3.4
const COLOR = [0x9d, 0x9d, 0x95]

const rad = d => (d * Math.PI) / 180

// 图形原语：返回 (x,y) -> 距离 的函数
const seg = (x1, y1, x2, y2) => (x, y) => {
  const dx = x2 - x1, dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}
const ring = (cx, cy, r) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r)
const arc = (cx, cy, r, a1, a2) => (x, y) => {
  const a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI
  const norm = s => ((s % 360) + 360) % 360
  const span = norm(a2 - a1)
  const rel = norm(a - a1)
  if (rel > span) {
    // 距离取到两个端点
    const e1 = [cx + r * Math.cos(rad(a1)), cy + r * Math.sin(rad(a1))]
    const e2 = [cx + r * Math.cos(rad(a2)), cy + r * Math.sin(rad(a2))]
    return Math.min(Math.hypot(x - e1[0], y - e1[1]), Math.hypot(x - e2[0], y - e2[1]))
  }
  return Math.abs(Math.hypot(x - cx, y - cy) - r)
}
const combine = (...fns) => (x, y) => Math.min(...fns.map(f => f(x, y)))
const rect = (x1, y1, x2, y2, cut = 3) => combine(
  seg(x1 + cut, y1, x2 - cut, y1), seg(x1 + cut, y2, x2 - cut, y2),
  seg(x1, y1 + cut, x1, y2 - cut), seg(x2, y1 + cut, x2, y2 - cut),
  arc(x1 + cut, y1 + cut, cut, 180, 270), arc(x2 - cut, y1 + cut, cut, 270, 360),
  arc(x1 + cut, y2 - cut, cut, 90, 180), arc(x2 - cut, y2 - cut, cut, 0, 90)
)
const ellipse = (cx, cy, rx, ry, a1 = 0, a2 = 360) => (x, y) => {
  // 椭圆弧：沿角度采样近似
  let best = 1e9
  for (let a = a1; a <= a2; a += 4) {
    const px = cx + rx * Math.cos(rad(a)), py = cy + ry * Math.sin(rad(a))
    best = Math.min(best, Math.hypot(x - px, y - py))
  }
  return best
}

const ICONS = {
  // 定位：圆环 + 四向刻度 + 中心点
  st_gnss: combine(
    ring(22, 22, 8),
    seg(22, 4, 22, 10), seg(22, 34, 22, 40), seg(4, 22, 10, 22), seg(34, 22, 40, 22),
    seg(22, 20.8, 22, 23.2)
  ),
  // 手机：圆角外框 + 听筒线
  st_phone: combine(rect(14, 5, 30, 39, 4), seg(19, 10, 25, 10)),
  // 同步：两条半圆弧 + 箭头
  st_sync: combine(
    arc(22, 22, 13, 210, 20),
    arc(22, 22, 13, 30, 200),
    seg(31.5, 12.5, 36, 9), seg(31.5, 12.5, 32.5, 17.5),   // 上弧箭头
    seg(12.5, 31.5, 8, 35), seg(12.5, 31.5, 11.5, 26.5)    // 下弧箭头
  ),
  // 电量：外框 + 正极 + 内部电量条
  st_battery: combine(
    rect(7, 15, 33, 29, 3),
    seg(35, 20, 35, 24),
    seg(11, 19, 19, 25)
  ),
  // 存储：圆柱（顶椭圆 + 两侧 + 底弧 + 中弧）
  st_storage: combine(
    ellipse(22, 12, 11, 4),
    seg(11, 12, 11, 32), seg(33, 12, 33, 32),
    ellipse(22, 32, 11, 4, 0, 180),
    ellipse(22, 21, 11, 4, 0, 180)
  )
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
function encodePng(out) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
  for (let y = 0; y < SIZE; y++) out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ])
}

for (const [name, shape] of Object.entries(ICONS)) {
  const big = new Float32Array(SIZE * SS * SIZE * SS)
  for (let y = 0; y < SIZE * SS; y++) for (let x = 0; x < SIZE * SS; x++) {
    big[y * SIZE * SS + x] = shape(x / SS, y / SS)
  }
  const out = Buffer.alloc(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const d = big[(y * SS + sy) * SIZE * SS + (x * SS + sx)]
      const al = Math.max(0, Math.min(1, THICK / 2 - d))
      r += COLOR[0] * al; g += COLOR[1] * al; b += COLOR[2] * al; a += al
    }
    const n = SS * SS, al = a / n, i = (y * SIZE + x) * 4
    out[i] = a ? Math.round(r / a) : 0; out[i + 1] = a ? Math.round(g / a) : 0; out[i + 2] = a ? Math.round(b / a) : 0
    out[i + 3] = Math.round(al * 255)
  }
  fs.writeFileSync(`src/assets/images/${name}.png`, encodePng(out))
  console.log('written', name + '.png')
}
