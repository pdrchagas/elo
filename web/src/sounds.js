// Sons curtos da call, gerados na hora (sem arquivo, sem download).
let ctx = null
function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext
    ctx = C ? new C() : null
  }
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function blip(notes, { type = 'sine', gain = 0.14 } = {}) {
  const c = ac()
  if (!c) return
  const t0 = c.currentTime
  notes.forEach(([freq, start, dur], i) => {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0 + start)
    g.gain.setValueAtTime(0, t0 + start)
    g.gain.linearRampToValueAtTime(gain, t0 + start + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur)
    osc.connect(g).connect(c.destination)
    osc.start(t0 + start)
    osc.stop(t0 + start + dur + 0.02)
  })
}

// alguém entrou: duas notas subindo
export const playJoin = () => blip([[523.25, 0, 0.13], [659.25, 0.09, 0.16]])
// alguém saiu: duas notas descendo
export const playLeave = () => blip([[493.88, 0, 0.13], [369.99, 0.09, 0.18]])
// você entrou na call
export const playSelfJoin = () => blip([[440, 0, 0.1], [587.33, 0.08, 0.12], [880, 0.16, 0.18]], { gain: 0.12 })
