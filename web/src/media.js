// Figurinhas: emojis grandes. Simples, sem armazenamento, sem questao de licenca.
export const STICKERS = [
  '😂', '💀', '🔥', '👍', '👎', '❤️', '😭', '🥶', '🤡', '👀',
  '🎉', '😎', '🙏', '💯', '🤝', '🥳', '😱', '🫡', '🤔', '😴',
  '🤯', '🫠', '👑', '🐐', '💅', '🗿', '✅', '❌', '⚠️', '🍺',
  '🎮', '🏆', '💸', '📸', '🤣', '😤',
]

// Redimensiona uma imagem pra caber no chat (JPEG, no maximo ~500KB).
export async function fileToChatImage(file, { maxDim = 1024 } = {}) {
  if (!file || !file.type.startsWith('image/')) throw new Error('nao e imagem')
  if (file.size > 25 * 1024 * 1024) throw new Error('imagem muito grande')

  const bitmap = await createImageBitmap(file).catch(async () => {
    // fallback pra navegadores sem createImageBitmap
    const url = URL.createObjectURL(file)
    const img = await new Promise((ok, err) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = err
      i.src = url
    })
    URL.revokeObjectURL(url)
    return img
  })

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)

  const gif = file.type === 'image/gif'
  // gif animado nao da pra manter via canvas; se for pequeno, manda como esta
  if (gif && file.size <= 500 * 1024) {
    return await new Promise((ok) => {
      const rd = new FileReader()
      rd.onload = () => ok(String(rd.result))
      rd.readAsDataURL(file)
    })
  }

  for (const q of [0.72, 0.6, 0.45, 0.32]) {
    const uri = canvas.toDataURL('image/jpeg', q)
    if (uri.length < 620_000) return uri
  }
  throw new Error('nao consegui comprimir a imagem o suficiente')
}
