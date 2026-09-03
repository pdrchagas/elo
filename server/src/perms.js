import { db } from './db.js'

export function isAppAdmin(userId) {
  return !!db.data.users.find((u) => u.id === userId)?.isAdmin
}

export function isServerOwner(server, userId) {
  return server.ownerId === userId || isAppAdmin(userId)
}

// perm: 'canKick' | 'canMute' | 'canMove'
export function memberCan(server, userId, perm) {
  if (!server) return false
  if (isServerOwner(server, userId)) return true
  const m = db.data.members.find((x) => x.serverId === server.id && x.userId === userId)
  if (!m) return false
  const roleIds = m.roleIds || []
  return db.data.roles.some(
    (r) => r.serverId === server.id && roleIds.includes(r.id) && r[perm],
  )
}

export function serverOfChannel(channelId) {
  const ch = db.data.channels.find((c) => c.id === channelId)
  if (!ch) return null
  return db.data.servers.find((s) => s.id === ch.serverId) || null
}
