import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSONFilePreset } from 'lowdb/node'
import { nanoid } from 'nanoid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })
const file = path.join(dataDir, 'db.json')

const defaultData = {
  users: [],     // { id, username, displayName, passwordHash, color, isAdmin, createdAt }
  invites: [],    // { code, kind:'app'|'server', serverId, createdBy, maxUses, uses, expiresAt, createdAt }
  friends: [],    // { id, a, b, status:'pending'|'accepted', requestedBy }
  servers: [],    // { id, name, ownerId, color, createdAt }
  members: [],    // { serverId, userId, role }
  channels: [],   // { id, serverId, name, type:'text'|'voice', position }
  messages: [],   // { id, channelId, userId, content, createdAt }
}

export const db = await JSONFilePreset(file, defaultData)
// garante que campos novos existam mesmo em bancos antigos
for (const key of Object.keys(defaultData)) db.data[key] ??= defaultData[key]
await db.write()

export { nanoid }
