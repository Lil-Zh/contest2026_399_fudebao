// Shared app state for the watch pages. Pure JS: app.ux injects the
// @system.storage adapter and the @service.health adapter; node tests
// inject in-memory fakes.
//
// The simulator world is deterministic (fixed formulas and scripted events)
// so every screen state in the UI design board can be reproduced exactly.
// Heart rate prefers the live @service.health stream when an adapter is
// attached (1 Hz HEART_RATE samples per the service.health guide) and
// falls back to the deterministic model otherwise.
import { acknowledge, appendHeartRate, appendLocation, applyEvent, createMatch, recover, setDirection } from './match_session.js'
import { haversineMeters, gpsPointAccepted } from './algorithms.js'
import { PitchRepository } from './pitch/repository.js'
import { PITCH_TYPE_11_FULL, PITCH_TYPE_CUSTOM, PITCH_PRESETS } from './pitch/presets.js'
import { pitchDisplaySize, pitchSubtitle } from './pitch/model.js'

const KEYS = { match: 'active_match', queue: 'pending_matches', history: 'match_history' }

const PANEL_MASK_OPACITY = 0.72
const PANEL_OPEN_DURATION_MS = 180
const PANEL_CLOSE_DURATION_MS = 160

// Pure timing model shared by the Record page and its regression test. The
// page applies the two returned values in its own Vela-compatible style path.
export function panelMotionFrame(direction, elapsedMs, height) {
  const opening = direction === 'open'
  const duration = opening ? PANEL_OPEN_DURATION_MS : PANEL_CLOSE_DURATION_MS
  const progress = Math.max(0, Math.min(1, elapsedMs / duration))
  const eased = opening
    ? 1 - Math.pow(1 - progress, 4)
    : Math.pow(progress, 3)
  const position = opening ? -height * (1 - eased) : -height * eased
  const opacity = opening ? PANEL_MASK_OPACITY * eased : PANEL_MASK_OPACITY * (1 - eased)
  return {
    translateY: Math.round(position) || 0,
    opacity: Number(opacity.toFixed(3)),
    done: progress === 1
  }
}

// MatchDetail 竖向滑屏：该 runtime 只派发 swipe（无触摸滑动），且动态 transform
// 会中断首帧渲染，位移用原生 top（与 Record 面板同法）。内容全部定高，
// 总高静态计算，不依赖运行时测量。
export const DETAIL_CONTENT_HEIGHT = 696 // 96 顶部安全区 + 76 标题 + 124 hero + 364 行(7×52) + 36 弦切余量
export const DETAIL_VIEWPORT_HEIGHT = 466 // 顶部安全区含在内容内，可视区即整屏设计高
export const DETAIL_SCROLL_STEP = 200
export const DETAIL_SCROLL_DURATION = 160

export function detailScrollMax() {
  return DETAIL_CONTENT_HEIGHT - DETAIL_VIEWPORT_HEIGHT
}

export function detailScrollClamp(offset) {
  return Math.max(0, Math.min(Math.round(offset), detailScrollMax()))
}

// 与 panelMotionFrame 同型的分帧纯函数：offset 为内容偏移量，y 为渲染用 top 值
export function detailScrollFrame(from, to, elapsedMs, durationMs) {
  const progress = Math.max(0, Math.min(1, elapsedMs / durationMs))
  const eased = 1 - Math.pow(1 - progress, 3)
  const offset = Math.round(from + (to - from) * eased)
  return { offset, y: -offset, done: progress === 1 }
}

// ---------------------------------------------------------------------------
// Deterministic simulator world
// ---------------------------------------------------------------------------

export function createWorld() {
  return {
    tick: 0, phoneConnected: false, gnss: 'searching', batteryPct: 86, storageMb: 412,
    hrReady: false, hrBpm: 0, hrRaw: 0, hrWindow: [], hrSeen: false,
    lastFix: null, filteredPoints: 0,
    // 功耗智能：自适应采样
    hypPrevFix: null, speedMps: 0, calmTicks: 0, sampleInterval: 1, lastEmitTick: 0,
    adaptiveSaved: 0, trackT: 0, lowPower: false,
    accuracyMeters: 0, lostUntilTick: 0, syncFailures: {}
  }
}

// 功耗智能参数：低于该速度视为静止；连续静止 N 秒后降到低频；低频间隔；低电量阈值
export const POWER_RULES = { MOTION_MPS: 0.8, CALM_TICKS: 5, CALM_INTERVAL_S: 5, LOW_BATTERY_PCT: 20 }

export function heartRateAt(t) {
  return clamp(Math.round(122 + 26 * Math.sin(t / 29) + 8 * Math.sin(t / 7)), 96, 168)
}

export function distanceDeltaAt(t) {
  return Math.round((1.6 + 0.9 * Math.abs(Math.sin(t / 13))) * 10) / 10
}

export function accuracyAt(t) {
  return [2.8, 3.0, 3.2, 2.9][t % 4]
}

const TRACK_AMPLITUDE_DEG = 0.00033 // 轨迹振幅：使实算速度均值 ≈2 m/s

// 轨迹按 trackT 演进：停球间歇期间 trackT 冻结，位置自然停在原地，
// 间歇结束后从原地继续——不会产生"跳回公式位置"的瞬移。
function trackFix(world) {
  return {
    latitude: 31.2304 + TRACK_AMPLITUDE_DEG * Math.sin(world.trackT / 17),
    longitude: 121.4737 + TRACK_AMPLITUDE_DEG * Math.cos(world.trackT / 19),
    accuracyMeters: world.accuracyMeters
  }
}

// One second of device time. Advances sensors, and while a match is
// recording appends one location and one heart-rate packet.
export function tickWorld(world, match) {
  world.tick += 1
  // 心率：优先消费 service.health 实时采样（1 Hz，最新一条生效）；未接入
  // 适配器或订阅失败时回退到确定性模型。显示值经 10 秒滑动平均平滑。
  const sample = app.health ? app.health.take() : null
  if (sample) {
    world.hrRaw = sample.value
    world.hrSeen = true
  } else if (!app.health || !app.health.active) {
    world.hrRaw = heartRateAt(world.tick)
    world.hrSeen = true
  }
  if (world.hrSeen) {
    world.hrWindow.push(world.hrRaw)
    if (world.hrWindow.length > 10) world.hrWindow.shift()
    world.hrBpm = Math.round(world.hrWindow.reduce((s, v) => s + v, 0) / world.hrWindow.length)
  }
  // 未接入适配器时沿用模拟器语义（首拍即就绪）；接入后须等首个真实采样
  world.hrReady = app.health ? app.health.active && world.hrSeen : world.tick >= 1
  // 低电量演示触发后保持脚本电量值，不再被公式覆盖
  if (!world.lowPower) world.batteryPct = Math.max(5, 86 - Math.floor(world.tick / 480))
  world.accuracyMeters = accuracyAt(world.tick)
  if (world.lostUntilTick > world.tick) {
    world.gnss = 'lost'
  } else if (world.tick < 3) {
    world.gnss = 'searching'
  } else {
    world.gnss = 'good'
  }
  // 演示脚本：01:30-01:50 停球间歇（轨迹时间冻结，运动员原地站立）；
  // 第 2 分钟注入精度超限点；第 2.5 分钟注入瞬移点——分别演示自适应降频与质量过滤。
  const stoppage = !!match && match.phase === 'recording' && match.elapsedSeconds + 1 >= 90 && match.elapsedSeconds + 1 < 110
  if (!stoppage) world.trackT += 1
  if (!match || match.phase !== 'recording') return
  // Scripted demo: GNSS drops for 45 s five minutes into the recording.
  if (match.elapsedSeconds === 300) world.lostUntilTick = world.tick + 45
  // Scripted demo: 10 分钟时电量降至 19%，触发低电量降采样模式
  if (match.elapsedSeconds === 600) world.batteryPct = Math.min(world.batteryPct, 19)
  match.elapsedSeconds += 1
  // While GNSS is lost the clock and heart rate keep recording (S11 banner).
  if (world.gnss === 'lost') {
    appendHeartRate(match, world.hrRaw)
    return
  }
  const fix = trackFix(world)
  if (match.elapsedSeconds === 120) fix.accuracyMeters = 38
  if (match.elapsedSeconds === 150) fix.latitude += 0.01
  // 运动检测：真机由加速度计承担，模拟器以逐秒轨迹位移代替（加速度计代理）
  if (world.hypPrevFix) world.speedMps = haversineMeters(world.hypPrevFix, fix)
  world.hypPrevFix = fix
  world.lowPower = world.batteryPct < POWER_RULES.LOW_BATTERY_PCT
  // 自适应采样状态机：运动恢复 1s/点；持续静止 5 秒降为 5s/点；低电量强制低频
  if (world.speedMps >= POWER_RULES.MOTION_MPS) {
    world.calmTicks = 0
    world.sampleInterval = 1
  } else {
    world.calmTicks += 1
    if (world.calmTicks >= POWER_RULES.CALM_TICKS) world.sampleInterval = POWER_RULES.CALM_INTERVAL_S
  }
  if (world.lowPower) world.sampleInterval = Math.max(world.sampleInterval, POWER_RULES.CALM_INTERVAL_S)
  const dt = world.tick - world.lastEmitTick
  if (dt >= world.sampleInterval) {
    if (!gpsPointAccepted(world.lastFix, fix, dt)) {
      world.filteredPoints += 1
    } else {
      const delta = world.lastFix ? haversineMeters(world.lastFix, fix) : 0
      appendLocation(match, Object.assign({
        speedMetersPerSecond: dt > 0 ? delta / dt : delta,
        distanceDeltaMeters: delta
      }, fix))
      world.lastFix = fix
      world.lastEmitTick = world.tick
    }
  } else {
    world.adaptiveSaved += 1
  }
  appendHeartRate(match, world.hrRaw)
}

// ---------------------------------------------------------------------------
// Formatters and labels (exact strings from the UI design board)
// ---------------------------------------------------------------------------

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

export function formatDistance(meters) {
  return (meters / 1000).toFixed(1) + ' km'
}

export function directionLabelOf(direction) {
  return direction === 'goalA' ? '左球门' : direction === 'goalB' ? '右球门' : '未定'
}

export function directionArrowOf(direction) {
  return direction === 'goalA' ? '◀' : direction === 'goalB' ? '▶' : '·'
}

export function oppositeDirection(direction) {
  return direction === 'goalA' ? 'goalB' : direction === 'goalB' ? 'goalA' : 'unknown'
}

export function halfLabelOf(match) {
  if (!match) return '上半场'
  return match.packets.some(p => p.kind === 'matchEvent' && p.eventType === 'secondHalfStart') ? '下半场' : '上半场'
}

export function heartSummaryOf(match) {
  const bpm = match.packets.filter(p => p.kind === 'heartRate').map(p => p.bpm)
  if (!bpm.length) return { avgHr: 0, maxHr: 0 }
  return { avgHr: Math.round(bpm.reduce((a, b) => a + b, 0) / bpm.length), maxHr: Math.max.apply(null, bpm) }
}

export function matchSummaryOf(match) {
  const hr = heartSummaryOf(match)
  return {
    duration: formatClock(match.elapsedSeconds),
    distance: formatDistance(match.distanceMeters),
    avgHr: hr.avgHr,
    maxHr: hr.maxHr
  }
}

function accuracyText(world) {
  if (world.gnss === 'good') return '良好 · ±' + world.accuracyMeters.toFixed(1) + ' m'
  if (world.gnss === 'lost') return '信号丢失'
  return '搜索中…'
}

function toneOfGnss(world) {
  return world.gnss === 'good' ? 'ok' : 'warn'
}

// ---------------------------------------------------------------------------
// App singleton
// ---------------------------------------------------------------------------

const app = { storage: null, health: null, hydrated: false, world: createWorld(), match: null, pitch: null, queue: [], history: [], pausedSeconds: 0, sync: null, pitches: null }

export function useApp() {
  return app
}

// 跨页导航动画标记：History 右滑返回前置位，Recovery onShow 消费。页面各自
// 独立 VM，靠模块级单例传标记（与 world/match 同一共享方式）。
export function markBackFromHistory() {
  app.backFromHistory = true
}

export function consumeBackFromHistory() {
  const v = !!app.backFromHistory
  app.backFromHistory = false
  return v
}

// 页面横向滑入分帧：进入页单边动画（前进从右 +384 滑入、返回从左 −384 滑入，
// 进入页盖在旧页上），原生 left 位移——动态 transform 在该 runtime 会中断首帧渲染
export const ENTER_SLIDE_DURATION = 200

export function enterSlideFrame(fromX, elapsedMs, durationMs) {
  const progress = Math.max(0, Math.min(1, elapsedMs / durationMs))
  const eased = 1 - Math.pow(1 - progress, 3)
  return { x: Math.round(fromX * (1 - eased)) + 0, done: progress === 1 }
}

// 2026-08-30 起全面圆屏 466×466 原生布局：页面尺寸按 466 设计，
// 旧的 432×514 设计板 compact 收缩（height<500 即触发）会让 466 圆屏
// 在入页 150ms 后整页字体/按钮缩小（用户可见的闪缩），故恒返回 false。
export function isCompactScreen(width, height) {
  return false
}

// A square viewport is not enough to describe a round watch: the usable
// width contracts sharply near the top and bottom arc. Pages use this flag
// to keep tappable controls inside a dedicated central safe column.
// 2026-08-25 起全面转为圆屏（466×466）单目标：方屏（432×514）不再支持。
// 恒返回 true，让所有页面的 .round 差异覆盖始终生效；方屏样式保留但不生效。
export function isRoundScreen(width, height) {
  return true
}

export function storageAdapter(storage) {
  // Native callbacks must use function syntax; this runtime's bridge drops
  // arrow functions. The timeout keeps promises settling even if a callback
  // is ever swallowed.
  return {
    get: function (key) {
      return new Promise(function (resolve) {
        var done = false
        var finish = function (v) {
          if (!done) {
            done = true
            resolve(v)
          }
        }
        setTimeout(function () {
          finish(null)
        }, 300)
        storage.get({
          key: key,
          success: function (data) {
            finish(data)
          },
          fail: function () {
            finish(null)
          }
        })
      })
    },
    set: function (key, value) {
      return new Promise(function (resolve) {
        var done = false
        var finish = function (v) {
          if (!done) {
            done = true
            resolve(v)
          }
        }
        setTimeout(function () {
          finish(false)
        }, 400)
        storage.set({
          key: key,
          value: value,
          success: function () {
            finish(true)
          },
          fail: function () {
            finish(false)
          }
        })
      })
    }
  }
}

export function attachStorage(adapter) {
  if (!app.storage && adapter) app.storage = adapter
}

// ---------------------------------------------------------------------------
// Health data source (@service.health)
// ---------------------------------------------------------------------------

// Wraps the raw @service.health module (guide v1.0.0: only the sampling trio
// is open; HEART_RATE arrives at 1 Hz). Native callbacks use function syntax —
// this runtime's bridge drops arrow functions. The adapter keeps only the
// latest sample; tickWorld consumes it once per second, which maps the 1 Hz
// stream onto the sim tick without queuing.
export function healthAdapter(health) {
  const HR = health.DATA_TYPES.HEART_RATE
  const adapter = {
    active: false,
    failed: 0,
    latest: null,
    subscribe: function () {
      if (adapter.active) return
      health.subscribeSample({
        dataType: HR,
        callback: function (sample) { adapter.latest = sample },
        fail: function (data, code) {
          adapter.failed = code || 200
          adapter.active = false
        }
      })
      adapter.active = true
    },
    unsubscribe: function () {
      if (!adapter.active) return
      health.unsubscribeSample({ dataType: HR })
      adapter.active = false
      adapter.latest = null
    },
    take: function () {
      const sample = adapter.latest
      adapter.latest = null
      return sample
    }
  }
  return adapter
}

export function attachHealth(adapter) {
  if (!app.health && adapter) {
    app.health = adapter
    adapter.subscribe()
  }
}

export function detachHealth() {
  if (!app.health) return
  app.health.unsubscribe()
  app.health = null
}

async function readJson(key) {
  if (!app.storage) return null
  const raw = await app.storage.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

export async function hydrateApp() {
  if (!app.world) app.world = createWorld()
  if (!app.pitches) app.pitches = PitchRepository(app.storage)
  await app.pitches.init()
  app.pitch = app.pitches.getCurrentPitch()
  if (!app.storage) return app
  // Each page runs in its own VM on the device: storage is the only source
  // of truth, so every show re-reads it before rendering.
  const rawMatch = await app.storage.get(KEYS.match)
  app.matchCorrupt = false
  app.matchCorruptRaw = null
  // 新系统镜像（miwear-5.0-beta）对缺失键可能经 success 回调返回非字符串
  // 垃圾值——只有「形似比赛 JSON 但解析/校验失败」才进入损坏态，
  // 其余一律视为空，避免全新安装被误判成数据异常。
  const looksLikeMatch = typeof rawMatch === 'string' && rawMatch.charAt(0) === '{'
  if (looksLikeMatch) {
    try {
      app.match = recover(rawMatch)
    } catch (e) {
      app.match = null
      app.matchCorrupt = true
      app.matchCorruptRaw = rawMatch
    }
  } else {
    app.match = null
  }
  app.queue = (await readJson(KEYS.queue)) || []
  app.history = (await readJson(KEYS.history)) || []
  app.hydrated = true
  return app
}

export async function resetAppForTests() {
  app.storage = null
  app.health = null
  app.hydrated = false
  app.world = createWorld()
  app.match = null
  app.matchCorrupt = false
  app.matchCorruptRaw = null
  app.pitch = null
  app.pitches = null
  app.queue = []
  app.history = []
  app.pausedSeconds = 0
  app.sync = null
  app.backFromHistory = false
}

async function persist(key, value) {
  if (app.storage) await app.storage.set(key, JSON.stringify(value))
}

export function persistMatch() {
  return persist(KEYS.match, app.match)
}

// ---------------------------------------------------------------------------
// Pitch selection API
// ---------------------------------------------------------------------------

export function getPitchRepository() {
  if (!app.pitches) app.pitches = PitchRepository(app.storage)
  return app.pitches
}

export async function selectPitch(typeOrId) {
  const repo = getPitchRepository()
  let pitch = null
  const custom = repo.getCustomPitches().find(p => p.id === typeOrId)
  if (custom) {
    pitch = await repo.selectPitch(custom)
  } else if (typeOrId && typeOrId.startsWith('preset-')) {
    pitch = await repo.selectPreset(typeOrId.replace('preset-', ''))
  } else {
    pitch = await repo.selectPreset(typeOrId)
  }
  app.pitch = pitch
  return pitch
}

export async function createCustomPitch(name, length, width) {
  const repo = getPitchRepository()
  const pitch = await repo.createAndSelectCustom(name, length, width)
  app.pitch = pitch
  return pitch
}

export async function updatePitchSize(pitchId, length, width) {
  const repo = getPitchRepository()
  const updated = await repo.updatePitchSize(pitchId, length, width)
  if (updated && app.pitch && app.pitch.id === updated.id) app.pitch = updated
  return updated
}

export async function calibratePitch(pitchId, length, width) {
  const repo = getPitchRepository()
  let updated = null
  if (app.pitch && app.pitch.id === pitchId) {
    updated = await repo.calibrateCurrentPitch(length, width)
  } else {
    updated = await repo.calibratePitchSize(pitchId, length, width)
  }
  if (updated && app.pitch && app.pitch.id === updated.id) app.pitch = updated
  return updated
}

export function recoveryPitchView() {
  const pitch = app.pitch
  return {
    selected: !!pitch,
    pitchName: pitch ? pitch.name : '请选择球场',
    pitchSize: pitch ? pitchSubtitle(pitch) : '',
    hint: pitch ? '' : '请选择一个内置球场后开始比赛',
    canStart: !!pitch
  }
}

export function pitchSelectorView() {
  return getPitchRepository().getSelectorView()
}

// ---------------------------------------------------------------------------
// Match flow
// ---------------------------------------------------------------------------

export function startMatch(direction) {
  if (!app.pitch) throw new Error('No pitch selected')
  if (app.match && ['recording', 'paused', 'halfTime'].includes(app.match.phase)) {
    addHistoryRecord(app.match, 'pending')
    app.queue.push(JSON.parse(JSON.stringify(app.match)))
    persistQueue()
  }
  const pitch = app.pitch
  const plan = {
    sessionId: 'lt-' + Date.now(),
    fieldName: pitch.name,
    attackDirection: direction,
    pitchId: pitch.id,
    pitchName: pitch.name,
    pitchType: pitch.type,
    pitchWidth: pitch.actualWidth,
    pitchLength: pitch.actualLength,
    calibrationStatus: pitch.isCalibrated ? 'calibrated' : 'default'
  }
  app.match = createMatch(plan)
  applyEvent(app.match, 'start')
  app.pausedSeconds = 0
  app.sync = null
  return persistMatch().then(() => app.match)
}

export function togglePause() {
  if (!app.match) return
  if (app.match.phase === 'recording') {
    applyEvent(app.match, 'pause')
  } else if (app.match.phase === 'paused') {
    applyEvent(app.match, 'resume')
    app.pausedSeconds = 0
  }
  return persistMatch()
}

export function endFirstHalf() {
  if (app.match && app.match.phase !== 'recording' && app.match.phase !== 'paused') return
  applyEvent(app.match, 'halfTime')
  return persistMatch()
}

export function startSecondHalf() {
  if (!app.match || app.match.phase !== 'halfTime') return
  applyEvent(app.match, 'secondHalfStart')
  app.pausedSeconds = 0
  return persistMatch()
}

// 中场页「继续上半场」：撤销 halfTime 回到 recording，计时从原处继续
export function resumeHalfTime() {
  if (!app.match || app.match.phase !== 'halfTime') return Promise.resolve()
  applyEvent(app.match, 'halfTimeResume')
  return persistMatch()
}

export function correctDirection() {
  if (!app.match) return
  setDirection(app.match, oppositeDirection(app.match.direction))
  persistMatch()
}

export function confirmEnd() {
  if (!app.match) return
  applyEvent(app.match, 'end', undefined, { confirmed: true })
  app.sync = null
  return persistMatch()
}

// Keeps unsynced raw recordings on the watch (they are never deleted on
// failure); a finished+synced match can simply be replaced by the next one.
export function archiveCurrentMatch() {
  if (!app.match) return
  const state = app.match.pending.length > 0 ? (app.sync && app.sync.phase === 'failed' ? 'failed' : 'pending') : 'synced'
  addHistoryRecord(app.match, state)
  if (app.match.pending.length > 0) {
    app.queue.push(JSON.parse(JSON.stringify(app.match)))
    persistQueue()
  }
  app.match = null
  app.sync = null
  return persistMatch()
}

// 损坏比赛归档（SR 异常态「保存这场比赛」）：原始 packets 已不可恢复，
// 台账留一条降级记录——尽力从损坏 JSON 摘出球场/时长，避免用户录的数据
// 无声消失。清空 active_match 与损坏标记。
export function archiveCorruptMatch() {
  const fallback = { sessionId: 'corrupt-' + Date.now(), fieldName: '未知球场', pitchType: '11-full', calibrationStatus: 'uncalibrated' }
  let plan = fallback
  let elapsedSeconds = 0
  try {
    const raw = JSON.parse(app.matchCorruptRaw || 'null')
    if (raw && raw.plan) {
      plan = Object.assign({}, raw.plan, {
        sessionId: raw.plan.sessionId || fallback.sessionId,
        fieldName: raw.plan.fieldName || fallback.fieldName,
        pitchType: raw.plan.pitchType || fallback.pitchType
      })
    }
    if (raw && Number.isFinite(raw.elapsedSeconds)) elapsedSeconds = raw.elapsedSeconds
  } catch (e) {}
  addHistoryRecord({ plan, elapsedSeconds, distanceMeters: 0, pending: [] }, 'synced')
  app.match = null
  app.matchCorrupt = false
  app.matchCorruptRaw = null
  return persistMatch()
}

// ---------------------------------------------------------------------------
// 比赛记录台账（History 页）：只存摘要 + 同步状态。
// 未结束的比赛不进台账（归恢复页管）。用户从历史页明确删除时，
// 对应的离线待同步原始记录也必须一并移除，避免其再次上传/出现。
// ---------------------------------------------------------------------------

function addHistoryRecord(match, syncState) {
  const existing = app.history.findIndex(r => r.sessionId === match.plan.sessionId)
  const pitchTypeName = pitchTypeLabel(match.plan.pitchType)
  const hr = heartSummaryOf(match)
  const record = {
    sessionId: match.plan.sessionId,
    fieldName: match.plan.fieldName,
    endedAt: Date.now(),
    durationSeconds: match.elapsedSeconds,
    distanceKm: +(match.distanceMeters / 1000).toFixed(2),
    syncState,
    pitchType: match.plan.pitchType,
    pitchTypeName,
    pitchWidth: match.plan.pitchWidth,
    pitchLength: match.plan.pitchLength,
    calibrationStatus: match.plan.calibrationStatus,
    avgHr: hr.avgHr,
    maxHr: hr.maxHr
  }
  if (existing >= 0) app.history[existing] = record
  else app.history.unshift(record)
  persistHistory()
}

function pitchTypeLabel(type) {
  const preset = PITCH_PRESETS.find(p => p.type === type)
  if (preset) return preset.name
  if (type === PITCH_TYPE_CUSTOM) return '自定义球场'
  return '自定义球场'
}

function persistHistory() {
  return persist(KEYS.history, app.history)
}

export function removeHistoryRecord(sessionId) {
  const historyIndex = app.history.findIndex(record => record.sessionId === sessionId)
  if (historyIndex < 0) return false

  app.history.splice(historyIndex, 1)
  const queueLength = app.queue.length
  app.queue = app.queue.filter(match => !match || !match.plan || match.plan.sessionId !== sessionId)
  persistHistory()
  if (app.queue.length !== queueLength) persistQueue()
  return true
}

function setHistoryState(sessionId, syncState) {
  const record = app.history.find(r => r.sessionId === sessionId)
  if (!record || record.syncState === syncState) return
  record.syncState = syncState
  persistHistory()
}

export function retryHistorySync(sessionId) {
  const record = app.history.find(r => r.sessionId === sessionId)
  if (!record || record.syncState !== 'failed') return null
  record.syncState = 'syncing'
  persistHistory()
  return record
}

// 台账重试的确定性结果（与 tickSync 的脚本一致：失败过一次后重试即成功）；
// 成功后同步状态翻转并从待同步队列移除对应比赛。
export function completeHistoryRetry(sessionId, ok) {
  const record = app.history.find(r => r.sessionId === sessionId)
  if (!record || record.syncState !== 'syncing') return
  record.syncState = ok ? 'synced' : 'failed'
  if (ok) {
    const idx = app.queue.findIndex(m => m.plan.sessionId === sessionId)
    if (idx >= 0) {
      app.queue.splice(idx, 1)
      persistQueue()
    }
  }
  persistHistory()
}

export function historyView() {
  return {
    empty: app.history.length === 0,
    rows: app.history.map(r => ({
      key: r.sessionId,
      title: r.fieldName,
      duration: formatClock(r.durationSeconds),
      distance: r.distanceKm.toFixed(1) + ' km',
      meta: formatHistoryMeta(r.endedAt) + ' · ' + (r.pitchTypeName || pitchTypeLabel(r.pitchType))
    }))
  }
}

// 单条记录的详情（MatchDetail 页）：台账只存摘要，配速由时长/距离换算，
// 心率等原始数据不保留，故详情只展示存得住的运动信息。
export function historyDetailView(sessionId) {
  const r = app.history.find(rec => rec.sessionId === sessionId)
  if (!r) return null
  return {
    key: r.sessionId,
    title: r.fieldName,
    meta: formatHistoryMeta(r.endedAt),
    duration: formatClock(r.durationSeconds),
    distance: r.distanceKm.toFixed(1) + ' km',
    pace: paceTextOfSummary(r.durationSeconds, r.distanceKm),
    avgHr: r.avgHr ? r.avgHr + ' bpm' : '--',
    maxHr: r.maxHr ? r.maxHr + ' bpm' : '--',
    pitchName: r.pitchTypeName || pitchTypeLabel(r.pitchType),
    pitchSize: r.pitchWidth && r.pitchLength ? r.pitchLength + ' × ' + r.pitchWidth + ' m' : '',
    calibration: r.calibrationStatus === 'calibrated' ? '已校准' : '默认尺寸'
  }
}

function formatHistoryMeta(ts) {
  const d = new Date(ts)
  const p = n => (n < 10 ? '0' : '') + n
  const today = new Date()
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startRecord = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDelta = Math.round((startToday - startRecord) / 86400000)
  const time = p(d.getHours()) + ':' + p(d.getMinutes())
  if (dayDelta === 0) return '今天 ' + time
  if (dayDelta === 1) return '昨天 ' + time
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + time
}

// ---------------------------------------------------------------------------
// Phone link and sync (four states: pending / syncing / synced / failed)
// ---------------------------------------------------------------------------

export function retryPhoneSync() {
  app.world.phoneConnected = true
  return true
}

// Deterministic phone model: with a cached pitch the phone comes back by
// itself ten seconds after launch (matches the "重新连接手机后自动同步" copy).
export function tickPrematch(world, pitch) {
  if (pitch && !world.phoneConnected && world.tick >= 10) world.phoneConnected = true
}

export function beginSync(match) {
  if (!match || match.pending.length === 0) return null
  app.sync = { phase: 'syncing', ticksLeft: 2, sessionId: match.plan.sessionId }
  return app.sync
}

export function tickSync(match) {
  const sync = app.sync
  if (!sync || sync.phase !== 'syncing' || !match || match.plan.sessionId !== sync.sessionId) return sync
  sync.ticksLeft -= 1
  if (sync.ticksLeft > 0) return sync
  const failures = app.world.syncFailures[sync.sessionId] || 0
  if (failures === 0) {
    // Scripted demo: the first attempt for every match fails once.
    app.world.syncFailures[sync.sessionId] = failures + 1
    sync.phase = 'failed'
  } else {
    acknowledge(match, match.sequence - 1)
    sync.phase = 'synced'
    persistMatch()
  }
  return sync
}

// Background retry for matches archived with 稍后提醒: succeeds after the
// scripted first failure, silently otherwise.
export function drainQueueOne() {
  if (!app.queue.length || !app.world.phoneConnected) return null
  const queued = app.queue[0]
  const failures = app.world.syncFailures[queued.plan.sessionId] || 0
  if (failures === 0) {
    app.world.syncFailures[queued.plan.sessionId] = failures + 1
    return null
  }
  app.queue.shift()
  persistQueue()
  // 后台补同步成功：台账对应记录翻转为已同步
  setHistoryState(queued.plan.sessionId, 'synced')
  return queued
}

function persistQueue() {
  return persist(KEYS.queue, app.queue)
}

// ---------------------------------------------------------------------------
// View models (one per screen group, strings match the design board)
// ---------------------------------------------------------------------------

export function prematchView() {
  const world = app.world
  const connected = world.phoneConnected
  const pitch = app.pitch
  const rows = [
    { key: 'phone', label: '手机', value: connected ? '已连接' : '未连接', tone: connected ? 'ok' : 'warn' },
    { key: 'gnss', label: 'GNSS', value: accuracyText(world), tone: toneOfGnss(world) },
    app.health && app.health.failed
      ? { key: 'hr', label: '心率', value: '传感器不可用', tone: 'warn' }
      : { key: 'hr', label: '心率', value: world.hrReady ? '腕式 就绪' : '准备中…', tone: 'ok' },
    { key: 'battery', label: '电量', value: world.batteryPct + '%', tone: 'ok' },
    { key: 'storage', label: '存储', value: world.storageMb + ' MB 可用', tone: 'ok' }
  ]
  return {
    empty: !pitch,
    header: connected ? '赛前检查 · 准备就绪' : '赛前检查',
    offline: !connected && !!pitch,
    fieldName: pitch ? pitch.name : '',
    fieldSub: pitch ? (pitchDisplaySize(pitch) + (pitch.isCalibrated ? ' · 已校准' : '')) : '',
    rows
  }
}

// Serialized location/heart-rate packets are ~220 bytes each; the estimate
// only backs the "约 X KB/MB" reassurance on the status page.
const PACKET_BYTES = 220

function pendingSizeText(count) {
  const kb = count * PACKET_BYTES / 1024
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB'
  return (kb >= 10 ? String(Math.round(kb)) : kb.toFixed(1)) + ' KB'
}

// 圆屏记录页环形进度条的分母：11 人制标准全场 90 分钟
const MATCH_PLANNED_SECONDS = 90 * 60

// 配速 min/km，无距离时显示占位
function paceTextOf(match) {
  if (!match || match.distanceMeters < 1 || !match.elapsedSeconds) return "--'--\""
  return paceTextOfSummary(match.elapsedSeconds, match.distanceMeters / 1000)
}

function paceTextOfSummary(elapsedSeconds, distanceKm) {
  // 不足 0.05 km 时距离显示为 0.0 km，配速无意义且与距离显示自相矛盾，显示占位
  if (!elapsedSeconds || !distanceKm || distanceKm < 0.05) return "--'--\""
  const secPerKm = elapsedSeconds / distanceKm
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return m + "'" + (s < 10 ? '0' : '') + s + '"'
}

export function recordView(pausedSeconds) {
  const match = app.match
  const world = app.world
  if (!match) return null
  const half = halfLabelOf(match)
  const paused = match.phase === 'paused'
  const pending = match.pending.length
  // 显示封顶 999+：整场两小时的队列可达五位数，长数字会撑爆状态行的宽度
  const shown = pending > 999 ? '999+' : pending
  const queueSize = pendingSizeText(pending)
  // 端到端形态：逐秒数据先暂存表内，本地缓存没有"待同步"语义，恒正常色；
  // 连手机同步是后续版本的能力，面板不再出现"未连接"式告警
  const cacheValue = pending === 0 ? '0 条' : shown + ' 条 · 约 ' + queueSize
  return {
    phase: match.phase,
    half,
    endHalfEnabled: half === '上半场',
    endHalfTitle: half === '上半场' ? '结束上半场' : '下半场进行中',
    endHalfSubtitle: half === '上半场' ? '进入中场休息 · 误点可返回继续' : '结束比赛请长按下方按钮',
    arrow: directionArrowOf(match.direction),
    directionText: match.direction === 'goalA' ? '左' : match.direction === 'goalB' ? '右' : '',
    directionLabel: directionLabelOf(match.direction),
    directionOpposite: directionLabelOf(oppositeDirection(match.direction)),
    clock: formatClock(match.elapsedSeconds),
    pausedClock: formatClock(pausedSeconds),
    recording: match.phase === 'recording',
    paused,
    gnssLost: world.gnss === 'lost',
    hrBpm: world.hrBpm,
    distance: formatDistance(match.distanceMeters),
    accuracy: world.gnss === 'lost' ? '信号丢失' : '±' + world.accuracyMeters.toFixed(1) + ' m · 良好',
    accuracyTone: toneOfGnss(world),
    phoneConnected: world.phoneConnected,
    pendingCount: match.pending.length,
    filteredPoints: world.filteredPoints,
    speedMps: world.speedMps,
    sampleInterval: world.sampleInterval,
    adaptiveSaved: world.adaptiveSaved,
    lowPower: world.lowPower,
    batteryPct: world.batteryPct,
    storageMb: world.storageMb,
    gnssSearching: world.gnss === 'searching',
    // 状态面板行（通知栏式）：GNSS 打头——定位精度是采集器的命脉；
    // 端到端形态：心率替代手机连接，本地缓存替代同步队列（无手机依赖）
    statusRows: [
      { key: 'gnss', icon: '/assets/images/st_gnss.png', label: 'GNSS 精度', value: world.gnss === 'good' ? '±' + world.accuracyMeters.toFixed(1) + ' m' : world.gnss === 'searching' ? '搜索中…' : '信号丢失', tone: toneOfGnss(world) },
      { key: 'hr', icon: '/assets/images/st_heart.png', label: '心率', value: world.hrReady ? world.hrBpm + ' bpm' : '准备中…', tone: 'ok' },
      { key: 'queue', icon: '/assets/images/st_sync.png', label: '本地缓存', value: cacheValue, tone: 'ok' },
      { key: 'battery', icon: '/assets/images/st_battery.png', label: '电量', value: world.batteryPct + '%', tone: world.lowPower ? 'warn' : 'ok' },
      { key: 'storage', icon: '/assets/images/st_storage.png', label: '存储', value: world.storageMb + ' MB 可用', tone: 'ok' }
    ],
    // 圆屏环形进度（加分项）：预计时长按标准全场 90 分钟；配速 = 时间 ÷ 距离
    elapsedSeconds: match.elapsedSeconds,
    plannedSeconds: MATCH_PLANNED_SECONDS,
    ringProgress: Math.min(1, match.elapsedSeconds / MATCH_PLANNED_SECONDS),
    pace: paceTextOf(match),
    controlTitle: half + ' · 进攻' + directionLabelOf(match.direction),
    correctTo: '改为进攻' + directionLabelOf(oppositeDirection(match.direction))
  }
}

export function halftimeView() {
  const match = app.match
  if (!match) return null
  const hr = heartSummaryOf(match)
  const next = oppositeDirection(match.direction)
  return {
    firstHalfClock: formatClock(match.elapsedSeconds),
    distanceNum: (match.distanceMeters / 1000).toFixed(1),
    avgHr: hr.avgHr || '--',
    maxHr: hr.maxHr || '--',
    nextDirectionLabel: directionLabelOf(next),
    nextArrowRight: next === 'goalB',
    stats: '距离 ' + formatDistance(match.distanceMeters) + ' · 平均心率 ' + (hr.avgHr || '--') + ' · 最高 ' + (hr.maxHr || '--'),
    autoSwitch: '下半场自动换向 · 进攻' + directionLabelOf(next)
  }
}

export function savedView() {
  const match = app.match
  if (!match) return null
  const summary = matchSummaryOf(match)
  const phase = app.sync ? (app.sync.phase === 'deferred' ? 'pending' : app.sync.phase) : 'pending'
  return {
    syncPhase: phase,
    duration: summary.duration,
    distance: summary.distance,
    avgHr: summary.avgHr || '--'
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}
