/**
 * 模拟器控制脚本（开发调试用）：截图 + 触摸注入。
 * 用法: node emu-ctrl.cjs shot <name>            截图保存到 .temp_screens/
 *       node emu-ctrl.cjs tap <x> <y>           点击
 *       node emu-ctrl.cjs press <ms> <x> <y>    按住指定毫秒后松开
 *       node emu-ctrl.cjs down <x> <y>          按下（不松开）
 *       node emu-ctrl.cjs up <x> <y>            松开
 *       node emu-ctrl.cjs move <x> <y>          按住状态下滑动到坐标
 *       node emu-ctrl.cjs tswipe <x1> <y1> <x2> <y2>  连续触摸滑动
 */
const fs = require('fs')
const path = require('path')
const { createGrpcClient } = require('@aiot-toolkit/emulator/lib/vvd/grpc/index.js')

const client = createGrpcClient({ 'grpc.port': 8558, 'grpc.token': '' })
function sendTouch(touches) {
  return new Promise((resolve, reject) => {
    client.client.sendTouch({ touches }, client.authMate, err => err ? reject(err) : resolve())
  })
}
function sendMouse(x, y, buttons) {
  return new Promise((resolve, reject) => {
    client.client.sendMouse({ x, y, buttons }, client.authMate, err => err ? reject(err) : resolve())
  })
}
const SCREENS_DIR = path.join(__dirname, '..', '.temp_screens')

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function shot(name) {
  await client.waitForReady()
  const buf = await client.getScreenshot()
  if (!buf || !buf.length) { console.log('EMPTY screenshot'); return }
  fs.mkdirSync(SCREENS_DIR, { recursive: true })
  const file = path.join(SCREENS_DIR, (name || 'screen') + '.png')
  fs.writeFileSync(file, buf)
  console.log('saved', file, buf.length, 'bytes')
}

async function tap(x, y) {
  await client.waitForReady()
  await sendMouse(x, y, 1)
  await sleep(80)
  await sendMouse(x, y, 0)
  console.log('tap', x, y)
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  if (cmd === 'shot') return shot(args[0])
  if (cmd === 'tap') return tap(Number(args[0]), Number(args[1]))
  if (cmd === 'down') {
    await client.waitForReady()
    await sendMouse(Number(args[0]), Number(args[1]), 1)
    return console.log('down', args[0], args[1])
  }
  if (cmd === 'move') {
    await client.waitForReady()
    await sendMouse(Number(args[0]), Number(args[1]), 1)
    return console.log('move', args[0], args[1])
  }
  if (cmd === 'up') {
    await client.waitForReady()
    await sendMouse(Number(args[0]), Number(args[1]), 0)
    return console.log('up', args[0], args[1])
  }
  if (cmd === 'press') {
    const ms = Number(args[0]); const x = Number(args[1]); const y = Number(args[2])
    await client.waitForReady()
    await sendMouse(x, y, 1)
    console.log('pressed at', x, y, 'for', ms, 'ms')
    await sleep(ms)
    await sendMouse(x, y, 0)
    console.log('released')
    return
  }
  if (cmd === 'key') {
    // evdev 116 = KEY_POWER
    const code = Number(args[0] || 116)
    await client.waitForReady()
    client.sendKey({ eventType: 0, codeType: 1, keyCode: code })
    await sleep(60)
    client.sendKey({ eventType: 1, codeType: 1, keyCode: code })
    return console.log('key', code)
  }
  if (cmd === 'ttap') {
    const x = Number(args[0]); const y = Number(args[1])
    await client.waitForReady()
    await sendTouch([{ x, y, identifier: 1, pressure: 1 }])
    await sleep(90)
    await sendTouch([])
    return console.log('ttap', x, y)
  }
  if (cmd === 'tswipe') {
    const x1 = Number(args[0]); const y1 = Number(args[1])
    const x2 = Number(args[2]); const y2 = Number(args[3])
    await client.waitForReady()
    for (let step = 0; step <= 6; step++) {
      const progress = step / 6
      await sendTouch([{ x: Math.round(x1 + (x2 - x1) * progress), y: Math.round(y1 + (y2 - y1) * progress), identifier: 1, pressure: 1 }])
      await sleep(35)
    }
    await sendTouch([{ x: x2, y: y2, identifier: 1, pressure: 0 }])
    await sleep(35)
    await sendTouch([])
    return console.log('tswipe', x1, y1, x2, y2)
  }
  if (cmd === 'tdown') {
    await client.waitForReady()
    await sendTouch([{ x: Number(args[0]), y: Number(args[1]), identifier: 1, pressure: 1 }])
    return console.log('tdown', args[0], args[1])
  }
  if (cmd === 'tmove') {
    await client.waitForReady()
    await sendTouch([{ x: Number(args[0]), y: Number(args[1]), identifier: 1, pressure: 1 }])
    return console.log('tmove', args[0], args[1])
  }
  if (cmd === 'tup') {
    await client.waitForReady()
    await sendTouch([])
    return console.log('tup', args[0], args[1])
  }
  console.log('unknown cmd')
}

main().then(() => process.exit(0), e => { console.error(e && e.message || e); process.exit(1) })
