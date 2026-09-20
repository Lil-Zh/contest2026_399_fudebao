// 功耗智能（自适应采样 + 低电量模式）端到端测试
import assert from 'node:assert/strict'
import {
  POWER_RULES, attachStorage, createWorld, hydrateApp,
  recordView, resetAppForTests, selectPitch, startMatch, tickWorld, useApp
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

function freshMatch() {
  return {
    plan: { sessionId: 'p1', fieldName: '光明体育场' },
    phase: 'recording', direction: 'goalB', sequence: 0,
    elapsedSeconds: 0, distanceMeters: 0, packets: [], pending: [], syncedThrough: -1
  }
}

// --- 自适应采样：运动 1s/点，停球间歇自动降 5s/点，恢复运动回 1s/点 ---
{
  const world = createWorld()
  const match = freshMatch()
  const intervals = []
  for (let i = 0; i < 160; i++) {
    tickWorld(world, match)
    intervals.push(world.sampleInterval)
  }
  const activePhase = intervals.slice(0, 89)   // 0-89s：正常跑动
  const stoppagePhase = intervals.slice(94, 109) // 间歇稳定后
  const afterPhase = intervals.slice(115, 160)  // 间歇结束恢复跑动
  assert.ok(activePhase.every(v => v === 1), 'moving phase samples at 1s')
  assert.ok(stoppagePhase.every(v => v === POWER_RULES.CALM_INTERVAL_S), 'stoppage drops to 5s sampling')
  assert.ok(afterPhase.every(v => v === 1), 'motion resumes 1s sampling')
  assert.ok(world.adaptiveSaved > 10, 'skipped acquisitions counted: ' + world.adaptiveSaved)
  // 停球期间距离不应增长（轨迹冻结）
  const before = match.packets.filter(p => p.kind === 'location' && p.timestamp).length
  assert.ok(before > 0, 'location packets recorded')
}

// --- 停球期间距离冻结：间歇 90-109 秒内距离不增长，恢复后继续增长 ---
{
  const world = createWorld()
  const match = freshMatch()
  for (let i = 0; i < 90; i++) tickWorld(world, match) // elapsed 90，间歇开始
  const d1 = match.distanceMeters
  for (let i = 0; i < 20; i++) tickWorld(world, match) // elapsed 110，间歇结束
  const d2 = match.distanceMeters
  assert.ok(d2 - d1 < 5, 'distance frozen during stoppage, gained ' + (d2 - d1).toFixed(2) + 'm')
  for (let i = 0; i < 20; i++) tickWorld(world, match) // elapsed 130，恢复跑动
  const d3 = match.distanceMeters
  assert.ok(d3 - d2 > 10, 'distance resumes growing after stoppage, gained ' + (d3 - d2).toFixed(2) + 'm')
}

// --- 质量过滤仍然工作（间歇后的两个演示坏点） ---
{
  const world = createWorld()
  const match = freshMatch()
  for (let i = 0; i < 160; i++) tickWorld(world, match)
  assert.equal(world.filteredPoints, 2, 'scripted accuracy-spike and teleport points rejected')
}

// --- 低电量模式：10 分钟演示脚本把电量降到 19%，强制 5s 采样 ---
{
  await resetAppForTests()
  const app = useApp()
  attachStorage(fakeStorage())
  await hydrateApp()
  await selectPitch('11-full')
  startMatch('goalB')
  for (let i = 0; i < 599; i++) tickWorld(app.world, app.match)
  assert.equal(app.world.lowPower, false, 'not low power before demo trigger')
  assert.ok(app.world.batteryPct > POWER_RULES.LOW_BATTERY_PCT, 'battery above threshold before trigger')
  for (let i = 0; i < 10; i++) tickWorld(app.world, app.match) // 跨过 600s
  assert.ok(app.world.batteryPct <= POWER_RULES.LOW_BATTERY_PCT, 'battery dropped to 19%')
  assert.equal(app.world.lowPower, true, 'low power mode active')
  assert.equal(app.world.sampleInterval, POWER_RULES.CALM_INTERVAL_S, 'low power forces 5s interval even while moving')
  const view = recordView(0)
  assert.equal(view.lowPower, true)
  assert.equal(view.sampleInterval, 5)
}

// --- 确定性：两个世界跑同样时长结果一致 ---
{
  const wa = createWorld(); const ma = freshMatch()
  const wb = createWorld(); const mb = freshMatch()
  for (let i = 0; i < 200; i++) { tickWorld(wa, ma); tickWorld(wb, mb) }
  assert.equal(ma.distanceMeters, mb.distanceMeters, 'distance deterministic')
  assert.equal(wa.adaptiveSaved, wb.adaptiveSaved, 'adaptive counter deterministic')
  assert.equal(wa.filteredPoints, wb.filteredPoints)
}

console.log('adaptive power tests passed')
