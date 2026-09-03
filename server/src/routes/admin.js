import { Router } from 'express'
import { db } from '../db.js'
import { authMiddleware } from '../auth.js'
import { messages } from '../messages.js'
import { isOnline, notifyUser } from '../realtime.js'
import { syncUser, removeUser } from '../projection.js'

const r = Router()
r.use(authMiddleware)

// so o admin do app
r.use((req, res, next) => {
  const me = db.data.users.find((u) => u.id === req.user.id)
  if (!me?.isAdmin) return res.status(403).json({ error: 'so o admin' })
  req.me = me
  next()
})

// backup completo (baixa um JSON com tudo — guarde num lugar seguro)
r.get('/backup', async (req, res) => {
  const backup = {
    _elo_backup: 1,
    generatedAt: new Date().toISOString(),
    state: db.data,
    messages: await messages.all().catch(() => []),
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  res.setHeader('Content-Disposition', `attachment; filename="elo-backup-${stamp}.json"`)
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(backup, null, 2))
})

// lista de todos que se cadastraram (para administrar quem entrou ou nao)
r.get('/users', (req, res) => {
  const users = db.data.users
    .map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      color: u.color,
      avatar: u.avatar || null,
      isAdmin: !!u.isAdmin,
      online: isOnline(u.id),
      createdAt: u.createdAt || 0,
      lastLogin: u.lastLogin || 0,
      loginCount: u.loginCount || 0,
      servers: db.data.members.filter((m) => m.userId === u.id).length,
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
  res.json({ users })
})

// promover / rebaixar admin
r.post('/users/:id/admin', async (req, res) => {
  const u = db.data.users.find((x) => x.id === req.params.id)
  if (!u) return res.status(404).json({ error: 'nao encontrado' })
  if (u.id === req.me.id) return res.status(400).json({ error: 'voce nao pode mudar seu proprio admin' })
  u.isAdmin = !u.isAdmin
  await db.write()
  syncUser(u)
  notifyUser(u.id, 'sync', { scope: 'all' })
  res.json({ ok: true, isAdmin: u.isAdmin })
})

// remover a conta de alguem (tira acesso ao site)
r.delete('/users/:id', async (req, res) => {
  const u = db.data.users.find((x) => x.id === req.params.id)
  if (!u) return res.status(404).json({ error: 'nao encontrado' })
  if (u.id === req.me.id) return res.status(400).json({ error: 'voce nao pode apagar a sua conta aqui' })

  // servidores que essa pessoa era dona -> apaga junto
  const ownedServers = db.data.servers.filter((s) => s.ownerId === u.id).map((s) => s.id)
  const orphanChannels = db.data.channels
    .filter((c) => ownedServers.includes(c.serverId))
    .map((c) => c.id)

  db.data.servers = db.data.servers.filter((s) => !ownedServers.includes(s.id))
  db.data.channels = db.data.channels.filter((c) => !ownedServers.includes(c.serverId))
  db.data.members = db.data.members.filter((m) => m.userId !== u.id && !ownedServers.includes(m.serverId))
  db.data.friends = db.data.friends.filter((f) => f.a !== u.id && f.b !== u.id)
  db.data.invites = db.data.invites.filter((i) => i.createdBy !== u.id)
  db.data.users = db.data.users.filter((x) => x.id !== u.id)
  await messages.deleteChannels(orphanChannels)
  await db.write()
  removeUser(u.id)

  notifyUser(u.id, 'kicked', {})
  res.json({ ok: true })
})

export default r
