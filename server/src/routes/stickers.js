import { Router } from 'express'
import { db, nanoid } from '../db.js'
import { authMiddleware } from '../auth.js'

const r = Router()
r.use(authMiddleware)

const STICKER_RE = /^data:image\/(png|webp|gif|jpe?g);base64,[a-z0-9+/=]{16,}$/i
const MAX_CHARS = 420_000
const MAX_TOTAL = 120

function withNames(s) {
  const u = db.data.users.find((x) => x.id === s.addedBy)
  return { id: s.id, url: s.url, name: s.name, addedBy: s.addedBy, addedByName: u?.displayName || null }
}

r.get('/', (req, res) => {
  res.json({ stickers: db.data.stickers.map(withNames) })
})

r.post('/', async (req, res) => {
  const url = String(req.body?.url || '')
  const name = String(req.body?.name || '').trim().slice(0, 24) || 'figurinha'
  if (url.length > MAX_CHARS || !STICKER_RE.test(url)) {
    return res.status(400).json({ error: 'imagem invalida ou muito grande' })
  }
  if (db.data.stickers.length >= MAX_TOTAL) {
    return res.status(400).json({ error: `limite de ${MAX_TOTAL} figurinhas — apague alguma` })
  }
  const s = { id: nanoid(), url, name, addedBy: req.user.id, createdAt: Date.now() }
  db.data.stickers.push(s)
  await db.write()
  res.json({ stickers: db.data.stickers.map(withNames) })
})

r.delete('/:id', async (req, res) => {
  const s = db.data.stickers.find((x) => x.id === req.params.id)
  if (!s) return res.status(404).json({ error: 'nao encontrada' })
  const me = db.data.users.find((u) => u.id === req.user.id)
  if (s.addedBy !== req.user.id && !me?.isAdmin) {
    return res.status(403).json({ error: 'so quem adicionou (ou o admin) pode apagar' })
  }
  db.data.stickers = db.data.stickers.filter((x) => x.id !== req.params.id)
  await db.write()
  res.json({ stickers: db.data.stickers.map(withNames) })
})

export default r
