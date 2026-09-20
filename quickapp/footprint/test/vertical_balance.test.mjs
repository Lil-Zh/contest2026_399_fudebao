import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// UI seam: the 432 × 514 simulator renders these page templates directly.
// Static workflow screens need a deliberate upper safe-area offset instead of
// placing their first content block immediately against the top edge.
const pages = ['Prematch', 'Recovery', 'Saved', 'History', 'Record']
const source = Object.fromEntries(await Promise.all(pages.map(async name => [
  name,
  await readFile(new URL(`../src/pages/${name}/index.ux`, import.meta.url), 'utf8')
])))

assert.match(source.Prematch, /\.status-space\s*\{\s*height:\s*40px;/, 'prematch reserves the 40px status area below the round top arc (trimmed so the CTA clears the bottom chord)')
assert.match(source.Recovery, /margin-top: 46px;/, 'recovery status starts below the upper safe area')
assert.match(source.Saved, /\.status-space\s*\{\s*height:\s*36px;/, 'saved reserves the 36px status area (with the 12px top inset the check circle top lands at y=48, clearing the 52px status bar)')
assert.match(source.History, /\.status-space\s*\{\s*height: 52px;/, 'history reserves the 52px status area')
assert.match(source.Record, /'padding: 12px 0 46px;'[\s\S]*?<div class="page-grabber"/, 'record pages keep the pull-down affordance and reserve 46px bottom padding so the primary action clears the circular bottom chord')
assert.match(source.Record, /\.page-grabber\s*\{[^}]*height:\s*14px;/, 'the handle restores the original effective 26px top rhythm without shifting content down')

console.log('vertical balance tests passed')
