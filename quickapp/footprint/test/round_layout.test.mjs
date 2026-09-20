import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pages = ['Recovery', 'Prematch', 'Record', 'Halftime', 'EndConfirm', 'Saved', 'History']
const source = Object.fromEntries(await Promise.all(pages.map(async name => [
  name,
  await readFile(new URL(`../src/pages/${name}/index.ux`, import.meta.url), 'utf8')
])))

for (const name of pages) {
  if (name === 'Record') {
    assert.match(source[name], /class="screen screen-round/, 'Record is the round-build screen from its first frame')
    assert.match(source[name], /class="fit fit-round"/, 'Record uses the static 336px circular safe column')
    assert.doesNotMatch(source[name], /\.round\s+\./, 'Record avoids descendant selectors unsupported by the Vela compiler')
    continue
  }
  if (name === 'Prematch') {
    assert.match(source[name], /class="screen"/, 'Prematch renders a static round-native root')
    assert.doesNotMatch(source[name], /\.round\s+\./, 'Prematch avoids descendant selectors unsupported by the Vela compiler')
    assert.doesNotMatch(source[name], /<block if="\{\{round\}\}">/, 'Prematch does not rebuild the full page after round detection')
    assert.doesNotMatch(source[name], /fit-round|width:\s*(432|384|376|352)px/, 'Prematch drops every square-screen legacy fixed width')
    continue
  }
  if (name === 'Recovery') {
    assert.match(source[name], /class="screen"/, 'Recovery renders a static round-native root')
    assert.match(source[name], /class="fit" onswipe="onHistorySwipe" style="left: \{\{enterX\}\}px;"/, 'Recovery hosts the entry slide-in animation on its fit column')
    assert.doesNotMatch(source[name], /\.round\s+\./, 'Recovery avoids descendant selectors unsupported by the Vela compiler')
    continue
  }
  if (name === 'History') {
    assert.match(source[name], /class="screen"/, 'History renders a static round-native root')
    assert.doesNotMatch(source[name], /\.round\s+\./, 'History avoids descendant selectors unsupported by the Vela compiler')
    continue
  }
  assert.match(source[name], /isRoundScreen/, `${name} reads the physical screen shape`)
  assert.match(source[name], /round:\s*false/, `${name} has an explicit round-layout state`)
  assert.match(source[name], /screen[^\n]*round/, `${name} applies a round root class`)
  if (name !== 'Recovery') {
    const hasRoundOverride = /\.round \.fit\s*\{\s*width:\s*336px;/.test(source[name])
    const hasFitRound = /\.fit-round\s*\{\s*width:\s*336px;/.test(source[name])
    assert.ok(hasRoundOverride || hasFitRound, `${name} narrows content to the 336px round safe column`)
  }
  assert.doesNotMatch(source[name], /\.screen\.round\s+\./, `${name} avoids unsupported Vela descendant selectors`)
}

assert.match(source.Recovery, /class="fit" onswipe="onHistorySwipe"/, 'recovery attaches its fixed content column on the first frame because Vela drops dynamic root updates')
assert.match(source.Recovery, /class="launch-cta/, 'recovery attaches its launch primary button class directly')
assert.match(source.Recovery, /class="cta" onclick="onContinue"/, 'recovery attaches its round primary button class directly')
assert.match(source.Recovery, /class="second" onclick="onEndSave"/, 'recovery attaches its round secondary button class directly')
assert.match(source.Recovery, /\.fit\s*\{[\s\S]*?width:\s*376px;/, 'recovery uses the 376px circular safe column sized for the 488px contest viewport')
assert.doesNotMatch(source.Recovery, /class="dbg-|\.round \.fit|\.round \.cta|\.round \.second/, 'recovery removes debug probes and unsupported descendant round rules')

assert.match(source.Record, /sheet-round\s*\{\s*left:\s*0;\s*right:\s*0;/, 'record information sheet is a full-width full-height page whose corners are clipped by the circular bezel')
assert.match(source.Prematch, /class="pm-page"/, 'prematch uses the round-native pm-page composition')
assert.match(source.Prematch, /\.status-space\s*\{\s*height:\s*40px;/, 'prematch reserves 40px for the round system status bar (52px pushed the CTA bottom edge past the circular chord, trimmed with the vertical chain)')
assert.match(source.Prematch, /class="pm-header"[\s\S]*?prematch_check\.png[\s\S]*?赛前检查 · 准备就绪/, 'prematch header is the check-icon readiness capsule')
assert.match(source.Prematch, /\.pm-header-text\s*\{[\s\S]*?font-size:\s*15px;[\s\S]*?#9d9d95/i, 'prematch header text is 15px muted gray')
assert.match(source.Prematch, /\.pm-title\s*\{[\s\S]*?font-size:\s*34px;[\s\S]*?text-align:\s*center;/, 'prematch field name is 34px semi-bold centered')
assert.match(source.Prematch, /\.pm-sub\s*\{[\s\S]*?font-size:\s*15px;[\s\S]*?text-align:\s*center;/, 'prematch field dimensions are 15px gray centered')
assert.match(source.Prematch, /\.pm-stats\s*\{\s*width:\s*336px;/, 'prematch status list is a centered 336px column')
assert.match(source.Prematch, /\.pm-stat\s*\{[\s\S]*?height:\s*28px;/, 'prematch status rows are 28px tall (17px text, vertically loosened after the font bump)')
assert.match(source.Prematch, /\.pm-stat-icon\s*\{[\s\S]*?width:\s*18px;[\s\S]*?height:\s*18px;/, 'prematch status icons are 18px')
assert.match(source.Prematch, /\.pm-dot\s*\{[\s\S]*?width:\s*7px;[\s\S]*?height:\s*7px;/, 'prematch status dots are 7px')
assert.match(source.Prematch, /\.pm-stat-text\s*\{[\s\S]*?font-size:\s*17px;/, 'prematch status values are 17px off-white (label/value tones swapped for readability)')
assert.match(source.Prematch, /\.pm-dir-label\s*\{[\s\S]*?font-size:\s*16px;[\s\S]*?text-align:\s*center;/, 'prematch direction label is 16px gray centered')
assert.match(source.Prematch, /\.pm-dir-btn\s*\{[\s\S]*?width:\s*140px;[\s\S]*?height:\s*40px;[\s\S]*?border-radius:\s*999px;/, 'prematch direction buttons are 140x40 pills')
assert.match(source.Prematch, /\.pm-dir-left\s*\{\s*margin-right:\s*10px;/, 'prematch direction buttons keep a 10px gap')
assert.match(source.Prematch, /\.pm-cta\s*\{[\s\S]*?width:\s*296px;[\s\S]*?height:\s*56px;[\s\S]*?border-radius:\s*999px;/, 'prematch CTA is the widest 296x56 pill')
assert.match(source.Prematch, /\.pm-cta-text\s*\{[\s\S]*?font-size:\s*23px;/, 'prematch CTA label is 23px bold per the design board')
assert.match(source.Recovery, /\.launch-dots\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*16px;/, 'launch home dots are absolutely placed at bottom 16px out of flow')
assert.match(source.History, /class="match-wrap"/, 'history rows wrap each match card')
assert.match(source.History, /\.match-card-open\s*\{[^}]*margin-left:\s*-48px;/, 'an opened history card exposes the narrower delete action')
assert.doesNotMatch(source.History, /\.match-card-round\.match-card-open/, 'history avoids a compound selector unsupported by older Vela compilers')

assert.doesNotMatch(source.Record, /class="ring-wrap"|<svg class="ring"/, 'record avoids the removed fullscreen ring layer that blanked the round runtime')
assert.match(source.Record, /\.pages\s*\{(?=[^}]*width:\s*100%;)(?=[^}]*height:\s*100%;)[^}]*\}/, 'record gives the Vela swiper explicit dimensions')
assert.match(source.Record, /font-size:\s*96px;\s*line-height:\s*122px;/, 'round timer digits are 96px centered')
assert.match(source.Record, /距离 km[\s\S]*?心率 bpm[\s\S]*?配速 \/km/, 'round record page shows distance / heart rate / pace stats')

console.log('round layout tests passed')
