import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// The Saved page can be reached through a chain of router.replace calls
// (Recovery -> EndConfirm -> Saved), so it may be the root route.  Once the
// match is archived there is no view model left; that state must replace the
// route with Prematch, never call router.back() and terminate the app.
const source = await readFile(new URL('../src/pages/Saved/index.ux', import.meta.url), 'utf8')
const recoverySource = await readFile(new URL('../src/pages/Recovery/index.ux', import.meta.url), 'utf8')
const endConfirmSource = await readFile(new URL('../src/pages/EndConfirm/index.ux', import.meta.url), 'utf8')

assert.doesNotMatch(source, /router\.back\(\)/, 'Saved must not back out of a root route')
assert.match(source, /onDone\(\)\s*\{[\s\S]*?this\._leaving\s*=\s*true/, 'Done must lock the page before archiving')
assert.match(source, /router\.replace\(\{ uri: 'pages\/Recovery' \}\)/, 'Done must return to the Recovery launch hub (current main flow entry; Prematch is entered via Recovery start)')
assert.match(source, /ready:\s*false/, 'Saved starts with its data gate closed')
assert.match(source, /hydrateApp\(\)\.then\(\(\)\s*=>\s*\{[\s\S]*?this\.ready\s*=\s*true/, 'Saved opens the data gate only after persisted match data is loaded')
assert.match(source, /setInterval\(\(\)\s*=>\s*\{[\s\S]*?if\s*\(!this\.ready\)\s*return/, 'Saved timer cannot navigate before hydration completes')
assert.match(source, /<block if="\{\{ready\}\}">/, 'Saved does not flash empty summary values during hydration')
assert.match(recoverySource, /onEndSave\(\)\s*\{[\s\S]*?router\.push\(\{ uri: 'pages\/EndConfirm' \}\)/, 'Recovery opens a cancelable confirmation page without replacing itself')
assert.match(endConfirmSource, /this\._openedAt\s*=\s*Date\.now\(\)/, 'EndConfirm records when it was opened')
assert.match(endConfirmSource, /Date\.now\(\)\s*-\s*\(this\._openedAt\s*\|\|\s*0\)\s*<\s*600/, 'EndConfirm ignores the opening click before treating an empty-area click as cancel')

console.log('saved navigation tests passed')
