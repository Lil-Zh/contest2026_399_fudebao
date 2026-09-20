import assert from 'node:assert/strict'
import { panelMotionFrame } from '../src/common/app_state.js'

// The panel starts entirely above the display and finishes at its resting
// position. The output is intentionally pure so its timing can be verified
// without an emulator frame clock.
let frame = panelMotionFrame('open', 0, 400)
assert.deepEqual(frame, { translateY: -400, opacity: 0, done: false })

frame = panelMotionFrame('open', 180, 400)
assert.deepEqual(frame, { translateY: 0, opacity: 0.72, done: true })

frame = panelMotionFrame('close', 0, 400)
assert.deepEqual(frame, { translateY: 0, opacity: 0.72, done: false })

frame = panelMotionFrame('close', 160, 400)
assert.deepEqual(frame, { translateY: -400, opacity: 0, done: true })

console.log('panel motion tests passed')
