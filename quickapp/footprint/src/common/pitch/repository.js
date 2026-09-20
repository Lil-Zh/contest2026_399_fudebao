import {
  createPitchFromPreset,
  createCustomPitch,
  updatePitchActualSize,
  calibratePitch,
  markPitchUsed,
  normalizePitch,
  pitchDisplaySize
} from './model.js'
import { PITCH_PRESETS, PITCH_TYPE_CUSTOM, findPreset } from './presets.js'
import {
  loadCurrentPitch,
  saveCurrentPitch,
  loadCustomPitches,
  saveCustomPitches,
  loadPresetOverrides,
  savePresetOverrides
} from './storage.js'

export function PitchRepository(storage) {
  let current = null
  let customs = []
  let overrides = {}

  async function init() {
    current = normalizePitch(await loadCurrentPitch(storage))
    customs = (await loadCustomPitches(storage)).map(normalizePitch).filter(Boolean)
    overrides = await loadPresetOverrides(storage)
  }

  function buildPreset(preset) {
    const pitch = createPitchFromPreset(preset)
    const ov = overrides[pitch.type]
    if (ov) {
      pitch.actualLength = ov.actualLength ?? pitch.actualLength
      pitch.actualWidth = ov.actualWidth ?? pitch.actualWidth
      pitch.isCalibrated = !!ov.isCalibrated
    }
    return pitch
  }

  function getPresets() {
    return PITCH_PRESETS.map(p => buildPreset(p))
  }

  function getCustomPitches() {
    return customs.slice()
  }

  function getAllPitches() {
    return getPresets().concat(getCustomPitches())
  }

  function getCurrentPitch() {
    return current
  }

  async function selectPitch(pitch) {
    if (!pitch) return null
    const used = markPitchUsed(pitch)
    current = used
    await saveCurrentPitch(storage, used)
    return used
  }

  async function selectPreset(type) {
    const preset = findPreset(type)
    if (!preset) return null
    return await selectPitch(buildPreset(preset))
  }

  async function createAndSelectCustom(name, length, width) {
    const pitch = createCustomPitch(name, length, width)
    customs.unshift(pitch)
    await saveCustomPitches(storage, customs)
    return await selectPitch(pitch)
  }

  async function updatePitchSize(pitchId, length, width) {
    if (!pitchId) return null
    if (pitchId.startsWith('preset-')) {
      const type = pitchId.replace('preset-', '')
      const preset = findPreset(type)
      if (!preset) return null
      overrides[type] = {
        actualLength: length ?? preset.defaultLength,
        actualWidth: width ?? preset.defaultWidth,
        isCalibrated: !!(overrides[type] && overrides[type].isCalibrated)
      }
      await savePresetOverrides(storage, overrides)
      if (current && current.id === pitchId) {
        current = buildPreset(preset)
        current.lastUsedAt = Date.now()
        await saveCurrentPitch(storage, current)
      }
      return buildPreset(preset)
    }
    return await updateCustomPitch(pitchId, { length, width })
  }

  async function calibratePitchSize(pitchId, length, width) {
    if (!pitchId) return null
    if (pitchId.startsWith('preset-')) {
      const type = pitchId.replace('preset-', '')
      const preset = findPreset(type)
      if (!preset) return null
      overrides[type] = {
        actualLength: length ?? preset.defaultLength,
        actualWidth: width ?? preset.defaultWidth,
        isCalibrated: true
      }
      await savePresetOverrides(storage, overrides)
      if (current && current.id === pitchId) {
        current = buildPreset(preset)
        current.lastUsedAt = Date.now()
        await saveCurrentPitch(storage, current)
      }
      return buildPreset(preset)
    }
    return await updateCustomPitch(pitchId, { length, width, isCalibrated: true })
  }

  async function updateCustomPitch(pitchId, updates) {
    const idx = customs.findIndex(p => p.id === pitchId)
    if (idx < 0) return null
    const existing = customs[idx]
    let updated = existing
    if (updates.name !== undefined) updated = Object.assign({}, updated, { name: updates.name || existing.name })
    if (updates.length !== undefined || updates.width !== undefined) {
      updated = updatePitchActualSize(updated, updates.length ?? updated.actualLength, updates.width ?? updated.actualWidth)
    }
    if (updates.isCalibrated) updated = Object.assign({}, updated, { isCalibrated: true })
    customs[idx] = updated
    await saveCustomPitches(storage, customs)
    if (current && current.id === pitchId) {
      current = updated
      await saveCurrentPitch(storage, current)
    }
    return updated
  }

  async function calibrateCurrentPitch(length, width) {
    if (!current) return null
    const updated = calibratePitch(current, length, width)
    return await selectPitch(updated)
  }

  function getRecentPitch() {
    const candidates = []
    if (current && current.lastUsedAt > 0) candidates.push(current)
    getCustomPitches().forEach(p => { if (p.lastUsedAt > 0) candidates.push(p) })
    if (!candidates.length) return null
    return candidates.reduce((a, b) => (a.lastUsedAt > b.lastUsedAt ? a : b))
  }

  function getSelectorView() {
    const recent = getRecentPitch()
    const selectedId = current ? current.id : ''
    const presets = getPresets().map(p => ({
      id: p.id,
      type: p.type,
      name: p.name,
      size: pitchDisplaySize(p),
      selected: p.id === selectedId
    }))
    const customPitches = getCustomPitches().map(p => ({
      id: p.id,
      type: p.type,
      name: p.name,
      size: pitchDisplaySize(p),
      selected: p.id === selectedId
    }))
    return {
      recent: recent && recent.id !== selectedId
        ? { id: recent.id, type: recent.type, name: recent.name, size: pitchDisplaySize(recent), selected: false }
        : null,
      presets,
      customPitches,
      hasCustom: customPitches.length > 0
    }
  }

  return {
    init,
    getPresets,
    getCustomPitches,
    getAllPitches,
    getCurrentPitch,
    selectPitch,
    selectPreset,
    createAndSelectCustom,
    updatePitchSize,
    calibratePitchSize,
    updateCustomPitch,
    calibrateCurrentPitch,
    getRecentPitch,
    getSelectorView
  }
}
