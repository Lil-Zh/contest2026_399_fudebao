const KEYS = {
  current: 'cached_pitch',
  custom: 'custom_pitches',
  presetOverrides: 'preset_overrides'
}

export { KEYS }

export async function loadCurrentPitch(storage) {
  if (!storage) return null
  const raw = await storage.get(KEYS.current)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

export async function saveCurrentPitch(storage, pitch) {
  if (!storage) return false
  return await storage.set(KEYS.current, JSON.stringify(pitch))
}

export async function loadCustomPitches(storage) {
  if (!storage) return []
  const raw = await storage.get(KEYS.custom)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

export async function saveCustomPitches(storage, pitches) {
  if (!storage) return false
  return await storage.set(KEYS.custom, JSON.stringify(pitches))
}

export async function loadPresetOverrides(storage) {
  if (!storage) return {}
  const raw = await storage.get(KEYS.presetOverrides)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    return {}
  }
}

export async function savePresetOverrides(storage, overrides) {
  if (!storage) return false
  return await storage.set(KEYS.presetOverrides, JSON.stringify(overrides))
}
