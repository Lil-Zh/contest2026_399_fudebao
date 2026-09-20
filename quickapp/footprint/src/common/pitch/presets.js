// 内置球场模板。所有尺寸单位为米，仅作为默认模板值，用户可后续修改/校准。

export const PITCH_TYPE_5V5 = '5v5'
export const PITCH_TYPE_7V7 = '7v7'
export const PITCH_TYPE_8V8 = '8v8'
export const PITCH_TYPE_11_HALF = '11-half'
export const PITCH_TYPE_11_FULL = '11-full'
export const PITCH_TYPE_CUSTOM = 'custom'

export const PITCH_PRESETS = [
  { type: PITCH_TYPE_5V5, name: '5人制球场', defaultLength: 40, defaultWidth: 20 },
  { type: PITCH_TYPE_7V7, name: '7人制球场', defaultLength: 60, defaultWidth: 40 },
  { type: PITCH_TYPE_8V8, name: '8人制球场', defaultLength: 68, defaultWidth: 50 },
  { type: PITCH_TYPE_11_HALF, name: '11人制半场', defaultLength: 53, defaultWidth: 68 },
  { type: PITCH_TYPE_11_FULL, name: '11人制标准场', defaultLength: 105, defaultWidth: 68 }
]

export function findPreset(type) {
  return PITCH_PRESETS.find(p => p.type === type) || null
}
