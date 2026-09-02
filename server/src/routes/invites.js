import { Router } from 'express'
import { db, nanoid } from '../db.js'
import { authMiddleware } from '../auth.js'

const r = Router()
r.use(authMiddleware)

// cria um convite (para o app ou para um servidor especifico)
r.post('/', async (req, res) => {
  const { kind = 'app', serverId = null, maxUses = 0, expiresInHours = 0 } = req.body || {}

  if (kind === 'server') {
    const member = db.data.members.find((m) => m.serverId === serverId && m.userId === req.user.id)
    if (!member) return res.status(403).json({ error: 'voce nao participa desse servidor' })
  }

  const rec = {
    code: nanoid(10),
    kind: kind === 'server' ? 'server' : 'app',
    serverId: kind === 'server' ? serverId : null,
    createdBy: req.user.id,
    maxUses: Number(maxUses) || 0,
    uses: 0,
    expiresAt: expiresInHours ? Date.now() + Number(expiresInHours) * 3600e3 : 0,
    createdAt: Date.now(),
  }
  db.data.invites.push(rec)
  await db.write()
  res.json({ invite: rec })
})

// lista os convites que eu criei
r.get('/', (req, res) => {
  res.json({ invites: db.data.invites.filter((i) => i.createdBy === req.user.id) })
})

r.delete('/:code', async (req, res) => {
  const i = db.data.invites.findIndex((x) => x.code === req.params.code && x.createdBy === req.user.id)
  if (i === -1) return res.status(404).json({ error: 'nao encontrado' })
  db.data.invites.splice(i, 1)
  await db.write()
  res.json({ ok: true })
})

export default r
