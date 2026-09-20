// 生成首页球场示意图 pitch_diagram.png（224x148 RGBA PNG，4x 超采样抗锯齿，#e7ff00）
// 形状用「圆角矩形 + 线段 + 圆环 + 圆弧」的距离场表示，任一点 alpha = clamp(半线宽 - 最近距离)
// 比 Recovery 页旧的 CSS 边框绘制：同为边界/中线/中圈/禁区四要素，
// 但线条经 4x 超采样后边缘平滑（CSS border 在低分辨率圆屏上锯齿明显）。
// 小尺寸下中点/点球点/角弧会糊成噪点，刻意不画。
const zlib = require('zlib')
const fs = require('fs')

const SS = 4
const W = 224
const H = 148
const THICK = 2.4
const COLOR = [0xe7, 0xff, 0x00]

const rad = d => (d * Math.PI) / 180

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

const S = THICK / 2
// 与原 CSS 版同稿：圆角边界 + 中线 + 中圈 + 两侧禁区。
// 小尺寸下中点/点球点/角弧都会糊成噪点（角弧与圆角边界相交会出"叉"），故不画。
const PITCH = combine(
  rect(S, S, W - S, H - S, 20),       // 圆角边界（角半径与原 CSS 一致）
  seg(W / 2, 4, W / 2, H - 4),        // 中线
  ring(W / 2, H / 2, 31),             // 中圈
  rect(S, 40, S + 30, 107, 0),        // 左禁区（与原 CSS 同位置）
  rect(W - S - 30, 40, W - S, 107, 0) // 右禁区
)

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
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.alloc(H * (W * 4 + 1))
  for (let y = 0; y < H; y++) out.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ])
}

const big = new Float32Array(W * SS * H * SS)
for (let y = 0; y < H * SS; y++) for (let x = 0; x < W * SS; x++) {
  big[y * W * SS + x] = PITCH(x / SS, y / SS)
}
const out = Buffer.alloc(W * H * 4)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let r = 0, g = 0, b = 0, a = 0
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
    const d = big[(y * SS + sy) * W * SS + (x * SS + sx)]
    const al = Math.max(0, Math.min(1, THICK / 2 - d))
    r += COLOR[0] * al; g += COLOR[1] * al; b += COLOR[2] * al; a += al
  }
  const n = SS * SS, al = a / n, i = (y * W + x) * 4
  out[i] = a ? Math.round(r / a) : 0; out[i + 1] = a ? Math.round(g / a) : 0; out[i + 2] = a ? Math.round(b / a) : 0
  out[i + 3] = Math.round(al * 255)
}
fs.writeFileSync('src/assets/images/pitch_diagram.png', encodePng(out))
console.log('written pitch_diagram.png')
