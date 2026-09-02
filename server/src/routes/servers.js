import { Router } from 'express'
import { db, nanoid } from '../db.js'
import { authMiddleware } from '../auth.js'
import { publicUser } from './auth.js'

const r = Router()
r.use(authMiddleware)

const SERVER_COLORS = ['#5865F2', '#EB459E', '#57F287', '#FAA61A', '#ED4245', '#00A8FC']

function isMember(serverId, userId) {
  return db.data.members.find((m) => m.serverId === serverId && m.userId === userId)
}

function hydrate(s, uid) {
  return {
    id: s.id,
    name: s.name,
    color: s.color,
    ownerId: s.ownerId,
    isOwner: s.ownerId === uid,
    channels: db.data.channels
      .filter((c) => c.serverId === s.id)
      .sort((a, b) => a.position - b.position),
    members: db.data.members
      .filter((m) => m.serverId === s.id)
      .map((m) => {
        const u = db.data.users.find((x) => x.id === m.userId)
        return u ? { ...publicUser(u), role: m.role } : null
      })
      .filter(Boolean),
  }
}

r.get('/', (req, res) => {
  const mine = db.data.members.filter((m) => m.userId === req.user.id).map((m) => m.serverId)
  const servers = db.data.servers
    .filter((s) => mine.includes(s.id))
    .map((s) => hydrate(s, req.user.id))
  res.json({ servers })
})

r.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'da um nome pro servidor' })
  const s = {
    id: nanoid(),
    name: name.slice(0, 40),
    ownerId: req.user.id,
    color: SERVER_COLORS[db.data.servers.length % SERVER_COLORS.length],
    createdAt: Date.now(),
  }
  db.data.servers.push(s)
  db.data.members.push({ serverId: s.id, userId: req.user.id, role: 'owner' })
  db.data.channels.push({ id: nanoid(), serverId: s.id, name: 'geral', type: 'text', position: 0 })
  db.data.channels.push({ id: nanoid(), serverId: s.id, name: 'Sala de voz', type: 'voice', position: 1 })

  // adiciona amigos escolhidos na criacao
  const friendIds = Array.isArray(req.body?.friendIds) ? req.body.friendIds : []
  for (const fid of friendIds) {
    const ok = db.data.friends.find(
      (f) =>
        f.status === 'accepted' &&
        ((f.a === req.user.id && f.b === fid) || (f.a === fid && f.b === req.user.id)),
    )
    if (ok && !isMember(s.id, fid)) db.data.members.push({ serverId: s.id, userId: fid, role: 'member' })
  }

  await db.write()
  res.json({ server: hydrate(s, req.user.id) })
})

r.get('/:id', (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s || !isMember(s.id, req.user.id)) return res.status(404).json({ error: 'nao encontrado' })
  res.json({ server: hydrate(s, req.user.id) })
})

r.post('/:id/channels', async (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s || !isMember(s.id, req.user.id)) return res.status(404).json({ error: 'nao encontrado' })
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'da um nome pro canal' })
  const ch = {
    id: nanoid(),
    serverId: s.id,
    name: name.slice(0, 40),
    type: req.body?.type === 'voice' ? 'voice' : 'text',
    position: db.data.channels.filter((c) => c.serverId === s.id).length,
  }
  db.data.channels.push(ch)
  await db.write()
  res.json({ server: hydrate(s, req.user.id) })
})

r.delete('/:id/channels/:cid', async (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s || s.ownerId !== req.user.id) return res.status(403).json({ error: 'so o dono pode remover canais' })
  const i = db.data.channels.findIndex((c) => c.id === req.params.cid && c.serverId === s.id)
  if (i === -1) return res.status(404).json({ error: 'canal nao encontrado' })
  db.data.channels.splice(i, 1)
  db.data.messages = db.data.messages.filter((m) => m.channelId !== req.params.cid)
  await db.write()
  res.json({ server: hydrate(s, req.user.id) })
})

// adiciona um amigo direto ao servidor
r.post('/:id/members', async (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s || !isMember(s.id, req.user.id)) return res.status(404).json({ error: 'nao encontrado' })
  const { userId } = req.body || {}
  const isFriend = db.data.friends.find(
    (f) =>
      f.status === 'accepted' &&
      ((f.a === req.user.id && f.b === userId) || (f.a === userId && f.b === req.user.id)),
  )
  if (!isFriend) return res.status(400).json({ error: 'so da pra adicionar quem ja e seu amigo' })
  if (!isMember(s.id, userId)) db.data.members.push({ serverId: s.id, userId, role: 'member' })
  await db.write()
  res.json({ server: hydrate(s, req.user.id) })
})

r.post('/:id/leave', async (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s) return res.status(404).json({ error: 'nao encontrado' })
  if (s.ownerId === req.user.id) return res.status(400).json({ error: 'o dono nao pode sair; apague o servidor' })
  db.data.members = db.data.members.filter((m) => !(m.serverId === s.id && m.userId === req.user.id))
  await db.write()
  res.json({ ok: true })
})

r.delete('/:id', async (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s || s.ownerId !== req.user.id) return res.status(403).json({ error: 'so o dono apaga o servidor' })
  const chans = db.data.channels.filter((c) => c.serverId === s.id).map((c) => c.id)
  db.data.servers = db.data.servers.filter((x) => x.id !== s.id)
  db.data.members = db.data.members.filter((m) => m.serverId !== s.id)
  db.data.channels = db.data.channels.filter((c) => c.serverId !== s.id)
  db.data.messages = db.data.messages.filter((m) => !chans.includes(m.channelId))
  db.data.invites = db.data.invites.filter((i) => i.serverId !== s.id)
  await db.write()
  res.json({ ok: true })
})

// entrar num servidor via convite
r.post('/join/:code', async (req, res) => {
  const inv = db.data.invites.find((i) => i.code === req.params.code && i.kind === 'server')
  if (!inv) return res.status(404).json({ error: 'convite de servidor invalido' })
  if (inv.expiresAt && Date.now() > inv.expiresAt) return res.status(403).json({ error: 'convite expirado' })
  const s = db.data.servers.find((x) => x.id === inv.serverId)
  if (!s) return res.status(404).json({ error: 'esse servidor nao existe mais' })
  if (!isMember(s.id, req.user.id)) {
    db.data.members.push({ serverId: s.id, userId: req.user.id, role: 'member' })
    inv.uses++
  }
  await db.write()
  res.json({ server: hydrate(s, req.user.id) })
})

// historico de mensagens de um canal de texto
r.get('/:id/channels/:cid/messages', (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s || !isMember(s.id, req.user.id)) return res.status(404).json({ error: 'nao encontrado' })
  const msgs = db.data.messages
    .filter((m) => m.channelId === req.params.cid)
    .slice(-100)
    .map((m) => {
      const u = db.data.users.find((x) => x.id === m.userId)
      return { id: m.id, content: m.content, createdAt: m.createdAt, author: u ? publicUser(u) : null }
    })
  res.json({ messages: msgs })
})

export default r
