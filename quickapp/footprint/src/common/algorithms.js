// 设备端实时算法层：GPS 测距、质量过滤、心率平滑。
// 数据源可以是模拟器轨迹或 Vela 系统 API，本层不感知数据来源。

const EARTH_RADIUS_M = 6371008.8

/** Haversine 大圆距离（米） */
export function haversineMeters(a, b) {
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** GPS 质量规则 */
export const GPS_RULES = {
  MAX_ACCURACY_M: 25,
  MAX_IMPLIED_SPEED_MPS: 12
}

/**
 * GPS 点质量过滤：精度超限，或相对上一点的隐含速度超过阈值（瞬移噪声），判为不可信。
 * @param {object|null} prev 上一个可信点
 * @param {object} point 待检点
 * @param {number} dtSeconds 两点间隔秒数
 */
export function gpsPointAccepted(prev, point, dtSeconds) {
  if (!(point.accuracyMeters >= 0) || point.accuracyMeters > GPS_RULES.MAX_ACCURACY_M) {
    return false
  }
  if (prev && dtSeconds > 0) {
    const impliedSpeed = haversineMeters(prev, point) / dtSeconds
    if (impliedSpeed > GPS_RULES.MAX_IMPLIED_SPEED_MPS) return false
  }
  return true
}

/**
 * 定长滑动窗口平均器（用于心率平滑显示）。
 * 返回一个函数：推入原始值，返回窗口内平均。
 */
export function movingAverage(windowSize) {
  const buffer = []
  return function (value) {
    buffer.push(value)
    if (buffer.length > windowSize) buffer.shift()
    let sum = 0
    for (const v of buffer) sum += v
    return sum / buffer.length
  }
}
