import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/Recovery/index.ux', import.meta.url), 'utf8')

assert.match(source, /launch:\s*false/, 'startup page distinguishes its normal launch state from match recovery')
assert.match(source, /<block if="\{\{launch\}\}">[\s\S]*?class="pitch-selector"[\s\S]*?请开始比赛</, 'a normal launch stays on the pitch-selection welcome page')
assert.match(source, /if \(!match \|\| match\.phase === 'finished'\) \{[\s\S]*?self\.launch = true[\s\S]*?self\.ready = true/, 'only a missing or finished match selects the normal launch page')
assert.match(source, /onOpenPitchSelector\(\)\s*\{[\s\S]*?router\.push\(\{ uri: 'pages\/PitchSelector' \}\)/, 'tap opens the standalone pitch selector')
assert.match(source, /onStart\(\)\s*\{[\s\S]*?router\.replace\(\{ uri: 'pages\/Prematch' \}\)/, 'start navigates to prematch after a pitch is selected')
assert.match(source, /if \(match && match\.phase !== 'finished'\)[\s\S]*?self\.ready = true/, 'an unfinished match remains on recovery instead of being hidden by the launch page')

console.log('startup landing tests passed')
