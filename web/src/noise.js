// Supressão de ruído com RNNoise (IA), rodando num AudioWorklet.
// Exporta só o nó — quem chama conecta no grafo de áudio.
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor'
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import wasmSimdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'

let wasmBinary = null
const modAdded = new WeakSet()

export async function createDenoiserNode(ctx) {
  if (!wasmBinary) wasmBinary = await loadRnnoise({ url: wasmUrl, simdUrl: wasmSimdUrl })
  if (!modAdded.has(ctx)) {
    await ctx.audioWorklet.addModule(workletUrl)
    modAdded.add(ctx)
  }
  return new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary })
}
