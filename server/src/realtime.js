import { db } from './db.js'

// Presenca (quem esta online) + notificacoes em tempo real para telas especificas.

let ioRef = null
const online = new Map() // userId -> Set<socketId>

export function initRealtime(io) {
  ioRef = io
}

// chamado dentro do handler de conexao do socket
export function trackPresence(socket) {
  const uid = socket.user.id
  socket.join(`user:${uid}`)

  if (!online.has(uid)) online.set(uid, new Set())
  const set = online.get(uid)
  const wasOffline = set.size === 0
  set.add(socket.id)
  if (wasOffline) broadcastPresence(uid, true)

  socket.on('disconnect', () => {
    const s = online.get(uid)
    if (!s) return
    s.delete(socket.id)
    if (s.size === 0) {
      online.delete(uid)
      broadcastPresence(uid, false)
    }
  })
}

export function isOnline(userId) {
  return online.has(userId)
}

export function onlineUserIds() {
  return [...online.keys()]
}

export function notifyUser(userId, event, payload) {
  ioRef?.to(`user:${userId}`).emit(event, payload)
}

export function notifyUsers(userIds, event, payload) {
  for (const id of new Set(userIds)) notifyUser(id, event, payload)
}

// avisa todos os membros de um servidor (menos, opcionalmente, um usuario)
export function notifyServer(serverId, event, payload, exceptUserId = null) {
  const ids = db.data.members
    .filter((m) => m.serverId === serverId && m.userId !== exceptUserId)
    .map((m) => m.userId)
  notifyUsers(ids, event, payload)
}

// usuarios que "conhecem" alguem: amigos + quem divide servidor
function relatedUserIds(userId) {
  const ids = new Set()
  for (const f of db.data.friends) {
    if (f.a === userId) ids.add(f.b)
    else if (f.b === userId) ids.add(f.a)
  }
  const myServers = db.data.members.filter((m) => m.userId === userId).map((m) => m.serverId)
  for (const m of db.data.members) {
    if (myServers.includes(m.serverId)) ids.add(m.userId)
  }
  ids.delete(userId)
  return [...ids]
}

function broadcastPresence(userId, isOnlineNow) {
  notifyUsers(relatedUserIds(userId), 'presence', { userId, online: isOnlineNow })
}
