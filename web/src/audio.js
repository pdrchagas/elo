// Detector simples de "quem esta falando" a partir do volume do stream.
export function createSpeakingDetector(stream, onChange, { threshold = 12, hangMs = 250 } = {}) {
  if (!stream || stream.getAudioTracks().length === 0) return () => {}
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)
  const data = new Uint8Array(analyser.frequencyBinCount)

  let speaking = false
  let lastLoud = 0
  let raf = 0

  function tick() {
    analyser.getByteFrequencyData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i]
    const avg = sum / data.length
    const now = performance.now()
    if (avg > threshold) lastLoud = now
    const next = now - lastLoud < hangMs
    if (next !== speaking) {
      speaking = next
      onChange(speaking)
    }
    raf = requestAnimationFrame(tick)
  }
  tick()

  return () => {
    cancelAnimationFrame(raf)
    source.disconnect()
    ctx.close().catch(() => {})
  }
}
