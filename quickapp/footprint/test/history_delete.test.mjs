import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as appState from '../src/common/app_state.js'

const memoryStorage = {
  get: async () => null,
  set: async () => true
}

await appState.resetAppForTests()
appState.attachStorage(memoryStorage)
await appState.hydrateApp()

const app = appState.useApp()
app.history = [
  { sessionId: 'keep-synced', fieldName: '光明体育场', endedAt: Date.now(), durationSeconds: 1800, distanceKm: 2.4, syncState: 'synced' },
  { sessionId: 'delete-pending', fieldName: '星河球场', endedAt: Date.now(), durationSeconds: 1200, distanceKm: 1.8, syncState: 'pending' }
]
app.queue = [
  { plan: { sessionId: 'delete-pending' }, pending: [{ type: 'sample' }] }
]

assert.equal(typeof appState.removeHistoryRecord, 'function', 'history exposes a local-record delete operation')
assert.equal(appState.removeHistoryRecord('delete-pending'), true, 'deleting an existing record reports success')
assert.deepEqual(app.history.map(record => record.sessionId), ['keep-synced'], 'delete removes only the selected history row')
assert.deepEqual(app.queue.map(match => match.plan.sessionId), [], 'delete also removes an unsynced payload so it cannot upload later')
assert.equal(appState.historyView().rows.length, 1, 'delete refreshes the list view source')
assert.equal(appState.removeHistoryRecord('not-found'), false, 'delete leaves unrelated data alone when the row is absent')

const historySource = await readFile(new URL('../src/pages/History/index.ux', import.meta.url), 'utf8')
const prematchSource = await readFile(new URL('../src/pages/Prematch/index.ux', import.meta.url), 'utf8')
assert.match(historySource, /onswipe="onRowSwipe\(\$item\.key\)"/, 'each history card exposes its own delete action')
assert.match(historySource, /class="delete-action" onclick="onDeleteRecord\(\$item\.key\)"/, 'delete remains a distinct second tap after the swipe')
assert.match(historySource, /<block if="\{\{deleteKey === \$item\.key\}\}">\s*<div class="delete-action"/, 'the delete control is absent from every resting row and renders only after that row is swiped')
assert.match(historySource, /class="match-card \{\{deleteKey === \$item\.key \? 'match-card-open' : ''\}\}"/, 'only the selected card moves left to reveal its action')
assert.match(historySource, /\.match-card\s*\{[^}]*width:\s*348px;[^}]*padding:\s*0 18px 0 24px;/, 'the resting card has a fixed full-row width before the off-screen delete action (pill layout keeps the fixed width with horizontal-only padding)')
assert.doesNotMatch(historySource, /\.match-card\s*\{[^}]*\bflex:\s*1;/, 'the resting card does not shrink to expose every delete action')
assert.match(historySource, /\.delete-action\s*\{[^}]*position:\s*absolute;[^}]*right:\s*0px;/, 'the revealed action is removed from the flex layout and pinned to the right edge')
assert.match(historySource, /deleteKey:\s*''/, 'only one row can expose the delete action at a time')
assert.match(historySource, /onRowSwipe\(sessionId, evt\)\s*\{[\s\S]*?evt\.direction === 'left'[\s\S]*?this\.deleteKey = sessionId/, 'left swipe reveals the selected row action')
assert.match(historySource, /onRowSwipe\(sessionId, evt\)\s*\{[\s\S]*?evt\.direction === 'right'[\s\S]*?this\.onBackGesture\(evt\)/, 'a right swipe on a closed history row returns to prematch instead of getting trapped in the list')
assert.match(historySource, /<list else class="list" scrollpage="true" onswipe="onBackGesture">/, 'the list itself receives the back gesture when the user swipes outside a card')
assert.match(historySource, /onDeleteRecord\(sessionId, evt\)\s*\{[\s\S]*?removeHistoryRecord\(sessionId\)[\s\S]*?this\.refresh\(\)/, 'the UI deletes through the state operation then refreshes its list')
assert.doesNotMatch(prematchSource, /records-page|recordRows|recordDeleteKey|onRecordRowSwipe|onRecordsPageSwipe/, 'prematch contains no embedded history page or its competing gesture state')

console.log('history delete tests passed')
