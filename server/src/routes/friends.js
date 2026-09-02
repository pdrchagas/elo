import { Router } from 'express'
import { db, nanoid } from '../db.js'
import { authMiddleware } from '../auth.js'
import { publicUser } from './auth.js'

const r = Router()
r.use(authMiddleware)

r.get('/', (req, res) => {
  const me = req.user.id
  const list = db.data.friends
    .filter((f) => f.a === me || f.b === me)
    .map((f) => {
      const otherId = f.a === me ? f.b : f.a
      const u = db.data.users.find((x) => x.id === otherId)
      if (!u) return null
      return {
        rel: f.id,
        status: f.status,
        incoming: f.status === 'pending' && f.requestedBy !== me,
        user: publicUser(u),
      }
    })
    .filter(Boolean)
  res.json({ friends: list })
})

r.post('/request', async (req, res) => {
  const uname = String(req.body?.username || '').trim().toLowerCase()
  const target = db.data.users.find((u) => u.username === uname)
  if (!target) return res.status(404).json({ error: 'nao achei ninguem com esse nome' })
  if (target.id === req.user.id) return res.status(400).json({ error: 'voce nao pode se adicionar' })

  const exists = db.data.friends.find(
    (f) =>
      (f.a === req.user.id && f.b === target.id) ||
      (f.a === target.id && f.b === req.user.id),
  )
  if (exists) return res.status(409).json({ error: 'ja existe um pedido ou amizade com essa pessoa' })

  db.data.friends.push({
    id: nanoid(),
    a: req.user.id,
    b: target.id,
    status: 'pending',
    requestedBy: req.user.id,
  })
  await db.write()
  res.json({ ok: true })
})

r.post('/:rel/accept', async (req, res) => {
  const f = db.data.friends.find((x) => x.id === req.params.rel)
  if (!f || (f.a !== req.user.id && f.b !== req.user.id)) return res.status(404).json({ error: 'pedido nao encontrado' })
  if (f.requestedBy === req.user.id) return res.status(400).json({ error: 'esse pedido foi voce que enviou' })
  f.status = 'accepted'
  await db.write()
  res.json({ ok: true })
})

r.delete('/:rel', async (req, res) => {
  const i = db.data.friends.findIndex(
    (x) => x.id === req.params.rel && (x.a === req.user.id || x.b === req.user.id),
  )
  if (i === -1) return res.status(404).json({ error: 'nao encontrado' })
  db.data.friends.splice(i, 1)
  await db.write()
  res.json({ ok: true })
})

export default r
