import { mongoClient } from './db.js'

// Espelho legivel dos usuarios numa colecao propria do Mongo (elo.users),
// so pra voce conseguir ver no Data Explorer quem esta cadastrado.
// NAO guarda senha. A fonte de verdade continua sendo state.data.users.

let col = null
if (mongoClient) {
  col = mongoClient.db(process.env.MONGODB_DB || 'elo').collection('users')
}

function shape(u) {
  return {
    username: u.username,
    displayName: u.displayName,
    isAdmin: !!u.isAdmin,
    createdAt: u.createdAt || 0,
    createdAtISO: u.createdAt ? new Date(u.createdAt).toISOString() : null,
    lastLogin: u.lastLogin || 0,
    lastLoginISO: u.lastLogin ? new Date(u.lastLogin).toISOString() : null,
    loginCount: u.loginCount || 0,
  }
}

export async function syncUser(u) {
  if (!col || !u) return
  try {
    await col.updateOne({ _id: u.id }, { $set: shape(u) }, { upsert: true })
  } catch {}
}

export async function removeUser(id) {
  if (!col) return
  try {
    await col.deleteOne({ _id: id })
  } catch {}
}

export async function syncAll(users) {
  if (!col) return
  for (const u of users) await syncUser(u)
}
