const phases = ['idle', 'recording', 'paused', 'halfTime', 'finished']

export function createMatch(plan) {
  if (!plan || !plan.sessionId || !plan.fieldName) throw new Error('A field plan is required')
  return { plan, phase: 'idle', direction: plan.attackDirection || 'unknown', sequence: 0, elapsedSeconds: 0, distanceMeters: 0, packets: [], pending: [], syncedThrough: -1 }
}

export function applyEvent(match, type, now, options) {
  const allowed = {
    idle: ['start'], recording: ['pause', 'halfTime', 'sideSwitch', 'end'],
    paused: ['resume', 'halfTime', 'sideSwitch', 'end'], halfTime: ['secondHalfStart', 'halfTimeResume', 'end'], finished: []
  }
  if (!allowed[match.phase].includes(type)) throw new Error('Invalid event ' + type + ' while ' + match.phase)
  if (type === 'end' && !(options && options.confirmed === true)) throw new Error('End requires confirmation')
  const phase = type === 'end' ? 'finished' : type === 'start' || type === 'resume' || type === 'secondHalfStart' || type === 'halfTimeResume' ? 'recording' : type === 'pause' ? 'paused' : type === 'halfTime' ? 'halfTime' : match.phase
  if (type === 'secondHalfStart' || type === 'sideSwitch') match.direction = match.direction === 'goalA' ? 'goalB' : match.direction === 'goalB' ? 'goalA' : 'unknown'
  match.phase = phase
  append(match, { kind: 'matchEvent', eventType: type, attackDirection: match.direction, timestamp: now || new Date().toISOString() })
  return match
}

export function appendLocation(match, point) {
  if (match.phase !== 'recording') return match
  if (!isFinite(point.latitude) || !isFinite(point.longitude) || !isFinite(point.accuracyMeters)) throw new Error('Invalid location')
  append(match, Object.assign({ kind: 'location', timestamp: new Date().toISOString() }, point))
  if (point.distanceDeltaMeters > 0) match.distanceMeters += point.distanceDeltaMeters
  return match
}

export function appendHeartRate(match, bpm, now) {
  if (match.phase !== 'recording' || !Number.isInteger(bpm) || bpm < 20 || bpm > 260) return match
  append(match, { kind: 'heartRate', bpm, timestamp: now || new Date().toISOString() })
  return match
}

export function setDirection(match, direction, now) {
  if (direction !== 'goalA' && direction !== 'goalB') throw new Error('Invalid direction')
  if (match.phase === 'finished') throw new Error('Direction is unavailable while ' + match.phase)
  match.direction = direction
  append(match, { kind: 'matchEvent', eventType: 'directionSet', attackDirection: direction, timestamp: now || new Date().toISOString() })
  return match
}

export function acknowledge(match, sequence) {
  if (!Number.isInteger(sequence) || sequence < match.syncedThrough) throw new Error('Invalid acknowledgement')
  match.syncedThrough = sequence
  match.pending = match.pending.filter(packet => packet.sequence > sequence)
  return match
}

export function recover(serialized) {
  const match = JSON.parse(serialized)
  if (!phases.includes(match.phase) || !Array.isArray(match.pending)) throw new Error('Invalid saved match')
  return match
}

function append(match, packet) {
  packet.sequence = match.sequence++
  packet.sessionId = match.plan.sessionId
  match.packets.push(packet)
  match.pending.push(packet)
}
