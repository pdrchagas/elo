// Detector simples de "quem esta falando" a partir do volume do stream.
// Usa setInterval (nao requestAnimationFrame) e FFT pequena pra gastar pouca CPU
// e continuar funcionando com a aba em segundo plano.
export function createSpeakingDetector(stream, onChange, { threshold = 14, hangMs = 300, intervalMs = 150 } = {}) {
  if (!stream || stream.getAudioTracks().length === 0) return () => {}

  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.6
  source.connect(analyser)
  const data = new Uint8Array(analyser.frequencyBinCount)

  let speaking = false
  let lastLoud = 0

  const timer = setInterval(() => {
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
  }, intervalMs)

  return () => {
    clearInterval(timer)
    try { source.disconnect() } catch {}
    ctx.close().catch(() => {})
  }
}
