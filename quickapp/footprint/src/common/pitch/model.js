import { PITCH_TYPE_CUSTOM, PITCH_PRESETS, findPreset } from './presets.js'

function makeId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
}

export function formatPitchSize(length, width) {
  return length + ' × ' + width + ' m'
}

export function pitchDisplaySize(pitch) {
  if (!pitch) return ''
  return formatPitchSize(pitch.actualLength, pitch.actualWidth)
}

export function pitchDisplayLabel(pitch) {
  if (!pitch) return '请选择球场'
  return pitch.name
}

export function pitchSubtitle(pitch) {
  if (!pitch) return ''
  const size = pitchDisplaySize(pitch)
  return pitch.isCalibrated ? size + ' · 已校准' : size
}

export function createPitchFromPreset(presetOrType) {
  const preset = typeof presetOrType === 'string' ? findPreset(presetOrType) : presetOrType
  if (!preset) return null
  return {
    id: 'preset-' + preset.type,
    type: preset.type,
    name: preset.name,
    defaultLength: preset.defaultLength,
    defaultWidth: preset.defaultWidth,
    actualLength: preset.defaultLength,
    actualWidth: preset.defaultWidth,
    isCustom: false,
    isCalibrated: false,
    lastUsedAt: 0
  }
}

export function createCustomPitch(name, length, width) {
  const safeName = (name || '').trim() || '自定义球场'
  const safeLength = clampDimension(length, 10, 200)
  const safeWidth = clampDimension(width, 5, 100)
  return {
    id: makeId('custom'),
    type: PITCH_TYPE_CUSTOM,
    name: safeName,
    defaultLength: safeLength,
    defaultWidth: safeWidth,
    actualLength: safeLength,
    actualWidth: safeWidth,
    isCustom: true,
    isCalibrated: false,
    lastUsedAt: Date.now()
  }
}

export function updatePitchActualSize(pitch, length, width) {
  if (!pitch) return null
  return Object.assign({}, pitch, {
    actualLength: clampDimension(length, 5, 300),
    actualWidth: clampDimension(width, 5, 200),
    lastUsedAt: Date.now()
  })
}

export function calibratePitch(pitch, length, width) {
  if (!pitch) return null
  return Object.assign({}, pitch, {
    actualLength: clampDimension(length, 5, 300),
    actualWidth: clampDimension(width, 5, 200),
    isCalibrated: true,
    lastUsedAt: Date.now()
  })
}

export function markPitchUsed(pitch) {
  if (!pitch) return null
  return Object.assign({}, pitch, { lastUsedAt: Date.now() })
}

function clampDimension(v, min, max) {
  const n = parseInt(v, 10)
  if (!isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

// 校验从 storage 读出的对象是否形似 Pitch
export function normalizePitch(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!raw.id || !raw.type) return null
  const preset = findPreset(raw.type)
  const defaults = preset ? { defaultLength: preset.defaultLength, defaultWidth: preset.defaultWidth, name: preset.name }
    : { defaultLength: raw.defaultLength || raw.actualLength || 40, defaultWidth: raw.defaultWidth || raw.actualWidth || 20, name: raw.name || '自定义球场' }
  return {
    id: raw.id,
    type: raw.type,
    name: raw.name || defaults.name,
    defaultLength: Number(raw.defaultLength) || defaults.defaultLength,
    defaultWidth: Number(raw.defaultWidth) || defaults.defaultWidth,
    actualLength: Number(raw.actualLength) || defaults.defaultLength,
    actualWidth: Number(raw.actualWidth) || defaults.defaultWidth,
    isCustom: !!raw.isCustom,
    isCalibrated: !!raw.isCalibrated,
    lastUsedAt: Number(raw.lastUsedAt) || Date.now()
  }
}
