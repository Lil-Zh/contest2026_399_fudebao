import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { attachStorage, consumeBackFromHistory, enterSlideFrame, historyView, hydrateApp, markBackFromHistory, resetAppForTests, useApp } from '../src/common/app_state.js'

const memoryStorage = {
  get: async () => null,
  set: async () => true
}

await resetAppForTests()
attachStorage(memoryStorage)
await hydrateApp()

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)
yesterday.setHours(19, 20, 0, 0)
useApp().history = [
  { sessionId: 'synced', fieldName: '光明体育场', endedAt: yesterday.getTime(), durationSeconds: 2834, distanceKm: 8.64, syncState: 'synced', pitchType: '11-full' },
  { sessionId: 'pending', fieldName: '星河球场', endedAt: yesterday.getTime(), durationSeconds: 1200, distanceKm: 3.1, syncState: 'pending', pitchType: '8v8' }
]

const view = historyView()
assert.deepEqual(view.rows[0], {
  key: 'synced',
  title: '光明体育场',
  duration: '47:14',
  distance: '8.6 km',
  meta: '昨天 19:20 · 11人制标准场'
}, 'history provides the three card lines as independent display values')
assert.equal('pill' in view, false, 'sync was removed, so the list view carries no sync summary')

const source = await readFile(new URL('../src/pages/History/index.ux', import.meta.url), 'utf8')
const prematchSource = await readFile(new URL('../src/pages/Prematch/index.ux', import.meta.url), 'utf8')
const recoverySource = await readFile(new URL('../src/pages/Recovery/index.ux', import.meta.url), 'utf8')
assert.match(source, /class="status-space"/, 'reserves the 52px status area')
assert.match(source, /class="match-card/, 'uses dedicated match cards')
assert.match(source, /height: 92px;/, 'match cards have the required fixed height')
assert.match(source, /\.top\s*\{[\s\S]*?margin-bottom: 14px;/, 'keeps enough list height for a 60px third-card peek')
assert.match(source, /\.dots\s*\{\s*height: 10px;/, 'uses a compact bottom indicator band')
assert.match(source, /\.dots\s*\{[\s\S]*?margin-top: -10px;/, 'keeps the indicator over the list edge without reducing its peek')
assert.match(source, /font-variant-numeric: tabular-nums;/, 'numeric metrics retain tabular alignment')
assert.match(source, /class="empty-cta" onclick="onStartFirst"/, 'empty state keeps the first-record CTA')
assert.match(source, /onStartFirst\(\)\s*\{[\s\S]*?router\.replace\(\{ uri: 'pages\/Recovery' \}\)/, 'empty state leads back to the launch home')
assert.match(source, /<div class="dots">/, 'keeps page indicators')
assert.match(source, /<div class="dots">\s*<div class="dot-off"><\/div>\s*<div class="dot-on"><\/div>/, 'history renders both page indicators with History selected')
assert.match(source, /<block if="\{\{ready\}\}">/, 'history waits for persisted data before choosing an empty or list state')
assert.match(source, /ready: false/, 'history starts hidden while storage is hydrating')
assert.match(source, /hydrateApp\(\)\.then\(\(\) => \{\s*this\.refresh\(\)\s*this\.ready = true/, 'history reveals only after the first refresh')
assert.doesNotMatch(prematchSource, /<swiper class="pages"/, 'prematch has no embedded history pager')
assert.doesNotMatch(prematchSource, /records-page|records-card|historyReady|recordRows|recordDeleteKey/, 'prematch contains no duplicated history implementation')
assert.doesNotMatch(prematchSource, /onHistorySwipe|pm-dots/, 'prematch no longer hosts the history gesture or page indicators')
assert.match(recoverySource, /class="fit" onswipe="onHistorySwipe"/, 'a left swipe from the launch home opens the standalone history page')
assert.match(recoverySource, /<div class="launch-dots">\s*<div class="dot-on"><\/div>\s*<div class="dot-off"><\/div>/, 'launch home renders both page indicators with home selected')
assert.match(recoverySource, /onHistorySwipe\(evt\)\s*\{[\s\S]*?evt\.direction !== 'left'[\s\S]*?router\.push\(\{ uri: 'pages\/History' \}\)/, 'only a left swipe navigates to History through a real route instead of embedding it')
assert.match(recoverySource, /onShow\(\)\s*\{\s*this\._app = useApp\(\)\s*this\._historyRouting = false/, 'returning to the launch home clears the navigation guard so the standalone history page remains reachable')
assert.match(recoverySource, /if \(!this\.launch\) return/, 'the unfinished-match recovery state does not respond to the history swipe')
assert.doesNotMatch(prematchSource, /history-entry|onOpenHistory/, 'prematch does not leave a competing small history entry on screen')
assert.doesNotMatch(prematchSource, /h-item|hRows|hPill|Page 1: 比赛记录/, 'prematch contains no legacy embedded history implementation')

// 进入滑入动画：History 右滑返回前置标记，Recovery 消费一次即清零；
// 进入页单边动画（前进从右滑入、返回从左滑入），盖在旧页上
markBackFromHistory()
assert.equal(consumeBackFromHistory(), true, 'recovery consumes the back flag once')
assert.equal(consumeBackFromHistory(), false, 'the back flag clears after consumption')
const slideStart = enterSlideFrame(384, 0, 200)
assert.equal(slideStart.x, 384, 'slide starts off-screen')
assert.equal(slideStart.done, false, 'slide is not done at t=0')
const slideEnd = enterSlideFrame(-384, 200, 200)
assert.equal(slideEnd.x, 0, 'slide lands on 0')
assert.equal(slideEnd.done, true, 'slide completes at the duration')

assert.match(source, /markBackFromHistory\(\)[\s\S]*?router\.back\(\)/, 'history flags the back navigation before leaving')
assert.match(recoverySource, /consumeBackFromHistory\(\)/, 'recovery reads the back flag to slide in from the left')
assert.match(recoverySource, /enterSlideFrame/, 'recovery slide animates through the shared frame function')

console.log('history page tests passed')
