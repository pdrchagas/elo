import { Router } from 'express'
import { db, nanoid } from '../db.js'
import { authMiddleware } from '../auth.js'

const r = Router()
r.use(authMiddleware)

function me(req) {
  return db.data.users.find((u) => u.id === req.user.id)
}

// cria um convite (para o app ou para um servidor especifico)
r.post('/', async (req, res) => {
  const { kind = 'app', serverId = null } = req.body || {}
  // defaults: convite expira em 7 dias e vale pra 20 pessoas (evita link vazado virar acesso livre)
  let maxUses = req.body?.maxUses != null ? Number(req.body.maxUses) : 20
  let expiresInHours = req.body?.expiresInHours != null ? Number(req.body.expiresInHours) : 24 * 7
  maxUses = Math.max(0, Math.min(maxUses || 0, 200))
  expiresInHours = Math.max(0, Math.min(expiresInHours || 0, 24 * 30))

  if (kind === 'app') {
    // convite de ACESSO AO APP: so o admin cria
    if (!me(req)?.isAdmin) return res.status(403).json({ error: 'so o admin gera convite de acesso ao app' })
  } else {
    const member = db.data.members.find((m) => m.serverId === serverId && m.userId === req.user.id)
    if (!member) return res.status(403).json({ error: 'voce nao participa desse servidor' })
  }

  const rec = {
    code: nanoid(12),
    kind: kind === 'server' ? 'server' : 'app',
    serverId: kind === 'server' ? serverId : null,
    createdBy: req.user.id,
    maxUses,
    uses: 0,
    expiresAt: expiresInHours ? Date.now() + expiresInHours * 3600e3 : 0,
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
