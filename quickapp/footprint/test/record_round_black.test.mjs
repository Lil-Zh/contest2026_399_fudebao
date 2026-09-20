import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/Record/index.ux', import.meta.url), 'utf8')

assert.doesNotMatch(
  source,
  /<div if="\{\{round\}\}" class="ring-wrap">\s*<\/div>/,
  'round Record must not render an empty fullscreen overlay after the SVG ring is removed'
)

assert.match(
  source,
  /\.pages\s*\{(?=[^}]*width:\s*100%;)(?=[^}]*height:\s*100%;)[^}]*\}/,
  'Record swiper must have explicit width and height because the Vela round runtime does not infer them from flex'
)

assert.doesNotMatch(
  source,
  /<block if="\{\{round\}\}">/,
  'round detection must not replace the Record stats subtree after first render'
)
assert.match(
  source,
  /show="\{\{showStats\}\}" class="stats"/,
  'round Record keeps one stable stats subtree and only toggles metric visibility'
)
assert.doesNotMatch(
  source,
  /\.round\s+\./,
  'Record round styles must use direct classes supported by the Vela compiler'
)
assert.match(
  source,
  /class="fit fit-round"/,
  'the 466px Record layout uses its static round safe column on the first frame'
)
assert.doesNotMatch(
  source,
  /\{\{round\b/,
  'the round-only Record page must not enter the simulator-breaking dynamic round branch'
)

console.log('record round black-screen regression tests passed')
