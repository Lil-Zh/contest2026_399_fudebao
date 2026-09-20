// 设备端算法层单元测试
import assert from 'node:assert'
import { haversineMeters, gpsPointAccepted, movingAverage, GPS_RULES } from '../src/common/algorithms.js'

// --- Haversine ---

// 赤道上经度差 1 度约 111.19 km
const equatorA = { latitude: 0, longitude: 0 }
const equatorB = { latitude: 0, longitude: 1 }
const equatorDist = haversineMeters(equatorA, equatorB)
assert.ok(Math.abs(equatorDist - 111195) < 300, 'equator 1deg lon ≈ 111.2km, got ' + equatorDist)

// 同一点距离为 0
assert.equal(haversineMeters(equatorA, equatorA), 0)

// 上海附近 0.00033 度纬度差 ≈ 36.7 m
const shA = { latitude: 31.2304, longitude: 121.4737 }
const shB = { latitude: 31.2304 + 0.00033, longitude: 121.4737 }
const shDist = haversineMeters(shA, shB)
assert.ok(shDist > 35 && shDist < 38, 'shanghai 0.00033deg lat ≈ 36.7m, got ' + shDist)

// 对称性
assert.ok(Math.abs(haversineMeters(shA, shB) - haversineMeters(shB, shA)) < 1e-9)

// --- GPS 质量过滤 ---

const good = { latitude: 31.2304, longitude: 121.4737, accuracyMeters: 3.0 }
assert.equal(gpsPointAccepted(null, good, 1), true, 'first point with good accuracy accepted')

const poorAccuracy = { latitude: 31.2305, longitude: 121.4737, accuracyMeters: 38 }
assert.equal(gpsPointAccepted(good, poorAccuracy, 1), false, 'accuracy beyond threshold rejected')

const teleport = { latitude: 31.2404, longitude: 121.4737, accuracyMeters: 3.0 }
assert.equal(gpsPointAccepted(good, teleport, 1), false, 'teleport (implied speed > 12 m/s) rejected')

const normalMove = { latitude: 31.2304 + 0.00002, longitude: 121.4737, accuracyMeters: 3.0 }
assert.equal(gpsPointAccepted(good, normalMove, 1), true, 'normal movement accepted')

assert.equal(GPS_RULES.MAX_ACCURACY_M, 25)
assert.equal(GPS_RULES.MAX_IMPLIED_SPEED_MPS, 12)

// --- 滑动平均 ---

const avg5 = movingAverage(5)
assert.equal(avg5(100), 100, 'single value averages to itself')
assert.ok(Math.abs(avg5(0) - 50) < 1e-9, 'two values average')
for (let i = 0; i < 10; i++) avg5(200)
assert.equal(avg5(200), 200, 'window slides: only last 5 values matter')

const avg2 = movingAverage(2)
avg2(10)
avg2(20)
assert.ok(Math.abs(avg2(30) - 25) < 1e-9, 'oldest value dropped beyond window')

console.log('algorithms tests passed')
