import assert from 'node:assert/strict'
import {
  attachHealth,
  detachHealth,
  healthAdapter,
  prematchView,
  resetAppForTests,
  tickWorld,
  useApp
} from '../src/common/app_state.js'

// In-memory fake of the @service.health module: records calls and lets a
// test push samples or trigger the subscribe fail callback on demand.
function fakeHealth() {
  const calls = { subscribed: 0, unsubscribed: 0, handler: null }
  const health = {
    DATA_TYPES: { HEART_RATE: 0, SPO2: 6, STRESS: 9 },
    subscribeSample(opts) {
      calls.subscribed += 1
      calls.handler = opts
    },
    unsubscribeSample() {
      calls.unsubscribed += 1
    }
  }
  return {
    calls,
    health,
    emitSample(value, timeStamp) {
      calls.handler.callback({ timeStamp: timeStamp || 1750000000000, value })
    },
    emitFail(code) {
      calls.handler.fail({}, code)
    }
  }
}

// --- adapter mechanics ------------------------------------------------------

{
  const f = fakeHealth()
  const a = healthAdapter(f.health)
  assert.equal(a.active, false)
  a.subscribe()
  assert.equal(a.active, true)
  assert.equal(f.calls.subscribed, 1)
  f.emitSample(73)
  assert.deepEqual(a.take(), { timeStamp: 1750000000000, value: 73 })
  assert.equal(a.take(), null, 'take drains the one-slot buffer')
  a.unsubscribe()
  assert.equal(a.active, false)
  assert.equal(f.calls.unsubscribed, 1)
  a.unsubscribe()
  assert.equal(f.calls.unsubscribed, 1, 'unsubscribe is idempotent')
}

// --- subscribe fail carries the guide error code ----------------------------

{
  const f = fakeHealth()
  const a = healthAdapter(f.health)
  a.subscribe()
  f.emitFail(203)
  assert.equal(a.failed, 203)
  assert.equal(a.active, false)
}

// --- live samples drive tickWorld; sim fallback stays the default -----------

{
  await resetAppForTests()
  const app = useApp()
  assert.equal(app.health, null)
  tickWorld(app.world, null)
  assert.equal(app.world.hrReady, true, 'sim world is ready after the first tick')
  assert.ok(app.world.hrBpm >= 96 && app.world.hrBpm <= 168)
}

// --- attached adapter: latest sample wins, readiness waits for first sample -

{
  await resetAppForTests()
  const f = fakeHealth()
  attachHealth(healthAdapter(f.health))
  const app = useApp()
  assert.equal(app.health.active, true, 'attachHealth subscribes immediately')
  tickWorld(app.world, null)
  assert.equal(app.world.hrReady, false, 'not ready before the first sample arrives')
  assert.equal(app.world.hrBpm, 0)
  f.emitSample(88)
  f.emitSample(92)
  tickWorld(app.world, null)
  assert.equal(app.world.hrRaw, 92, 'tickWorld consumes the latest buffered sample')
  assert.equal(app.world.hrReady, true)
  const readyRow = prematchView().rows.find(r => r.key === 'hr')
  assert.equal(readyRow.value, '腕式 就绪')
  f.emitSample(95)
  tickWorld(app.world, null)
  assert.equal(app.world.hrBpm, Math.round((92 + 95) / 2), 'sliding average over consumed samples')
  detachHealth()
  assert.equal(app.health, null)
  assert.equal(f.calls.unsubscribed, 1)
}

// --- subscribe fail: sim fallback resumes and Prematch shows the failure ----

{
  await resetAppForTests()
  const f = fakeHealth()
  attachHealth(healthAdapter(f.health))
  const app = useApp()
  f.emitFail(203)
  tickWorld(app.world, null)
  assert.ok(app.world.hrBpm >= 96 && app.world.hrBpm <= 168, 'falls back to the deterministic model after subscribe fail')
  const row = prematchView().rows.find(r => r.key === 'hr')
  assert.equal(row.value, '传感器不可用')
  assert.equal(row.tone, 'warn')
  detachHealth()
}

console.log('health_source tests passed')
