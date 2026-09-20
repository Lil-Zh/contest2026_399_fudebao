// Full-match walkthrough: drives every screen state of the UI design board
// (S0-S11 + sync states) through the shared app_state, the way the pages do.
import assert from 'node:assert/strict'
import {
  attachStorage,
  beginSync,
  confirmEnd,
  correctDirection,
  drainQueueOne,
  endFirstHalf,
  halftimeView,
  hydrateApp,
  matchSummaryOf,
  prematchView,
  recordView,
  resetAppForTests,
  resumeHalfTime,
  retryPhoneSync,
  savedView,
  selectPitch,
  startMatch,
  startSecondHalf,
  tickPrematch,
  tickSync,
  tickWorld,
  togglePause,
  useApp
} from '../src/common/app_state.js'

function fakeStorage() {
  const map = new Map()
  return {
    get: async key => (map.has(key) ? map.get(key) : null),
    set: async (key, value) => {
      map.set(key, value)
      return true
    }
  }
}

async function boot() {
  await resetAppForTests()
  attachStorage(fakeStorage())
  await hydrateApp()
}

// S0: fresh install, no pitch
await boot()
const app = useApp()
let pre = prematchView()
assert.equal(pre.empty, true)

// S0 -> S1: select a built-in pitch and connect the phone
await selectPitch('11-full')
retryPhoneSync()
for (let i = 0; i < 3; i++) tickWorld(app.world, null)
pre = prematchView()
assert.equal(pre.empty, false)
assert.equal(pre.offline, false)
assert.equal(pre.header, '赛前检查 · 准备就绪')
assert.equal(pre.fieldName, '11人制标准场')
assert.equal(pre.rows.length, 5)
assert.ok(pre.rows.every(r => r.tone === 'ok'), 'all self-checks green')

// S1 -> S3: 开始比赛, record for a while
startMatch('goalB')
let rec = recordView(0)
assert.equal(rec.recording, true)
assert.equal(rec.half, '上半场')
assert.equal(rec.arrow, '▶')
assert.equal(rec.endHalfEnabled, true)
assert.equal(rec.endHalfTitle, '结束上半场')
assert.equal(rec.endHalfSubtitle, '进入中场休息 · 误点可返回继续')
for (let i = 0; i < 120; i++) tickWorld(app.world, app.match)
rec = recordView(0)
assert.equal(rec.clock, '02:00')
assert.ok(rec.hrBpm >= 96 && rec.hrBpm <= 168)
assert.equal(app.match.pending.length > 0, true)

// S5 status rows mirror live world state
assert.equal(rec.phoneConnected, true)
assert.equal(rec.pendingCount, app.match.pending.length)
assert.equal(rec.batteryPct, 86)
assert.equal(rec.storageMb, 412)

// S6 control: direction correction flips the chip and the button copy
assert.equal(rec.controlTitle, '上半场 · 进攻右球门')
assert.equal(rec.correctTo, '改为进攻左球门')
correctDirection()
rec = recordView(0)
assert.equal(rec.controlTitle, '上半场 · 进攻左球门')
assert.equal(rec.correctTo, '改为进攻右球门')
correctDirection()

// S4: pause freezes the clock, tracks pause duration, resume continues
togglePause()
for (let i = 0; i < 31; i++) tickWorld(app.world, app.match)
rec = recordView(31)
assert.equal(rec.paused, true)
assert.equal(rec.clock, '02:00')
assert.equal(rec.pausedClock, '00:31')
togglePause()
for (let i = 0; i < 10; i++) tickWorld(app.world, app.match)
rec = recordView(0)
assert.equal(rec.clock, '02:10')

// S7: ending the first half is reversible without changing match data.
endFirstHalf()
let half = halftimeView()
assert.equal(half.firstHalfClock, '02:10')
assert.ok(half.stats.includes('距离'))
assert.ok(half.stats.includes('平均心率'))
assert.equal(half.autoSwitch, '下半场自动换向 · 进攻左球门')
// 撤销入口文案由页面模板渲染（PNG 箭头 + 文字），视图层不再提供 resumeLabel
assert.equal(half.resumeLabel, undefined)
const beforeResume = {
  elapsedSeconds: app.match.elapsedSeconds,
  distanceMeters: app.match.distanceMeters,
  direction: app.match.direction
}
await resumeHalfTime()
assert.equal(app.match.phase, 'recording')
assert.equal(app.match.elapsedSeconds, beforeResume.elapsedSeconds)
assert.equal(app.match.distanceMeters, beforeResume.distanceMeters)
assert.equal(app.match.direction, beforeResume.direction)
assert.equal(app.match.packets[app.match.packets.length - 1].eventType, 'halfTimeResume')

// Re-enter halftime, then start the second half and make the former primary
// action read-only so a tap can never end the match.
await endFirstHalf()
half = halftimeView()
startSecondHalf()
rec = recordView(0)
assert.equal(rec.half, '下半场')
assert.equal(rec.arrow, '◀', 'auto-switched to left goal')
assert.equal(rec.endHalfEnabled, false)
assert.equal(rec.endHalfTitle, '下半场进行中')
assert.equal(rec.endHalfSubtitle, '结束比赛请长按下方按钮')

// S11: scripted GNSS loss at 05:00 keeps clock and heart rate recording
let sawLost = false
let lastKindDuringLost = ''
for (let i = 0; i < 300; i++) {
  tickWorld(app.world, app.match)
  if (app.world.gnss === 'lost') {
    sawLost = true
    lastKindDuringLost = app.match.packets[app.match.packets.length - 1].kind
  }
}
assert.ok(sawLost, 'S11 loss window occurred')
assert.equal(lastKindDuringLost, 'heartRate', 'heart rate still recorded while lost')
rec = recordView(0)
assert.equal(rec.gnssLost, false, '45 s loss window has ended by now')
assert.equal(rec.clock, '07:10')

// S8 -> S9: long-press confirm ends the match
confirmEnd()
assert.equal(app.match.phase, 'finished')
const saved = savedView()
assert.equal(saved.syncPhase, 'pending')
const summary = matchSummaryOf(app.match)
assert.equal(summary.duration, rec.clock)

// S9 -> S10 -> S9: first sync attempt fails (scripted), retry succeeds
app.world.phoneConnected = true
beginSync(app.match)
tickSync(app.match)
assert.equal(tickSync(app.match).phase, 'failed')
assert.equal(savedView().syncPhase, 'failed')
beginSync(app.match)
tickSync(app.match)
assert.equal(tickSync(app.match).phase, 'synced')
assert.equal(savedView().syncPhase, 'synced')
assert.equal(app.match.pending.length, 0)

// 完成 returns to prematch; a deferred (稍后提醒) match drains in background
await boot()
const app3 = useApp()
await selectPitch('11-full')
retryPhoneSync()
startMatch('goalA')
for (let i = 0; i < 5; i++) tickWorld(app3.world, app3.match)
confirmEnd()
app3.world.phoneConnected = true
drainQueueOne()
const drained = drainQueueOne()
assert.ok(drained === null || drained.plan, 'drain either retries or completes')

console.log('full_flow tests passed')
