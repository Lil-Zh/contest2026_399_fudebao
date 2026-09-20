import assert from 'node:assert/strict'
import {
  accuracyAt,
  archiveCurrentMatch,
  attachStorage,
  beginSync,
  calibratePitch,
  confirmEnd,
  correctDirection,
  createCustomPitch,
  createWorld,
  distanceDeltaAt,
  drainQueueOne,
  endFirstHalf,
  formatClock,
  formatDistance,
  halfLabelOf,
  heartRateAt,
  hydrateApp,
  isRoundScreen,
  matchSummaryOf,
  oppositeDirection,
  prematchView,
  recordView,
  resetAppForTests,
  retryPhoneSync,
  selectPitch,
  savedView,
  startMatch,
  startSecondHalf,
  tickPrematch,
  tickSync,
  tickWorld,
  togglePause,
  updatePitchSize,
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

async function freshApp() {
  await resetAppForTests()
  const app = useApp()
  const storage = fakeStorage()
  app.__testStorage = storage
  attachStorage(storage)
  await hydrateApp()
  return app
}

// --- formatters -----------------------------------------------------------

assert.equal(formatClock(0), '00:00')
assert.equal(formatClock(151), '02:31')
assert.equal(formatClock(2538), '42:18')
assert.equal(formatClock(2700), '45:00')
assert.equal(formatClock(5400), '90:00')
assert.equal(formatDistance(5210), '5.2 km')
assert.equal(formatDistance(10400), '10.4 km')
assert.equal(isRoundScreen(466, 466), true, '466 × 466 watch uses the round layout')
assert.equal(isRoundScreen(432, 514), true, 'round-only: every screen shape takes the round layout')
assert.equal(isRoundScreen(0, 0), true, 'round-only: even without metrics the round layout applies')

// --- direction helpers ----------------------------------------------------

assert.equal(oppositeDirection('goalA'), 'goalB')
assert.equal(oppositeDirection('goalB'), 'goalA')

// --- deterministic sensor formulas ----------------------------------------

assert.equal(distanceDeltaAt(0), 1.6)
assert.equal(accuracyAt(0), 2.8)
assert.equal(accuracyAt(3), 2.9)
for (let t = 0; t < 2000; t++) {
  assert.ok(heartRateAt(t) >= 96 && heartRateAt(t) <= 168, 'heart rate within bounds at ' + t)
}

{
  const a = []
  const b = []
  const wa = createWorld()
  const wb = JSON.parse(JSON.stringify(wa))
  for (let i = 0; i < 50; i++) {
    tickWorld(wa, null)
    tickWorld(wb, null)
    a.push([wa.hrBpm, wa.gnss, wa.batteryPct])
    b.push([wb.hrBpm, wb.gnss, wb.batteryPct])
  }
  assert.deepEqual(a, b, 'world is deterministic')
  assert.equal(wa.gnss, 'good', 'gnss locks after warm-up')
}

// --- prematch screens (S0 / S1 / S2) --------------------------------------

{
  const app = await freshApp()
  let view = prematchView()
  assert.equal(view.empty, true, 'S0: no pitch yet')
  await selectPitch('11-full')
  retryPhoneSync()
  view = prematchView()
  assert.equal(view.empty, false)
  assert.equal(view.fieldName, '11人制标准场')
  assert.equal(view.fieldSub, '105 × 68 m')
  assert.equal(view.header, '赛前检查 · 准备就绪')
  assert.equal(view.rows.length, 5, 'S1: five self-check rows incl storage')
  assert.equal(view.rows[0].value, '已连接')
  assert.equal(view.rows[0].tone, 'ok')

  // relaunch with cached pitch: phone starts disconnected -> S2
  await resetAppForTests()
  attachStorage(app.__testStorage)
  await hydrateApp()
  view = prematchView()
  assert.equal(view.empty, false)
  assert.equal(view.offline, true, 'S2: offline variant with cached pitch')
  assert.equal(view.header, '赛前检查')
  assert.equal(view.rows.length, 5, 'S2: watch storage remains visible while the phone is disconnected')
  assert.equal(view.rows[0].value, '未连接')
  assert.equal(view.rows[0].tone, 'warn')
  // phone reconnects by itself after ten seconds
  const world = useApp().world
  for (let i = 0; i < 10; i++) tickWorld(world, null)
  tickPrematch(world, useApp().pitch)
  assert.equal(world.phoneConnected, true)
  assert.equal(prematchView().offline, false)
}

// --- local pitch selection: a pitch must be selected before a match ------

{
  const app = await freshApp()
  await selectPitch('5v5')
  let view = prematchView()
  assert.equal(view.empty, false, 'local 5-a-side selection creates a usable pitch')
  assert.equal(view.fieldName, '5人制球场')
  assert.equal(view.fieldSub, '40 × 20 m')
  assert.equal(view.offline, true, 'pitch selection does not pretend a phone is connected')

  await selectPitch('8v8')
  startMatch('goalA')
  assert.equal(app.match.plan.fieldName, '8人制球场')
  assert.equal(app.match.plan.pitchType, '8v8')
  assert.equal(app.match.plan.pitchLength, 68)
  assert.equal(app.match.plan.pitchWidth, 50)
  assert.equal(app.match.phase, 'recording', 'a selected pitch starts a full match without phone sync')
}

// --- custom pitch + size update + calibration -----------------------------

{
  const app = await freshApp()
  const custom = await createCustomPitch('小区球场', 55, 32)
  assert.equal(custom.name, '小区球场')
  assert.equal(custom.actualLength, 55)
  assert.equal(custom.actualWidth, 32)
  assert.equal(app.pitch.id, custom.id)

  await updatePitchSize(custom.id, 58, 34)
  assert.equal(useApp().pitch.actualLength, 58)
  assert.equal(useApp().pitch.actualWidth, 34)
  assert.equal(useApp().pitch.isCalibrated, false)

  await calibratePitch(custom.id, 57, 33)
  assert.equal(useApp().pitch.actualLength, 57)
  assert.equal(useApp().pitch.actualWidth, 33)
  assert.equal(useApp().pitch.isCalibrated, true)
  assert.equal(prematchView().fieldSub, '57 × 33 m · 已校准')
}

// --- record screens (S3 / S4 / S5) + halftime flow (S7) -------------------

{
  const app = await freshApp()
  await selectPitch('11-full')
  retryPhoneSync()
  for (let i = 0; i < 3; i++) tickWorld(app.world, null)
  startMatch('goalB')
  let view = recordView(0)
  assert.equal(view.recording, true)
  assert.equal(view.half, '上半场')
  assert.equal(view.arrow, '▶')
  assert.equal(view.controlTitle, '上半场 · 进攻右球门')
  assert.equal(view.correctTo, '改为进攻左球门')

  for (let i = 0; i < 30; i++) tickWorld(app.world, app.match)
  view = recordView(0)
  assert.equal(view.clock, '00:30')
  assert.ok(view.distance !== '0.0 km')
  assert.ok(app.match.packets.length >= 60, 'location + heart rate packets appended')

  // pause: clock freezes, no samples (S4)
  togglePause()
  assert.equal(app.match.phase, 'paused')
  for (let i = 0; i < 5; i++) tickWorld(app.world, app.match)
  view = recordView(5)
  assert.equal(view.clock, '00:30', 'clock frozen while paused')
  assert.equal(view.pausedClock, '00:05')
  togglePause()
  assert.equal(app.match.phase, 'recording')

  // halftime auto-switches direction for the second half (S7 note)
  endFirstHalf()
  assert.equal(app.match.phase, 'halfTime')
  startSecondHalf()
  assert.equal(halfLabelOf(app.match), '下半场')
  assert.equal(app.match.direction, 'goalA', 'auto switch goalB -> goalA')
  view = recordView(0)
  assert.equal(view.controlTitle, '下半场 · 进攻左球门')
  assert.equal(view.correctTo, '改为进攻右球门')
}

// --- 端上面板行：心率替代手机连接，本地缓存替代同步队列 ----------------------

{
  const app = await freshApp()
  await selectPitch('11-full')
  retryPhoneSync()
  for (let i = 0; i < 3; i++) tickWorld(app.world, null)
  startMatch('goalA')
  for (let i = 0; i < 30; i++) tickWorld(app.world, app.match)
  const view = recordView(0)
  assert.deepEqual(view.statusRows.map(r => r.key), ['gnss', 'hr', 'queue', 'battery', 'storage'])
  const hr = view.statusRows.find(r => r.key === 'hr')
  assert.equal(hr.label, '心率')
  assert.ok(hr.value.indexOf('bpm') > 0, 'panel shows the live heart rate')
  const queue = view.statusRows.find(r => r.key === 'queue')
  assert.equal(queue.label, '本地缓存')
  assert.equal(queue.tone, 'ok', 'local cache is never a warning')
}

// --- GNSS loss: clock and heart rate keep recording (S11) ------------------

{
  const app = await freshApp()
  await selectPitch('11-full')
  retryPhoneSync()
  for (let i = 0; i < 3; i++) tickWorld(app.world, null)
  startMatch('goalB')
  let lastPacketWasHr = 0
  for (let i = 0; i < 400; i++) {
    tickWorld(app.world, app.match)
    if (app.world.gnss === 'lost' && app.match.packets[app.match.packets.length - 1].kind === 'heartRate') {
      lastPacketWasHr++
    }
  }
  const view = recordView(0)
  assert.equal(view.gnssLost, false, 'loss window has ended after 45 s')
  assert.ok(app.match.elapsedSeconds === 400, 'clock kept ticking through the loss')
  assert.ok(lastPacketWasHr > 0, 'heart rate still recorded during GNSS loss')
  assert.ok(app.match.packets.length < 800, 'location packets skipped while lost')
}

// --- end confirmation + saved screen + sync states (S8 / S9 / S10) --------

{
  const app = await freshApp()
  await selectPitch('11-full')
  retryPhoneSync()
  for (let i = 0; i < 3; i++) tickWorld(app.world, null)
  startMatch('goalA')
  for (let i = 0; i < 120; i++) tickWorld(app.world, app.match)
  confirmEnd()
  assert.equal(app.match.phase, 'finished')
  let view = savedView()
  assert.equal(view.syncPhase, 'pending')
  assert.equal(view.duration, '02:00')

  // auto attempt: two ticks syncing, then the scripted first failure (S10)
  app.world.phoneConnected = true
  beginSync(app.match)
  assert.equal(tickSync(app.match).phase, 'syncing')
  assert.equal(tickSync(app.match).phase, 'failed')
  view = savedView()
  assert.equal(view.syncPhase, 'failed', 'S10 layout')

  // retry succeeds and clears the pending queue
  beginSync(app.match)
  tickSync(app.match)
  assert.equal(tickSync(app.match).phase, 'synced')
  assert.equal(app.match.pending.length, 0)
  assert.equal(savedView().syncPhase, 'synced')
}

// --- raw recordings are never deleted: archive + background drain ---------

{
  const app = await freshApp()
  await selectPitch('11-full')
  retryPhoneSync()
  for (let i = 0; i < 3; i++) tickWorld(app.world, null)
  startMatch('goalA')
  for (let i = 0; i < 60; i++) tickWorld(app.world, app.match)
  confirmEnd()
  // match left unsynced (phone away), user starts fresh next time
  app.world.phoneConnected = false
  archiveCurrentMatch()
  assert.equal(app.match, null)
  assert.equal(app.queue.length, 1, 'unsynced raw recording kept on watch')

  // starting a new match mid-recording also protects the old one
  await selectPitch('11-full')
  retryPhoneSync()
  startMatch('goalB')
  for (let i = 0; i < 10; i++) tickWorld(app.world, app.match)
  togglePause()
  app.queue = []
  startMatch('goalB')
  assert.equal(app.queue.length, 1)

  // background drain: first attempt fails (scripted), next one syncs
  assert.equal(drainQueueOne(), null)
  const drained = drainQueueOne()
  assert.ok(drained && drained.plan.sessionId, 'queued match synced in background')
  assert.equal(useApp().queue.length, 0)
}

// --- summary values --------------------------------------------------------

{
  const app = await freshApp()
  await selectPitch('11-full')
  retryPhoneSync()
  for (let i = 0; i < 3; i++) tickWorld(app.world, null)
  startMatch('goalA')
  for (let i = 0; i < 100; i++) tickWorld(app.world, app.match)
  const summary = matchSummaryOf(app.match)
  assert.equal(summary.duration, '01:40')
  assert.ok(summary.avgHr > 0 && summary.maxHr >= summary.avgHr)
  assert.ok(summary.distance.endsWith(' km'))
}

// --- pitch snapshot is independent from later template changes -------------

{
  const app = await freshApp()
  await selectPitch('8v8')
  startMatch('goalA')
  const plan = app.match.plan
  await updatePitchSize('preset-8v8', 70, 52)
  assert.equal(plan.pitchLength, 68, 'archived match keeps original length')
  assert.equal(plan.pitchWidth, 50, 'archived match keeps original width')
}

console.log('app_state tests passed')
