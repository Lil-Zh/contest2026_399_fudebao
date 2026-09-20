import assert from 'node:assert/strict'
import { PitchRepository } from '../src/common/pitch/repository.js'
import { createCustomPitch, createPitchFromPreset, formatPitchSize, normalizePitch, pitchDisplaySize, pitchSubtitle } from '../src/common/pitch/model.js'
import { PITCH_PRESETS, PITCH_TYPE_5V5, PITCH_TYPE_8V8, PITCH_TYPE_CUSTOM, findPreset } from '../src/common/pitch/presets.js'

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

// --- presets --------------------------------------------------------------

assert.equal(PITCH_PRESETS.length, 5, 'five built-in presets')
assert.ok(findPreset('5v5'), '5v5 preset exists')
assert.ok(findPreset('11-full'), '11-full preset exists')
assert.equal(findPreset('unknown'), null, 'unknown preset returns null')

// --- model ----------------------------------------------------------------

{
  const p5 = createPitchFromPreset('5v5')
  assert.equal(p5.type, '5v5')
  assert.equal(p5.name, '5人制球场')
  assert.equal(p5.defaultLength, 40)
  assert.equal(p5.defaultWidth, 20)
  assert.equal(p5.actualLength, 40)
  assert.equal(p5.actualWidth, 20)
  assert.equal(p5.isCustom, false)
  assert.equal(p5.isCalibrated, false)
  assert.ok(p5.id.startsWith('preset-'))

  const custom = createCustomPitch('测试场', 42, 22)
  assert.equal(custom.type, PITCH_TYPE_CUSTOM)
  assert.equal(custom.name, '测试场')
  assert.equal(custom.actualLength, 42)
  assert.equal(custom.actualWidth, 22)
  assert.equal(custom.isCustom, true)
  assert.ok(custom.id.startsWith('custom-'))

  assert.equal(formatPitchSize(40, 20), '40 × 20 m')
  assert.equal(pitchDisplaySize(p5), '40 × 20 m')
  assert.equal(pitchSubtitle(p5), '40 × 20 m')
}

// --- repository: select and persist ---------------------------------------

{
  const storage = fakeStorage()
  const repo = PitchRepository(storage)
  await repo.init()
  assert.equal(repo.getCurrentPitch(), null, 'no current pitch before selection')

  const selected = await repo.selectPreset(PITCH_TYPE_8V8)
  assert.equal(selected.name, '8人制球场')
  assert.equal(repo.getCurrentPitch().id, selected.id)

  const recent = repo.getRecentPitch()
  assert.equal(recent.id, selected.id, 'recent pitch is the last selected')

  const view = repo.getSelectorView()
  assert.equal(view.presets.length, 5)
  assert.equal(view.presets.find(p => p.type === PITCH_TYPE_8V8).selected, true)
  assert.equal(view.recent, null, 'recent is not shown when it equals current selection')
}

// --- repository: built-in preset size override ----------------------------

{
  const storage = fakeStorage()
  const repo = PitchRepository(storage)
  await repo.init()
  await repo.selectPreset(PITCH_TYPE_8V8)
  const updated = await repo.updatePitchSize('preset-' + PITCH_TYPE_8V8, 70, 52)
  assert.equal(updated.actualLength, 70)
  assert.equal(updated.actualWidth, 52)
  assert.equal(updated.isCalibrated, false)

  // reselecting the same preset keeps the override
  const reselected = await repo.selectPreset(PITCH_TYPE_8V8)
  assert.equal(reselected.actualLength, 70, 'preset override persists across selections')
  assert.equal(reselected.actualWidth, 52)

  const calibrated = await repo.calibratePitchSize('preset-' + PITCH_TYPE_8V8, 68, 50)
  assert.equal(calibrated.isCalibrated, true)
}

// --- repository: custom pitches -------------------------------------------

{
  const storage = fakeStorage()
  const repo = PitchRepository(storage)
  await repo.init()

  const custom = await repo.createAndSelectCustom('小区球场', 55, 32)
  assert.equal(custom.name, '小区球场')
  assert.equal(repo.getCustomPitches().length, 1)
  assert.equal(repo.getCurrentPitch().id, custom.id)

  const view = repo.getSelectorView()
  assert.equal(view.customPitches.length, 1)
  assert.equal(view.customPitches[0].selected, true)
}

// --- repository: rehydration ----------------------------------------------

{
  const storage = fakeStorage()
  const repoA = PitchRepository(storage)
  await repoA.init()
  await repoA.selectPreset(PITCH_TYPE_5V5)
  await repoA.createAndSelectCustom(' backyard ', 30, 15)

  const repoB = PitchRepository(storage)
  await repoB.init()
  assert.equal(repoB.getCurrentPitch().name, 'backyard', 'current pitch restored')
  assert.equal(repoB.getCustomPitches().length, 1, 'custom pitches restored')
}

// --- normalizePitch -------------------------------------------------------

{
  const raw = { id: 'preset-5v5', type: '5v5', actualLength: 44, actualWidth: 22, isCalibrated: true, lastUsedAt: 12345 }
  const normalized = normalizePitch(raw)
  assert.equal(normalized.name, '5人制球场')
  assert.equal(normalized.defaultLength, 40)
  assert.equal(normalized.actualLength, 44)
  assert.equal(normalized.isCalibrated, true)
  assert.equal(normalized.lastUsedAt, 12345)
}

console.log('pitch tests passed')
