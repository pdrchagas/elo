// Supressão de ruído com RNNoise (IA), rodando num AudioWorklet.
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor'
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import wasmSimdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'

let wasmBinary = null

// Recebe o stream cru do microfone, devolve { track, dispose } com o áudio limpo.
export async function createDenoiser(rawStream) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx({ sampleRate: 48000 }) // rnnoise espera 48kHz
  try {
    if (!wasmBinary) wasmBinary = await loadRnnoise({ url: wasmUrl, simdUrl: wasmSimdUrl })
    await ctx.audioWorklet.addModule(workletUrl)
    const src = ctx.createMediaStreamSource(rawStream)
    const node = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary })
    const dest = ctx.createMediaStreamDestination()
    src.connect(node).connect(dest)
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    return {
      track: dest.stream.getAudioTracks()[0],
      dispose() {
        try {
          src.disconnect()
          node.disconnect()
          dest.disconnect()
          node.destroy?.()
        } catch {}
        ctx.close().catch(() => {})
      },
    }
  } catch (e) {
    ctx.close().catch(() => {})
    throw e
  }
}
