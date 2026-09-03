// Mixer de áudio da call: soma o áudio de todos os participantes num stream só,
// com um ganho por pessoa (dá pra baixar OU amplificar acima de 100%).
// O <audio> que toca o resultado fica no Shell (sempre montado enquanto a call existe).

let ctx = null
let master = null
let dest = null
const nodes = new Map() // socketId -> { source, gain, userId }

function volKey(userId) {
  return `elo_vol_${userId}`
}
export function getUserVolume(userId) {
  const v = Number(localStorage.getItem(volKey(userId)))
  return Number.isFinite(v) && v >= 0 ? v : 1
}
export function saveUserVolume(userId, v) {
  localStorage.setItem(volKey(userId), String(v))
}

export function ensureMixer() {
  if (ctx) return dest.stream
  const C = window.AudioContext || window.webkitAudioContext
  ctx = new C()
  master = ctx.createGain()
  dest = ctx.createMediaStreamDestination()
  master.connect(dest)
  return dest.stream
}

export function mixerStream() {
  return dest?.stream || null
}

export function attach(socketId, stream, userId) {
  ensureMixer()
  detach(socketId)
  if (!stream || stream.getAudioTracks().length === 0) return
  try {
    const source = ctx.createMediaStreamSource(stream)
    const gain = ctx.createGain()
    gain.gain.value = getUserVolume(userId)
    source.connect(gain).connect(master)
    nodes.set(socketId, { source, gain, userId })
  } catch {}
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
}

export function detach(socketId) {
  const n = nodes.get(socketId)
  if (!n) return
  try {
    n.source.disconnect()
    n.gain.disconnect()
  } catch {}
  nodes.delete(socketId)
}

// aplica volume em quem estiver com esse userId (por socketId)
export function setVolume(userId, v) {
  saveUserVolume(userId, v)
  for (const n of nodes.values()) {
    if (n.userId === userId) n.gain.gain.value = v
  }
}

export function updateUserId(socketId, userId) {
  const n = nodes.get(socketId)
  if (n && !n.userId) {
    n.userId = userId
    n.gain.gain.value = getUserVolume(userId)
  }
}

export function teardownMixer() {
  for (const id of [...nodes.keys()]) detach(id)
  ctx?.close().catch(() => {})
  ctx = null
  master = null
  dest = null
}
