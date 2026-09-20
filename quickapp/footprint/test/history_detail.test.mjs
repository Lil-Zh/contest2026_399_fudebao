import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { attachStorage, detailScrollClamp, detailScrollFrame, detailScrollMax, historyDetailView, hydrateApp, resetAppForTests, useApp } from '../src/common/app_state.js'

const memoryStorage = {
  get: async () => null,
  set: async () => true
}

await resetAppForTests()
attachStorage(memoryStorage)
await hydrateApp()

useApp().history = [
  {
    sessionId: 'detail-1',
    fieldName: '光明体育场',
    endedAt: new Date().setHours(19, 20, 0, 0),
    durationSeconds: 3600,
    distanceKm: 10,
    syncState: 'synced',
    pitchType: '11-full',
    pitchTypeName: '11人制标准场',
    pitchWidth: 45,
    pitchLength: 90,
    calibrationStatus: 'calibrated',
    avgHr: 142,
    maxHr: 175
  },
  {
    sessionId: 'detail-2',
    fieldName: '星河球场',
    endedAt: new Date().setHours(8, 0, 0, 0),
    durationSeconds: 1200,
    distanceKm: 0,
    syncState: 'pending',
    pitchType: '8v8'
  }
]

const view = historyDetailView('detail-1')
assert.equal(view.duration, '60:00', 'detail formats duration')
assert.equal(view.distance, '10.0 km', 'detail formats distance')
assert.equal(view.pace, "6'00\"", 'detail derives pace from duration and distance')
assert.equal(view.avgHr, '142 bpm', 'detail shows the archived average heart rate')
assert.equal(view.maxHr, '175 bpm', 'detail shows the archived maximum heart rate')
assert.equal(view.pitchName, '11人制标准场', 'detail uses the stored pitch name')
assert.equal(view.pitchSize, '90 × 45 m', 'detail formats pitch length x width')
assert.equal(view.calibration, '已校准', 'detail labels a calibrated pitch')
assert.equal('syncState' in view, false, 'detail carries no sync state since sync was removed')

const zeroDistance = historyDetailView('detail-2')
assert.equal(zeroDistance.pace, "--'--\"", 'pace shows a placeholder without distance')
assert.equal(zeroDistance.pitchName, '8人制球场', 'detail falls back to the pitch-type label')
assert.equal(zeroDistance.pitchSize, '', 'detail omits pitch size when the record has none')
assert.equal(zeroDistance.calibration, '默认尺寸', 'uncalibrated records use the default-size label')
assert.equal(zeroDistance.avgHr, '--', 'records archived before heart-rate summary show a placeholder')

useApp().history.push({
  sessionId: 'detail-3',
  fieldName: '微距测试',
  endedAt: Date.now(),
  durationSeconds: 11,
  distanceKm: 0.02,
  syncState: 'synced',
  pitchType: '8v8'
})
const tinyDistance = historyDetailView('detail-3')
assert.equal(tinyDistance.pace, "--'--\"", 'pace shows a placeholder when the distance rounds to 0.0 km')
assert.equal(tinyDistance.distance, '0.0 km', 'sub-50m distance still displays as 0.0 km')

assert.equal(historyDetailView('missing'), null, 'unknown session yields no view and the page goes back')

// 竖向滑屏：内容定高 600px、可视区 414px，上滑一次走 200px（一步多 swipe 自然夹紧）
assert.equal(detailScrollMax(), 230, 'spacious detail content overflows the round viewport by 230px')
assert.equal(detailScrollClamp(-20), 0, 'scroll never goes above the top')
assert.equal(detailScrollClamp(999), 230, 'scroll stops at the bottom edge')
assert.equal(detailScrollClamp(80), 80, 'mid offsets pass through')
const scrollStart = detailScrollFrame(0, 230, 0, 160)
assert.equal(scrollStart.offset, 0, 'scroll frame starts at the from offset')
assert.equal(scrollStart.done, false, 'scroll frame is not done at t=0')
const scrollEnd = detailScrollFrame(0, 230, 160, 160)
assert.equal(scrollEnd.offset, 230, 'scroll frame lands on the target')
assert.equal(scrollEnd.y, -230, 'rendered top is the negative offset')
assert.equal(scrollEnd.done, true, 'scroll frame completes at the duration')

const historySource = await readFile(new URL('../src/pages/History/index.ux', import.meta.url), 'utf8')
const detailSource = await readFile(new URL('../src/pages/MatchDetail/index.ux', import.meta.url), 'utf8')
const manifestSource = await readFile(new URL('../src/manifest.json', import.meta.url), 'utf8')

// 同步功能已移除，列表页不再出现任何同步元素
assert.doesNotMatch(historySource, /sync-summary|summary-text|summary-dot/, 'history has no sync summary pill')
assert.doesNotMatch(historySource, /state-pill|state-dot|syncState|待同步|同步失败|同步中|已同步/, 'history cards carry no sync state pills')
assert.doesNotMatch(historySource, /pill/, 'history page state has no sync pill fields')
assert.doesNotMatch(historySource, /连接手机后自动同步/, 'the empty state no longer promises phone sync')
assert.doesNotMatch(historySource, /retryHistorySync|completeHistoryRetry/, 'history has no sync retry logic')

// 记录居中 + 删除按钮紧贴记录
assert.match(historySource, /\.match-card\s*\{[^}]*margin-left:\s*18px;/, 'resting cards are centered in the 384px column')
assert.match(historySource, /\.match-card-open\s*\{[^}]*margin-left:\s*-48px;/, 'the opened card slides exactly its reveal width')
assert.match(historySource, /\.delete-action\s*\{[^}]*width:\s*84px;/, 'the delete action keeps an 84px slot')
assert.match(historySource, /\.delete-action\s*\{[^}]*right:\s*0px;/, 'the delete action is pinned to the track right edge')
assert.match(historySource, /class="match-card \{\{deleteKey === \$item\.key \? 'match-card-open' : ''\}\}" onclick="onRowTap\(\$item\.key\)"/, 'tapping a card opens its match detail')
assert.match(historySource, /router\.push\(\{ uri: 'pages\/MatchDetail', params: \{ sessionId: sessionId \} \}\)/, 'detail navigation passes the session id as a route param')

// 详情页
assert.match(manifestSource, /"pages\/MatchDetail"/, 'detail page is registered in the router')
assert.match(detailSource, /运动时长/, 'detail page shows the duration hero')
assert.match(detailSource, /平均配速/, 'detail page shows pace')
assert.match(detailSource, /平均心率/, 'detail page shows average heart rate')
assert.match(detailSource, /最高心率/, 'detail page shows maximum heart rate')
assert.doesNotMatch(detailSource, /scrollpage|<list/, 'detail page does not rely on list scrolling, which this runtime cannot deliver')
assert.match(detailSource, /class="rows"/, 'detail rows render as one card')
assert.match(detailSource, /onswipe="onDetailSwipe"/, 'detail page swipes vertically to reach the bottom and right-swipes back')
assert.match(detailSource, /detailScrollFrame/, 'detail scroll animates through the shared frame function')
assert.match(detailSource, /场地校准/, 'detail page shows calibration state')
assert.match(detailSource, /this\.sessionId/, 'detail page reads the route param')
assert.match(detailSource, /historyDetailView\(sessionId\)/, 'detail page builds its view from the ledger record')
assert.match(detailSource, /if \(!view\) \{\s*router\.back\(\)/, 'a missing record returns to the list instead of rendering empty')

console.log('history detail tests passed')
