import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/Prematch/index.ux', import.meta.url), 'utf8')

assert.doesNotMatch(source, /for="\{\{rows\}\}"/, 'round Prematch must not rebuild a dynamic list on sensor updates')
for (const key of ['phone', 'gnss', 'hr', 'battery', 'storage']) {
  assert.match(source, new RegExp(`class="pm-stat pm-stat-${key}"`), `Prematch keeps a stable ${key} row`)
}
assert.match(source, /this\.phoneValue = phone\.value/, 'Prematch updates fixed row values instead of replacing the row tree')
assert.match(source, /while \(this\._app\.world\.tick < 10\) tickWorld\(this\._app\.world, null\)/, 'Prematch warms the simulator to one stable ready snapshot before rendering')
assert.doesNotMatch(
  source,
  /setInterval\(\(\) => \{[\s\S]*?this\.refresh\(\)[\s\S]*?\}, 1000\)/,
  'Prematch does not mutate its complex round tree every second'
)

console.log('prematch round stability tests passed')
