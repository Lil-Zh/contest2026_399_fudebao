import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/Recovery/index.ux', import.meta.url), 'utf8')
const selectorSource = await readFile(new URL('../src/pages/PitchSelector/index.ux', import.meta.url), 'utf8')

assert.match(source, /请选择球场/, 'normal startup is a welcome page for choosing a pitch')
assert.match(source, /pitch-selector[\s\S]*?onclick="onOpenPitchSelector"/, 'the pitch selector title is a tappable entry')
assert.match(source, /launch-cta[\s\S]*?请开始比赛</, 'the primary action invites the user to start a match')
assert.match(source, /launch-cta-disabled/, 'the start button has a disabled/weak state when no pitch is selected')
assert.match(source, /onStart\(\)\s*\{[\s\S]*?if \(!this\.canStart\)/, 'tapping start without a pitch is guarded')
assert.match(source, /canStart:\s*false/, 'start is disabled by default')
assert.match(source, /recoveryPitchView/, 'recovery reads the selected pitch from the shared view model')
assert.doesNotMatch(source, /quickPickerOpen/, 'the old inline dropdown is removed')
assert.doesNotMatch(source, /onToggleQuickPicker/, 'the old dropdown toggle is removed')
assert.doesNotMatch(source, /onPickQuick/, 'the old inline option picker is removed')

assert.match(selectorSource, /选择球场/, 'selector page has a title')
assert.match(selectorSource, /for="\{\{presets\}\}"/, 'selector renders built-in presets from the view model')
assert.match(selectorSource, /自定义球场/, 'selector page includes the custom pitch entry')
assert.match(selectorSource, /selectPitch/, 'selector calls the shared pitch selection API')
assert.match(selectorSource, /pages\/CustomPitch/, 'selector can navigate to the custom pitch editor')

const presetsSource = await readFile(new URL('../src/common/pitch/presets.js', import.meta.url), 'utf8')
assert.match(presetsSource, /5人制球场[\s\S]*?7人制球场[\s\S]*?8人制球场[\s\S]*?11人制半场[\s\S]*?11人制标准场/, 'all five built-in pitch presets are centrally defined')

console.log('quick start tests passed')
