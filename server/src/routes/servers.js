import { Router } from 'express'
import { db, nanoid } from '../db.js'
import { authMiddleware } from '../auth.js'
import { publicUser } from './auth.js'
import { messages } from '../messages.js'
import { notifyUser, notifyServer, isOnline } from '../realtime.js'

const r = Router()
r.use(authMiddleware)

const SERVER_COLORS = ['#5865F2', '#EB459E', '#57F287', '#FAA61A', '#ED4245', '#00A8FC']

function isMember(serverId, userId) {
  return db.data.members.find((m) => m.serverId === serverId && m.userId === userId)
}

// canal que pertence a ESSE servidor (evita trocar o id na URL e ler outro servidor)
function channelOf(serverId, channelId, type) {
  return db.data.channels.find(
    (c) => c.id === channelId && c.serverId === serverId && (!type || c.type === type),
  )
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
        return u ? { ...publicUser(u), role: m.role, online: isOnline(u.id) } : null
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
  const meUser = db.data.users.find((u) => u.id === req.user.id)
  if (!meUser?.isAdmin) return res.status(403).json({ error: 'so o admin pode criar servidores' })
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

  const friendIds = Array.isArray(req.body?.friendIds) ? req.body.friendIds.slice(0, 50) : []
  const added = []
  for (const fid of friendIds) {
    const ok = db.data.friends.find(
      (f) =>
        f.status === 'accepted' &&
        ((f.a === req.user.id && f.b === fid) || (f.a === fid && f.b === req.user.id)),
    )
    if (ok && !isMember(s.id, fid)) {
      db.data.members.push({ serverId: s.id, userId: fid, role: 'member' })
      added.push(fid)
    }
  }

  await db.write()
  for (const fid of added) notifyUser(fid, 'sync', { scope: 'servers' })
  res.json({ server: hydrate(s, req.user.id) })
})

r.get('/:id', (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s || !isMember(s.id, req.user.id)) return res.status(404).json({ error: 'nao encontrado' })
  res.json({ server: hydrate(s, req.user.id) })
})

// lista de membros com status online — atualiza via evento "presence" no socket
r.get('/:id/members', (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s || !isMember(s.id, req.user.id)) return res.status(404).json({ error: 'nao encontrado' })
  res.json({ members: hydrate(s, req.user.id).members })
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
  notifyServer(s.id, 'sync', { scope: 'servers' }, req.user.id)
  res.json({ server: hydrate(s, req.user.id) })
})

r.delete('/:id/channels/:cid', async (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s || s.ownerId !== req.user.id) return res.status(403).json({ error: 'so o dono pode remover canais' })
  const ch = channelOf(s.id, req.params.cid)
  if (!ch) return res.status(404).json({ error: 'canal nao encontrado' })
  db.data.channels = db.data.channels.filter((c) => c.id !== ch.id)
  await messages.deleteChannels([ch.id])
  await db.write()
  notifyServer(s.id, 'sync', { scope: 'servers' }, req.user.id)
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
  if (!isMember(s.id, userId)) {
    db.data.members.push({ serverId: s.id, userId, role: 'member' })
    await db.write()
    notifyUser(userId, 'sync', { scope: 'servers' })
    notifyServer(s.id, 'sync', { scope: 'servers' }, req.user.id)
  }
  res.json({ server: hydrate(s, req.user.id) })
})

r.post('/:id/leave', async (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s) return res.status(404).json({ error: 'nao encontrado' })
  if (s.ownerId === req.user.id) return res.status(400).json({ error: 'o dono nao pode sair; apague o servidor' })
  db.data.members = db.data.members.filter((m) => !(m.serverId === s.id && m.userId === req.user.id))
  await db.write()
  notifyServer(s.id, 'sync', { scope: 'servers' })
  res.json({ ok: true })
})

r.delete('/:id', async (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s || s.ownerId !== req.user.id) return res.status(403).json({ error: 'so o dono apaga o servidor' })
  const memberIds = db.data.members.filter((m) => m.serverId === s.id).map((m) => m.userId)
  const chans = db.data.channels.filter((c) => c.serverId === s.id).map((c) => c.id)
  db.data.servers = db.data.servers.filter((x) => x.id !== s.id)
  db.data.members = db.data.members.filter((m) => m.serverId !== s.id)
  db.data.channels = db.data.channels.filter((c) => c.serverId !== s.id)
  db.data.invites = db.data.invites.filter((i) => i.serverId !== s.id)
  await messages.deleteChannels(chans)
  await db.write()
  for (const uid of memberIds) notifyUser(uid, 'sync', { scope: 'servers' })
  res.json({ ok: true })
})

// entrar num servidor via convite
r.post('/join/:code', async (req, res) => {
  const inv = db.data.invites.find((i) => i.code === req.params.code && i.kind === 'server')
  if (!inv) return res.status(404).json({ error: 'convite de servidor invalido' })
  if (inv.expiresAt && Date.now() > inv.expiresAt) return res.status(403).json({ error: 'convite expirado' })
  if (inv.maxUses && inv.uses >= inv.maxUses) return res.status(403).json({ error: 'convite esgotado' })
  const s = db.data.servers.find((x) => x.id === inv.serverId)
  if (!s) return res.status(404).json({ error: 'esse servidor nao existe mais' })
  if (!isMember(s.id, req.user.id)) {
    db.data.members.push({ serverId: s.id, userId: req.user.id, role: 'member' })
    inv.uses++
    await db.write()
    notifyServer(s.id, 'sync', { scope: 'servers' }, req.user.id)
  }
  res.json({ server: hydrate(s, req.user.id) })
})

// historico de mensagens de um canal de texto (do servidor certo)
r.get('/:id/channels/:cid/messages', async (req, res) => {
  const s = db.data.servers.find((x) => x.id === req.params.id)
  if (!s || !isMember(s.id, req.user.id)) return res.status(404).json({ error: 'nao encontrado' })
  if (!channelOf(s.id, req.params.cid, 'text')) return res.status(404).json({ error: 'canal nao encontrado' })

  const list = await messages.list(req.params.cid)
  const out = list.map((m) => {
    const u = db.data.users.find((x) => x.id === m.userId)
    return {
      id: m.id,
      content: m.content || '',
      image: m.image || null,
      sticker: m.sticker || null,
      createdAt: m.createdAt,
      author: u ? publicUser(u) : null,
    }
  })
  res.json({ messages: out })
})

export default r
